// 扫描 → 计划 → 填写 → 撤销 的流程（内置适配器与通用页面共用）。
import { ADAPTERS } from '../../adapters/registry';
import { MSG_VERSION, type Response } from '../../core/messages';
import { buildPlan } from '../../core/plan/plan';
import type { ExecItem, ExecResult, FieldDescriptor, FillValue, PlanItem } from '../../core/plan/types';
import { toast } from '../shared/ui';
import { state, pickAdapter, domId, applySections, splitGroupId, type Choice, type FormPlan } from './state';
import { anchorOf, setPendingFocus } from './scroll';
import { send, ensureContent } from './bridge';
import { sectionCollection, boundRecord } from './records';
import { render } from './render';

// ---------------- 扫描与计划 ----------------

export function planFor(sectionKey: string, formIndex: number, fields: FieldDescriptor[]): FormPlan {
  const col = sectionCollection(sectionKey);
  const record = col ? boundRecord(sectionKey) : undefined;
  const items =
    col && !record
      ? []
      : buildPlan(fields, {
          profile: state.profile!,
          adapter: state.adapter,
          collection: col ?? 'single',
          record,
          allowOverwrite: state.settings?.allowOverwrite,
        });
  const choices = new Map<string, Choice>();
  // “高”默认勾选；“中”大致相同也先填上（选第一个候选、日期按 1 日补齐），本人之后在网页上核对。
  // 自我评价等长文本有多段可选时不替本人挑。
  for (const it of items) {
    const pick = it.value ?? (it.level === 'medium' && it.candidates?.length && (!it.longtext || it.candidates.length === 1) ? it.candidates[0].value : undefined);
    choices.set(it.fieldKey, { checked: (it.level === 'high' || it.level === 'medium') && !!pick, value: pick });
  }
  if (record) state.activeRecord.set(sectionKey, record.id);
  return { id: `${sectionKey}:${formIndex}`, sectionKey, formIndex, record, items, choices, state: 'preview', runIds: [] };
}

export function groupFields(fields: FieldDescriptor[]): Map<string, FieldDescriptor[]> {
  const m = new Map<string, FieldDescriptor[]>();
  for (const f of fields) {
    const id = `${f.sectionKey}:${f.formIndex}`;
    if (!m.has(id)) m.set(id, []);
    m.get(id)!.push(f);
  }
  return m;
}

/** 预计划 → 探测已匹配的下拉/日期 → 合并 → 正式计划。 */
export async function probeAndMerge(fields: FieldDescriptor[], plannedItems: PlanItem[]): Promise<FieldDescriptor[]> {
  const keys = plannedItems
    .filter((it) => it.path && (it.level === 'high' || it.level === 'medium') && (it.kind === 'select' || it.kind === 'date' || it.kind === 'date-range'))
    .map((it) => it.fieldKey);
  if (keys.length === 0) return fields;
  const r = await send<Extract<Response, { type: 'rc/probe' }>>({ type: 'rc/probe', version: MSG_VERSION, keys });
  const pm = new Map(r.probes.map((p) => [p.key, p]));
  return fields.map((f) => {
    const p = pm.get(f.key);
    if (!p) return f;
    return {
      ...f,
      options: p.options && p.options.length ? p.options : f.options,
      optionsPartial: p.options && p.options.length ? p.optionsPartial : f.optionsPartial,
      datePrecision: p.datePrecision ?? f.datePrecision,
      hasPresentOption: p.hasPresentOption ?? f.hasPresentOption,
    };
  });
}

export async function refreshSaved(): Promise<void> {
  for (const s of state.sections) {
    if (s.mode !== 'repeat') continue;
    const r = await send<Extract<Response, { type: 'rc/saved-records' }>>({ type: 'rc/saved-records', version: MSG_VERSION, adapterId: domId(), sectionKey: s.key });
    state.savedTexts.set(s.key, r.texts);
  }
}

