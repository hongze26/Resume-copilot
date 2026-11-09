// 执行器：逐项写入、核验、记录撤销日志。执行期间拦截任何表单提交。
import type { ExecItem, ExecResult } from '../core/plan/types';
import { norm } from '../core/normalize/text';
import { ForbiddenActionError, settle } from './dom';
import { clearControl, closeCategoryModal, closeDropdownOf, drive, snapshot } from './drivers';
import { registry, relocate } from './scan';
import type { SiteDom } from './site';
import { mark } from './overlay';

interface UndoEntry {
  key: string;
  label: string;
  kind: string;
  el: Element;
  before: string;
  after: string;
  value: ExecItem['value'];
}

const undoLogs = new Map<string, UndoEntry[]>();
let lastRunId: string | undefined;
let submitBlocked = 0;

/** 执行期间的提交拦截：document 捕获阶段先于 React 根节点的监听器。 */
function blockSubmit(e: Event) {
  e.preventDefault();
  e.stopImmediatePropagation();
  submitBlocked++;
}

function blockEnter(e: KeyboardEvent) {
  if (e.key === 'Enter' && e.isTrusted === false) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

export function getSubmitBlockedCount(): number {
  return submitBlocked;
}

export async function execute(runId: string, items: ExecItem[], onProgress?: (done: number, total: number, label: string) => void, site?: SiteDom): Promise<ExecResult[]> {
  const results: ExecResult[] = [];
  const log: UndoEntry[] = [];
  undoLogs.set(runId, log);
  lastRunId = runId;
  document.addEventListener('submit', blockSubmit, true);
  document.addEventListener('keydown', blockEnter, true);
  try {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      onProgress?.(i, items.length, it.label);
      // 前一项让网站重画了表单（如选“至今”）：按字段名找回新的控件
      if (site && registry.get(it.fieldKey) && !registry.get(it.fieldKey)!.el.isConnected) {
        await settle(150);
        relocate(site, it.fieldKey);
      }
      const reg = registry.get(it.fieldKey);
      if (!reg || !reg.el.isConnected) {
        results.push({ fieldKey: it.fieldKey, label: it.label, status: 'failed', reason: 'unrecognized', detail: '网页把这一块重新刷新了，工具没找到这一栏；点“重新扫描”再试' });
        continue;
      }
      const el = reg.el;
      const kind = it.kind;
      const before = snapshot(el, kind);
      if (before.trim() !== '' && !it.allowOverwrite) {
        // 网站已自动带出同样的值（如选了境外院校后“是否有海外学习经历”自动为“有”）：视为完成，依赖字段不算失败
        const want = it.value.t === 'text' || it.value.t === 'option' || it.value.t === 'radio' ? [it.value.text, ...(('accept' in it.value && it.value.accept) || [])] : [];
        if (want.some((w) => norm(w) === norm(before))) {
          results.push({ fieldKey: it.fieldKey, label: it.label, status: 'ok', detail: '页面已是这个值' });
          mark(el, 'ok');
          continue;
        }
        results.push({ fieldKey: it.fieldKey, label: it.label, status: 'skipped', reason: 'has-value' });
        mark(el, 'skip');
        continue;
      }
      mark(el, 'active');
      try {
        (el as HTMLElement).scrollIntoView?.({ block: 'center', behavior: 'instant' as ScrollBehavior });
        const r = await drive(el, kind, it.value);
        const after = snapshot(el, kind);
        if (r.ok) {
          log.push({ key: it.fieldKey, label: it.label, kind, el, before, after, value: it.value });
          results.push({ fieldKey: it.fieldKey, label: it.label, status: 'ok', undoable: true, ...(r.detail ? { detail: r.detail } : {}) });
          mark(el, 'ok');
        } else {
          // 失败但页面已被改动（少见）：同样记录，允许撤销
          if (after !== before) log.push({ key: it.fieldKey, label: it.label, kind, el, before, after, value: it.value });
          results.push({ fieldKey: it.fieldKey, label: it.label, status: 'failed', reason: r.reason, detail: r.detail, candidates: r.candidates, undoable: after !== before });
          mark(el, 'fail');
        }
      } catch (e) {
        if (kind === 'select' || kind === 'remote-select') await closeDropdownOf(el).catch(() => undefined);
        if (it.value.t === 'popup-pick') await closeCategoryModal().catch(() => undefined);
        const forbidden = e instanceof ForbiddenActionError;
        results.push({ fieldKey: it.fieldKey, label: it.label, status: 'failed', reason: forbidden ? 'aborted' : 'verify-failed', detail: forbidden ? (e as Error).message : '填写时出错了' });
        mark(el, 'fail');
        if (forbidden) break;
      }
      await settle(60);
    }
  } finally {
    document.removeEventListener('submit', blockSubmit, true);
    document.removeEventListener('keydown', blockEnter, true);
  }
  onProgress?.(items.length, items.length, '');
  return results;
}

/** 撤销：只恢复“当前值仍等于本次写入值”的字段；用户之后改过的保留。 */
export async function undo(runId?: string): Promise<ExecResult[]> {
  const id = runId ?? lastRunId;
  const log = id ? undoLogs.get(id) : undefined;
  if (!log) return [];
  const results: ExecResult[] = [];
  document.addEventListener('submit', blockSubmit, true);
  try {
    for (const e of [...log].reverse()) {
      const base = { fieldKey: e.key, label: e.label };
      if (!e.el.isConnected) {
        results.push({ ...base, status: 'skipped', reason: 'unrecognized', detail: '表单已保存或已关闭，无法撤销；如需删除请在页面上手动操作' });
        continue;
      }
      const cur = snapshot(e.el, e.kind);
      if (cur !== e.after) {
        results.push({ ...base, status: 'skipped', reason: 'has-value', detail: '你之后修改过，保留你的修改' });
        continue;
      }
      let ok = false;
      if (e.before.trim() === '') {
        if (e.kind === 'text' || e.kind === 'textarea' || e.kind === 'number') {
          ok = (await drive(e.el, e.kind, { t: 'text', text: '' }).catch(() => ({ ok: false }))).ok || snapshot(e.el, e.kind) === '';
        } else {
          ok = await clearControl(e.el, e.kind);
        }
      } else if (e.kind === 'text' || e.kind === 'textarea' || e.kind === 'number') {
        ok = (await drive(e.el, e.kind, { t: 'text', text: e.before })).ok;
      } else if (e.kind === 'select' || e.kind === 'radio-button' || e.kind === 'native-select' || e.kind === 'radio') {
        ok = (await drive(e.el, e.kind, { t: 'option', text: e.before, search: e.before })).ok;
      }
      results.push(ok ? { ...base, status: 'ok' } : { ...base, status: 'failed', reason: 'not-supported', detail: e.kind === 'radio-button' ? '单选项无法恢复为“未选择”，请手动处理' : '无法安全恢复，请手动处理' });
      if (ok) mark(e.el, 'none');
    }
  } finally {
    document.removeEventListener('submit', blockSubmit, true);
  }
  undoLogs.delete(id!);
  return results;
}

export function hasUndo(runId?: string): boolean {
  const id = runId ?? lastRunId;
  return !!id && (undoLogs.get(id)?.length ?? 0) > 0;
}