export async function doScan(sectionKey?: string): Promise<void> {
  state.busy = true;
  state.error = '';
  state.pageNote = '';
  render();
  try {
    await ensureContent();
    const builtin = ADAPTERS.find((a) => a.id === pickAdapter(state.url, state.tabId).id);
    if (builtin) state.adapter = builtin;
    state.fallbackGeneric = false;
    let r = await send<Extract<Response, { type: 'rc/scan' }>>({ type: 'rc/scan', version: MSG_VERSION, adapterId: domId(), sectionKey });
    // 内置适配器在这个页面上找不到它认识的简历区块（改版、其他子页面）：改用通用识别
    if (builtin && !sectionKey && !r.sections.some((s) => builtin.sections.some((x) => x.key === s.key))) {
      state.fallbackGeneric = true;
      r = await send<Extract<Response, { type: 'rc/scan' }>>({ type: 'rc/scan', version: MSG_VERSION, adapterId: 'generic' });
    }
    state.frames = r.frames;
    state.pageSections = r.pageSections ?? [];
    applySections(r.sections);
    await refreshSaved();
    // 扫描会重置页面上的控件登记表，所以全部计划重建
    state.plans.clear();
    const all: PlanItem[] = [];
    for (const [id, fs] of groupFields(r.fields)) {
      const [sk, fi] = splitGroupId(id);
      if (!state.adapter!.sections.find((s) => s.key === sk && s.mode !== 'manual')) continue;
      const pre = planFor(sk, fi, fs);
      const merged = await probeAndMerge(fs, pre.items);
      const fp = planFor(sk, fi, merged);
      state.plans.set(id, fp);
      all.push(...fp.items);
    }
    state.fields = r.fields;
    await highlight(all);
    state.scanned = true;
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
  } finally {
    state.busy = false;
    render();
  }
}

export async function highlight(items: PlanItem[]): Promise<void> {
  if (!state.settings?.highlightOnPage) return;
  const marks = items.map((it) => ({
    key: it.fieldKey,
    state: it.level === 'skip' ? ('skip' as const) : it.level,
    note: it.level === 'low' ? (it.skipReason === 'unrecognized' ? '未识别' : '把握不足') : it.level === 'medium' ? '需确认' : undefined,
  }));
  await send({ type: 'rc/clear-highlight', version: MSG_VERSION }).catch(() => undefined);
  await send({ type: 'rc/highlight', version: MSG_VERSION, marks }).catch(() => undefined);
}

// ---------------- 执行 ----------------

export function newRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function execItemsFrom(fp: FormPlan, items: PlanItem[]): ExecItem[] {
  const out: ExecItem[] = [];
  for (const it of items) {
    const c = fp.choices.get(it.fieldKey);
    if (!c?.checked || !c.value) continue;
    out.push({ fieldKey: it.fieldKey, label: it.label, kind: it.kind, value: c.value, dependency: it.dependency, allowOverwrite: state.settings?.allowOverwrite });
  }
  return out;
}

export async function runExec(fp: FormPlan, items: ExecItem[]): Promise<ExecResult[]> {
  const runId = newRunId();
  fp.runIds.push(runId);
  const r = await send<Extract<Response, { type: 'rc/exec' }>>({ type: 'rc/exec', version: MSG_VERSION, runId, items });
  return r.results;
}

export async function executePlan(fp: FormPlan): Promise<void> {
  if (!state.adapter?.allowExecute) return;
  const chosen = execItemsFrom(fp, fp.items);
  if (chosen.length === 0) {
    toast('没有勾选任何字段', 'warn');
    return;
  }
  fp.state = 'running';
  fp.results = [];
  fp.autoAdded = [];
  fp.stopped = undefined;
  setPendingFocus(anchorOf(`sec:${fp.sectionKey}`));
  render();
  try {
    const deps = chosen.filter((c) => c.dependency);
    const rest = chosen.filter((c) => !c.dependency);
    let restItems = rest;
    if (deps.length > 0) {
      const r1 = await runExec(fp, deps);
      fp.results.push(...r1);
      if (r1.some((x) => x.status !== 'ok')) {
        fp.stopped = '决定字段集合的项（学历等）没有填写成功，为避免后续字段错位或混填，已停止。请手动处理后重新扫描。';
        return;
      }
      // 条件字段出现后重新扫描本区块，按档案路径对应到新的控件
      const confirmedByPath = new Map<string, ExecItem>();
      for (const c of rest) {
        const it = fp.items.find((x) => x.fieldKey === c.fieldKey);
        if (it?.path) confirmedByPath.set(it.path, c);
      }
      const oldPaths = new Set(fp.items.map((x) => x.path).filter(Boolean));
      const sr = await send<Extract<Response, { type: 'rc/scan' }>>({ type: 'rc/scan', version: MSG_VERSION, adapterId: domId(), sectionKey: fp.sectionKey });
      const fs = sr.fields.filter((f) => f.sectionKey === fp.sectionKey && f.formIndex === fp.formIndex);
      const pre = buildPlan(fs, { profile: state.profile!, adapter: state.adapter, collection: sectionCollection(fp.sectionKey) ?? 'single', record: fp.record });
      const merged = await probeAndMerge(fs, pre);
      const plan2 = buildPlan(merged, { profile: state.profile!, adapter: state.adapter, collection: sectionCollection(fp.sectionKey) ?? 'single', record: fp.record });
      restItems = [];
      for (const it of plan2) {
        if (!it.path) continue;
        const prev = confirmedByPath.get(it.path);
        if (prev) {
          // 用户已确认的值，换成新控件 key
          if (it.skipReason === 'has-value') continue;
          restItems.push({ ...prev, fieldKey: it.fieldKey, kind: it.kind });
        } else if (!oldPaths.has(it.path) && it.level === 'high' && it.value && !it.longtext) {
          // 选择学历后新出现的条件字段（高置信）：属于同一条已确认记录，一并填写
          restItems.push({ fieldKey: it.fieldKey, label: it.label, kind: it.kind, value: it.value });
          fp.autoAdded!.push(it.label);
        }
      }
      // 其他区块的计划因重新扫描而失效
      for (const [k, p] of state.plans) if (p !== fp && p.state === 'preview') state.plans.delete(k);
    }
    if (restItems.length > 0) {
      const r2 = await runExec(fp, restItems);
      fp.results.push(...r2);
    }
  } catch (e) {
    fp.stopped = e instanceof Error ? e.message : String(e);
  } finally {
    fp.state = 'done';
    fp.progress = undefined;
    render();
    setPendingFocus(undefined);
  }
}

export async function undoPlan(fp: FormPlan): Promise<void> {
  state.busy = true;
  try {
  const all: ExecResult[] = [];
  for (const id of [...fp.runIds].reverse()) {
    const r = await send<Extract<Response, { type: 'rc/undo' }>>({ type: 'rc/undo', version: MSG_VERSION, runId: id });
    all.push(...r.results);
  }
  fp.runIds = [];
  const ok = all.filter((r) => r.status === 'ok').length;
  const kept = all.filter((r) => r.status !== 'ok');
  toast(`已撤销 ${ok} 项${kept.length ? `，${kept.length} 项未撤销（见结果）` : ''}`, kept.length ? 'warn' : 'ok', 5000);
  fp.results = [...(fp.results ?? []), ...kept.map((k) => ({ ...k, label: `撤销：${k.label}` }))];
  } finally { state.busy = false; render(); }
}

export async function retryWithCandidate(fp: FormPlan, res: ExecResult, cand: string): Promise<void> {
  state.busy = true;
  try {
  const it = fp.items.find((x) => x.fieldKey === res.fieldKey);
  const kind = it?.kind ?? 'select';
  const segs = cand.split(' / ');
  const value: FillValue =
    it?.value?.t === 'popup-pick' && segs.length === 2
      ? { t: 'popup-pick', names: [segs[1]], path: [segs[0], segs[1]] }
      : kind === 'remote-select' && it?.value?.t === 'remote-option'
        ? { t: 'remote-option', query: it.value.query, accept: [cand] }
        : kind === 'radio-button'
          ? { t: 'radio', text: cand }
          : { t: 'option', text: cand, search: cand };
  const r = await runExec(fp, [{ fieldKey: res.fieldKey, label: res.label, kind, value }]);
  fp.results = (fp.results ?? []).map((x) => (x.fieldKey === res.fieldKey ? r[0] : x));
  } finally { state.busy = false; render(); }
}

export async function openForm(sectionKey: string): Promise<void> {
  state.busy = true;
  setPendingFocus(anchorOf(`sec:${sectionKey}`));
  try {
    await ensureContent();
    const r = await send<Extract<Response, { type: 'rc/open-form' }>>({ type: 'rc/open-form', version: MSG_VERSION, adapterId: domId(), sectionKey });
    if (r.status === 'unsaved-form') {
      toast('这个区块里已有一份未保存的表单，请先在页面上保存或取消', 'warn', 6000);
    } else if (r.status === 'no-button') {
      toast('没有找到“添加/编辑”按钮，请在页面上手动展开后点“扫描本页”', 'warn', 6000);
    } else if (r.status === 'timeout') {
      toast('表单没有展开，请稍后重试', 'warn');
    }
    await doScan();
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error');
  } finally {
    state.busy = false;
    render();
    setPendingFocus(undefined);
  }
}

