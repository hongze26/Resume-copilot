// 档案管理页：完整录入、校对、导入导出、删除。数据只存在 chrome.storage.local。
import { emptyProfile, newRecordId } from '../../core/profile/empty';
import { migrateToCurrent, MigrationError } from '../../core/profile/migrate';
import type { Profile } from '../../core/profile/types';
import { canonicalJson, sameJson } from '../../core/profile/compare';
import { validateProfile, type ValidationIssue } from '../../core/profile/validate';
import { applyParsed, COLLECTION_ZH, getIn, isEmptyValue, sameRecord } from '../../core/resume/apply';
import { parseResumeText, type ParsedField, type ParsedRecord, type ParseResult } from '../../core/resume/parse';
import { initAi } from './ai-settings';
import { mergeCustomDefs } from '../../adapters/custom';
import { packBackup, unpackBackup } from '../shared/backup';
import { clearAll, loadCustomAdapters, loadProfile, loadSettings, onProfileChanged, saveCustomAdapters, saveProfile, saveSettings } from '../shared/storage';
import { clear, confirmDialog, downloadText, h, toast } from '../shared/ui';
import { SECTIONS, type FieldSpec, type SectionSpec } from './form-spec';
import sampleProfile from '../../../schema/sample-profile.json';

type Obj = Record<string, unknown>;

let saved: Profile | null = null;
let draft: Profile = emptyProfile();
let dirty = false;
let issues: ValidationIssue[] = [];
let selectionText = '';
let lastFocused: HTMLInputElement | HTMLTextAreaElement | null = null;

const formEl = document.getElementById('form')!;
const statusEl = document.getElementById('status')!;
const sourceEl = document.getElementById('source-text')!;
const sourceInfo = document.getElementById('source-info')!;

// ---------------- 路径工具 ----------------

function setIn(obj: Obj, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]] as Obj;
  }
  const last = keys[keys.length - 1];
  const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  if (empty) delete cur[last];
  else cur[last] = value;
  // 清理空对象（如 emergencyContact、region）
  if (keys.length > 1 && Object.keys(cur).length === 0) {
    const parent = keys.slice(0, -1).join('.');
    const holder = parent.includes('.') ? (getIn(obj, parent.split('.').slice(0, -1).join('.')) as Obj) : obj;
    delete holder[parent.split('.').pop()!];
  }
}

function markDirty() {
  dirty = true;
  renderStatus();
}

// ---------------- 控件 ----------------

function fillButton(target: () => HTMLInputElement | HTMLTextAreaElement | null) {
  return h(
    'button',
    {
      type: 'button',
      class: 'btn btn-small fill-btn',
      title: '把左侧原文中选中的文字填到这里',
      onclick: () => {
        const el = target();
        if (!el) return;
        if (!selectionText) {
          toast('请先在左侧原文中选中文字', 'warn');
          return;
        }
        el.value = selectionText.trim();
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
    },
    '← 填入',
  );
}

function fieldControl(base: Obj, spec: FieldSpec, idBase: string): HTMLElement {
  const id = `${idBase}-${spec.key.replace(/\./g, '-')}`;
  const value = getIn(base, spec.key);
  const label = h('label', { for: id, class: 'f-label' }, spec.label, spec.required ? h('span', { class: 'req' }, ' *') : null, spec.sensitive ? h('span', { class: 'sens', title: '高敏感：只在网站字段完全确定时使用' }, ' 敏感') : null);
  let control: HTMLElement;
  const onText = (el: HTMLInputElement | HTMLTextAreaElement, conv: (v: string) => unknown = (v) => v) => {
    el.addEventListener('focus', () => (lastFocused = el));
    el.addEventListener('input', () => {
      setIn(base, spec.key, conv(el.value));
      markDirty();
    });
  };
  switch (spec.type) {
    case 'text':
    case 'date': {
      const inp = h('input', { id, type: 'text', value: (value as string) ?? '', placeholder: spec.type === 'date' ? '例：2024-09-01' : '', list: spec.datalist ? `${id}-dl` : undefined, autocomplete: 'off' }) as HTMLInputElement;
      onText(inp, (v) => v.trim());
      control = h('div', { class: 'f-row' }, inp, fillButton(() => inp), spec.datalist ? h('datalist', { id: `${id}-dl` }, ...spec.datalist.map((d) => h('option', { value: d }))) : null);
      break;
    }
    case 'textarea': {
      const ta = h('textarea', { id, rows: 4, value: (value as string) ?? '' }) as HTMLTextAreaElement;
      onText(ta);
      control = h('div', { class: 'f-row f-row-top' }, ta, fillButton(() => ta));
      break;
    }
    case 'number': {
      const inp = h('input', { id, type: 'number', step: spec.step ?? 1, value: value === undefined ? '' : String(value) }) as HTMLInputElement;
      onText(inp, (v) => (v.trim() === '' ? undefined : Number(v)));
      control = inp;
      break;
    }
    case 'dateOrPresent': {
      const isPresent = value === 'present';
      const inp = h('input', { id, type: 'text', placeholder: '例：2025-06-30', value: isPresent ? '' : ((value as string) ?? ''), disabled: isPresent }) as HTMLInputElement;
      const cb = h('input', { type: 'checkbox', id: `${id}-present`, checked: isPresent }) as HTMLInputElement;
      inp.addEventListener('input', () => {
        setIn(base, spec.key, inp.value.trim());
        markDirty();
      });
      cb.addEventListener('change', () => {
        inp.disabled = cb.checked;
        setIn(base, spec.key, cb.checked ? 'present' : inp.value.trim());
        markDirty();
      });
      control = h('div', { class: 'f-row' }, inp, h('label', { class: 'inline', for: `${id}-present` }, cb, ' 至今'));
      break;
    }
    case 'enum':
    case 'tri': {
      const sel = h('select', { id }) as HTMLSelectElement;
      sel.append(h('option', { value: '' }, '（未选择）'));
      for (const [v, t] of spec.options ?? []) sel.append(h('option', { value: v }, t));
      sel.value = (value as string) ?? '';
      sel.addEventListener('change', () => {
        setIn(base, spec.key, sel.value || undefined);
        markDirty();
      });
      control = sel;
      break;
    }
    case 'list': {
      const arr = (value as string[] | undefined) ?? [];
      const inp = h('input', { id, type: 'text', value: arr.join('，') }) as HTMLInputElement;
      onText(inp, (v) =>
        v
          .split(/[,，、;；\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
      control = inp;
      break;
    }
    case 'region': {
      const r = (value as Obj | undefined) ?? {};
      const mk = (k: 'province' | 'city' | 'district', ph: string) => {
        const inp = h('input', { id: k === 'province' ? id : `${id}-${k}`, type: 'text', placeholder: ph, value: (r[k] as string) ?? '', 'aria-label': `${spec.label}：${ph}` }) as HTMLInputElement;
        inp.addEventListener('input', () => {
          const cur = { ...((getIn(base, spec.key) as Obj | undefined) ?? {}) };
          const v = inp.value.trim();
          if (v) cur[k] = v;
          else delete cur[k];
          setIn(base, spec.key, cur.province || cur.city || cur.district ? cur : undefined);
          markDirty();
        });
        return inp;
      };
      control = h('div', { class: 'f-row f-region' }, mk('province', '省/直辖市'), mk('city', '市'), mk('district', '区/县（可选）'));
      break;
    }
    case 'regionList': {
      const arr = (value as Obj[] | undefined) ?? [];
      const ta = h('textarea', { id, rows: 3, value: arr.map((r) => [r.province, r.city, r.district].filter(Boolean).join(' ')).join('\n') }) as HTMLTextAreaElement;
      ta.addEventListener('input', () => {
        const list = ta.value
          .split('\n')
          .map((l) => l.trim().split(/\s+/).filter(Boolean))
          .filter((p) => p.length > 0)
          .map(([province, city, district]) => Object.fromEntries(Object.entries({ province, city, district }).filter(([, v]) => v)));
        setIn(base, spec.key, list);
        markDirty();
      });
      control = ta;
      break;
    }
  }
  return h('div', { class: `field ${spec.type === 'textarea' || spec.type === 'regionList' ? 'field-wide' : ''}` }, label, control, spec.hint ? h('div', { class: 'f-hint' }, spec.hint) : null);
}

function renderObjectSection(sec: SectionSpec): HTMLElement {
  const root = draft as unknown as Obj;
  if (typeof root[sec.key] !== 'object' || root[sec.key] === null) root[sec.key] = {};
  const base = root[sec.key] as Obj;
  return h('div', { class: 'grid' }, ...sec.fields.map((f) => fieldControl(base, f, sec.key)));
}

/** 记录卡片的展开状态（按记录 id），重绘后保持。 */
const openState = new Map<string, boolean>();
/** 从简历自动填入、尚未保存的字段路径（高亮提示核对） */
let autoFilled = new Set<string>();

function renderArraySection(sec: SectionSpec): HTMLElement {
  const root = draft as unknown as Obj;
  if (!Array.isArray(root[sec.key])) root[sec.key] = [];
  const arr = root[sec.key] as Obj[];
  const wrap = h('div', { class: 'records' });
  arr.forEach((rec, i) => {
    const title = sec.itemTitle ? sec.itemTitle(rec) : String(i + 1);
    const rid = String(rec.id ?? i);
    const isOpen = openState.get(rid) ?? arr.length <= 2;
    const card = h(
      'details',
      { class: `record${autoFilled.has(`${sec.key}.${rid}`) ? ' autofilled' : ''}`, open: isOpen || undefined, 'data-rec': rid },
      h(
        'summary',
        {},
        h('span', { class: 'rec-title' }, `${i + 1}. ${title}`),
        h(
          'span',
          { class: 'rec-actions' },
          h('button', { type: 'button', class: 'btn btn-small', disabled: i === 0, title: '上移', onclick: (e: Event) => { e.preventDefault(); move(arr, i, -1, sec); } }, '↑'),
          h('button', { type: 'button', class: 'btn btn-small', disabled: i === arr.length - 1, title: '下移', onclick: (e: Event) => { e.preventDefault(); move(arr, i, 1, sec); } }, '↓'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-small btn-danger',
              onclick: async (e: Event) => {
                e.preventDefault();
                if (await confirmDialog('删除这条记录？', `将删除“${title}”。保存后生效。`, '删除', true)) {
                  arr.splice(i, 1);
                  openState.delete(rid);
                  markDirty();
                  rerenderSection(sec);
                }
              },
            },
            '删除',
          ),
        ),
      ),
      h('div', { class: 'grid' }, ...sec.fields.map((f) => fieldControl(rec, f, `${sec.key}-${i}`))),
    );
    card.addEventListener('toggle', () => openState.set(rid, (card as HTMLDetailsElement).open));
    wrap.append(card);
  });
  wrap.append(
    h(
      'button',
      {
        type: 'button',
        class: 'btn',
        onclick: () => {
          const rec: Obj = { id: newRecordId(sec.idPrefix ?? 'rec') };
          if (sec.key === 'languages') rec.language = '英语';
          if (sec.key === 'certificates') rec.status = 'obtained';
          arr.push(rec);
          openState.set(String(rec.id), true);
          markDirty();
          rerenderSection(sec);
          // 定位到新加的这一条并聚焦第一个输入框（不跳回页面顶部）
          const card = formEl.querySelector<HTMLElement>(`[data-rec="${CSS.escape(String(rec.id))}"]`);
          card?.scrollIntoView({ block: 'center' });
          card?.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true });
        },
      },
      `＋ 添加一条${sec.title}`,
    ),
  );
  return wrap;
}

function move(arr: Obj[], i: number, d: number, sec: SectionSpec) {
  const j = i + d;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  markDirty();
  rerenderSection(sec);
}

function buildSection(sec: SectionSpec): HTMLElement {
  const body = sec.kind === 'object' ? renderObjectSection(sec) : renderArraySection(sec);
  return h('section', { class: 'card sec', id: `sec-${sec.key}` }, h('h2', {}, sec.title), sec.hint ? h('p', { class: 'f-hint' }, sec.hint) : null, body);
}

/** 只重绘一个栏目，并保持页面滚动位置（之前整页重绘会让页面跳回顶部）。 */
function rerenderSection(sec: SectionSpec) {
  const y = window.scrollY;
  const old = document.getElementById(`sec-${sec.key}`);
  const fresh = buildSection(sec);
  if (old) old.replaceWith(fresh);
  else formEl.append(fresh);
  markAutoFilled();
  window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
}

function renderForm() {
  const y = window.scrollY;
  // 先固定高度再替换，避免内容清空瞬间页面变短导致滚动位置被截断
  formEl.style.minHeight = `${formEl.offsetHeight}px`;
  clear(formEl);
  const nav = document.getElementById('nav')!;
  clear(nav);
  for (const sec of SECTIONS) {
    nav.append(h('a', { href: `#sec-${sec.key}` }, sec.title));
    formEl.append(buildSection(sec));
  }
  formEl.style.minHeight = '';
  markAutoFilled();
  window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
}

/** 给“从简历填入”的字段加高亮，提醒逐项核对。 */
function markAutoFilled() {
  formEl.querySelectorAll('.field.autofilled').forEach((el) => el.classList.remove('autofilled'));
  for (const p of autoFilled) {
    const [top, rest] = [p.split('.')[0], p.split('.').slice(1).join('.')];
    const sec = SECTIONS.find((s) => s.key === top);
    if (!sec || sec.kind !== 'object') continue;
    const id = `${top}-${rest.replace(/\./g, '-')}`;
    document.getElementById(id)?.closest('.field')?.classList.add('autofilled');
  }
}

// ---------------- 状态栏 ----------------

function renderStatus() {
  clear(statusEl);
  const reviewed = draft.meta.reviewedAt && !dirty;
  statusEl.append(
    h(
      'span',
      { class: `badge ${reviewed ? 'badge-high' : 'badge-medium'}`, 'data-testid': 'review-state' },
      reviewed ? `已核对 ${new Date(draft.meta.reviewedAt!).toLocaleString('zh-CN')}` : '未核对',
    ),
    dirty
      ? h('span', { class: 'badge badge-low', 'data-testid': 'save-state' }, '有未保存的修改')
      : saved
        ? h('span', { class: 'badge badge-high', 'data-testid': 'save-state' }, `已保存 ${new Date(saved.meta.updatedAt).toLocaleTimeString('zh-CN')}`)
        : h('span', { class: 'badge badge-skip', 'data-testid': 'save-state' }, '尚未保存'),
  );
  renderSaveInfo();
  const issuesBox = document.getElementById('issues')!;
  clear(issuesBox);
  if (issues.length) {
    issuesBox.append(
      h('div', { class: 'banner banner-error' }, h('strong', {}, `有 ${issues.length} 处需要修改：`), h('ul', {}, ...issues.slice(0, 20).map((i) => h('li', {}, `${pathLabel(i.path)}：${i.message}`)))),
    );
  }
}

// ---------------- 保存位置与已保存内容 ----------------

const COUNT_KEYS: Array<[string, string]> = [
  ['education', '教育'],
  ['work', '工作/实习'],
  ['projects', '项目'],
  ['languages', '语言'],
  ['certificates', '证书'],
  ['honors', '荣誉'],
  ['textTemplates', '长文本'],
];

function countsOf(p: Profile): string {
  const o = p as unknown as Record<string, unknown[] | undefined>;
  return COUNT_KEYS.map(([k, zh]) => `${zh} ${o[k]?.length ?? 0} 条`).join(' · ');
}

function renderSaveInfo() {
  const box = document.getElementById('save-info');
  if (!box) return;
  const bytes = saved ? new Blob([JSON.stringify(saved)]).size : 0;
  clear(box);
  if (!saved) {
    box.className = 'save-info banner banner-warn';
    box.append(
      h('strong', {}, '还没有保存过档案。'),
      ' 现在填写的内容只在这个页面里；点右上角“保存”（或 Ctrl+S）后才会存进本机浏览器，侧边栏才能使用。',
    );
    return;
  }
  box.className = `save-info banner ${dirty ? 'banner-warn' : 'banner-ok'}`;
  box.append(
    h(
      'div',
      {},
      h('strong', {}, dirty ? '有修改尚未保存。' : '已保存到本机。'),
      ` 位置：这台电脑上本浏览器的扩展存储（chrome.storage.local，键名 profile），不上传。最后保存：${new Date(saved.meta.updatedAt).toLocaleString('zh-CN')}，约 ${(bytes / 1024).toFixed(1)} KB。`,
    ),
    h('div', { class: 'small' }, `已保存：${saved.basic.name || '（未填姓名）'} · ${countsOf(saved)}`),
    h(
      'div',
      { class: 'small' },
      '修改方法：直接在下面改字段 → 点“保存”。刷新本页会从存储重新读取，可以用来确认是否保存成功。',
      ' ',
      h('button', { type: 'button', class: 'btn btn-small', 'data-testid': 'view-saved', onclick: () => void showSaved() }, '查看已保存内容'),
      ' ',
      dirty ? h('button', { type: 'button', class: 'btn btn-small', onclick: () => void discardChanges() }, '放弃修改，恢复到已保存') : null,
    ),
  );
}

/** 直接从存储读出（不是页面上的草稿），证明“保存”确实写进去了。 */
async function showSaved() {
  const stored = await loadProfile();
  const dlg = h('dialog', { class: 'dialog dialog-wide', 'data-testid': 'saved-dialog' }) as HTMLDialogElement;
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  dlg.addEventListener('cancel', close);
  dlg.append(h('h3', {}, '已保存在本机的档案（只读）'));
  if (!stored) {
    dlg.append(h('p', {}, '存储中没有档案。'));
  } else {
    dlg.append(
      h('p', { class: 'small muted' }, `读取自 chrome.storage.local → profile，最后保存 ${new Date(stored.meta.updatedAt).toLocaleString('zh-CN')}${stored.meta.reviewedAt ? `，已核对 ${new Date(stored.meta.reviewedAt).toLocaleString('zh-CN')}` : '，尚未核对'}。`),
      h('p', { class: 'small' }, `${stored.basic.name || '（未填姓名）'} · ${countsOf(stored)}`),
      h('p', { class: 'small muted' }, '这里只用于查看。要修改，请关闭后在档案页面上改，再点“保存”。内容含个人信息，请勿截图外传。'),
      h('textarea', { class: 'saved-json', readonly: true, rows: 18, 'aria-label': '已保存的档案 JSON', value: JSON.stringify(stored, null, 2) }),
    );
  }
  dlg.append(h('div', { class: 'dialog-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: close }, '关闭')));
  document.body.appendChild(dlg);
  dlg.showModal();
}

async function discardChanges() {
  if (!(await confirmDialog('放弃未保存的修改？', '页面会恢复到最后一次保存的内容。', '放弃修改', true))) return;
  saved = await loadProfile();
  draft = saved ? structuredClone(saved) : emptyProfile();
  dirty = false;
  issues = [];
  autoFilled = new Set();
  renderForm();
  renderStatus();
}

function pathLabel(p: string): string {
  const parts = p.split('/').filter(Boolean);
  const sec = SECTIONS.find((s) => s.key === parts[0]);
  if (!sec) return p;
  if (sec.kind === 'array') {
    const idx = Number(parts[1]);
    const f = sec.fields.find((x) => x.key === parts.slice(2).join('.'));
    return `${sec.title} 第 ${idx + 1} 条${f ? ` · ${f.label}` : parts.slice(2).join('.')}`;
  }
  const f = sec.fields.find((x) => x.key === parts.slice(1).join('.') || x.key === parts[1]);
  return `${sec.title}${f ? ` · ${f.label}` : ' ' + parts.slice(1).join('.')}`;
}

// ---------------- 操作 ----------------

/** 本页最近一次写入存储的内容；存储变更事件与它相同时说明是自己写的，不提示。 */
let selfWrite = '';

async function writeProfile(p: Profile): Promise<void> {
  selfWrite = canonicalJson(p);
  await saveProfile(p);
}

function normalizeDraft(p: Profile): Profile {
  // 去掉空记录对象里的空串
  return JSON.parse(JSON.stringify(p, (_k, v) => (v === '' ? undefined : v))) as Profile;
}

async function doSave(): Promise<boolean> {
  const candidate = normalizeDraft(draft);
  const changed = !sameJson({ ...candidate, meta: {} }, { ...(saved ?? {}), meta: {} });
  candidate.meta.updatedAt = new Date().toISOString();
  if (changed && saved?.meta.reviewedAt) candidate.meta.reviewedAt = null;
  issues = validateProfile(candidate);
  if (issues.length) {
    renderStatus();
    toast('还有需要修改的地方，未保存', 'error');
    return false;
  }
  try {
    await writeProfile(candidate);
    // 读回核对：确认确实写进了存储
    const back = await loadProfile();
    if (!sameJson(back, candidate)) throw new Error('读回的内容与保存的不一致');
  } catch (e) {
    toast(`保存失败：${e instanceof Error ? e.message : String(e)}。请先“导出备份”。`, 'error', 8000);
    return false;
  }
  saved = candidate;
  // 表单控件绑定在 draft 上，保留同一个对象，只同步 meta
  draft.meta = structuredClone(candidate.meta);
  dirty = false;
  if (autoFilled.size) {
    autoFilled = new Set();
    markAutoFilled();
    formEl.querySelectorAll('.record.autofilled').forEach((el) => el.classList.remove('autofilled'));
  }
  renderStatus();
  toast(changed && candidate.meta.reviewedAt === null ? '已保存到本机。内容有修改，请重新核对后点“我已核对”' : '已保存到本机（本浏览器扩展存储）', 'ok', 4500);
  return true;
}

async function doReview() {
  if (dirty && !(await doSave())) return;
  if (!saved) {
    toast('请先保存档案', 'warn');
    return;
  }
  const ok = await confirmDialog('确认已核对？', '请确认你已逐项检查过档案内容（尤其是从简历中复制过来的部分）。核对后的档案才建议用于填写。', '我已核对');
  if (!ok) return;
  saved.meta.reviewedAt = new Date().toISOString();
  await writeProfile(saved);
  draft.meta = structuredClone(saved.meta);
  renderStatus();
  toast('已标记为核对完成', 'ok');
}

async function doExport() {
  if (!saved) {
    toast('还没有保存的档案', 'warn');
    return;
  }
  const ok = await confirmDialog('导出备份', '备份文件包含档案、定制适配器和设置，是明文 JSON，含有你的个人敏感信息。请只保存在自己的电脑或 U 盘里，不要发给别人或上传到网上。', '我知道了，导出');
  if (!ok) return;
  const backup = packBackup(saved, await loadCustomAdapters(), await loadSettings());
  downloadText(`网申档案-备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2));
}

function diffPaths(a: unknown, b: unknown, prefix = '', out: string[] = []): string[] {
  if (out.length > 60) return out;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(prefix || '/');
    return out;
  }
  const keys = new Set([...Object.keys(a as Obj), ...Object.keys(b as Obj)]);
  for (const k of keys) {
    if (k === 'meta') continue;
    diffPaths((a as Obj)[k], (b as Obj)[k], `${prefix}/${k}`, out);
  }
  return out;
}

async function importProfile(raw: unknown, source: string) {
  // 备份文件除档案外还带着定制适配器和设置；先拆开，档案部分照常迁移和校验
  const { profile: obj, extras } = unpackBackup(raw);
  let migrated: Profile;
  let from = 1;
  try {
    const r = migrateToCurrent(obj);
    migrated = r.profile;
    from = r.from;
  } catch (e) {
    toast(e instanceof MigrationError ? e.message : '文件无法识别', 'error', 6000);
    return;
  }
  const errs = validateProfile(migrated);
  if (errs.length) {
    issues = errs;
    renderStatus();
    toast(`导入的档案有 ${errs.length} 处格式问题，未导入`, 'error', 6000);
    return;
  }
  const diffs = diffPaths(saved ?? emptyProfile(), migrated);
  const summary = [...new Set(diffs.map((d) => pathLabel(d).split(' · ')[0].replace(/ 第 \d+ 条$/, '')))];
  const ok = await confirmDialog(
    '替换当前档案？',
    `${source}${from < 1 ? `（已从旧版本 v${from} 升级）` : ''}\n将有变化的部分：${summary.length ? summary.join('、') : '无'}\n导入后会替换当前档案。${extras.customAdapters.length ? `\n备份里还有 ${extras.customAdapters.length} 个定制适配器（${extras.customAdapters.map((d) => d.name).join('、')}），会一并恢复；本机已有的其他适配器保留。` : ''}`,
    '替换',
    true,
  );
  if (!ok) return;
  migrated.meta.updatedAt = new Date().toISOString();
  if (from < 1) migrated.meta.reviewedAt = null;
  await writeProfile(migrated);
  if (extras.customAdapters.length) await saveCustomAdapters(mergeCustomDefs(await loadCustomAdapters(), extras.customAdapters));
  if (Object.keys(extras.settings).length) await saveSettings({ ...(await loadSettings()), ...extras.settings });
  saved = migrated;
  draft = structuredClone(migrated);
  dirty = false;
  issues = [];
  autoFilled = new Set();
  renderForm();
  renderStatus();
  toast(migrated.meta.reviewedAt ? '已导入' : '已导入，请逐项核对后点“我已核对”', 'ok', 5000);
}

async function doImportFile(file: File) {
  try {
    const obj = JSON.parse(await file.text());
    await importProfile(obj, `文件：${file.name}`);
  } catch {
    toast('不是有效的 JSON 文件', 'error');
  }
}

async function doDeleteAll() {
  if (!(await confirmDialog('删除全部本地数据？', '将删除本扩展保存的档案、定制适配器和设置。此操作无法撤销。建议先“导出备份”。', '继续', true))) return;
  if (!(await confirmDialog('再次确认', '真的要删除全部本地数据吗？', '删除全部', true))) return;
  selfWrite = canonicalJson(null);
  await clearAll();
  saved = null;
  draft = emptyProfile();
  dirty = false;
  issues = [];
  autoFilled = new Set();
  renderForm();
  renderStatus();
  toast('已删除全部本地数据', 'ok');
}

// ---------------- 简历原文对照 ----------------

let lastParse: ParseResult | null = null;

function fieldDisplay(path: string, v: unknown): string {
  if (isEmptyValue(v)) return '';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? Object.values(x as Obj).join('') : String(x))).join('、');
  if (typeof v === 'object') return Object.values(v as Obj).filter(Boolean).join(' / ');
  const spec = SECTIONS.flatMap((s) => s.fields.map((f) => ({ path: `${s.key}.${f.key}`, f }))).find((x) => x.path === path);
  return spec?.f.options?.find(([k]) => k === v)?.[1] ?? String(v);
}

/** 识别结果预览：本人勾选后才写入页面上的档案草稿（仍需点“保存”）。 */
function showParsePreview(r: ParseResult) {
  const root = draft as unknown as Obj;
  const dlg = h('dialog', { class: 'dialog dialog-wide', 'data-testid': 'parse-dialog' }) as HTMLDialogElement;
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  dlg.addEventListener('cancel', close);
  const fieldChecks: Array<{ cb: HTMLInputElement; f: ParsedField }> = [];
  const recChecks: Array<{ cb: HTMLInputElement; r: ParsedRecord }> = [];
  const overwrite = h('input', { type: 'checkbox', id: 'parse-overwrite' }) as HTMLInputElement;
  const okBtn = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'parse-apply' }, '') as HTMLButtonElement;
  const updateCount = () => {
    const n = [...fieldChecks, ...recChecks].filter((x) => x.cb.checked).length;
    okBtn.textContent = `填入选中的 ${n} 项`;
    okBtn.disabled = n === 0;
  };

  dlg.append(
    h('h3', {}, '从简历中识别到的内容'),
    h('p', { class: 'small muted' }, `${r.sections.includes('大模型识别') ? '大模型识别结果' : '本地规则识别结果'}，请对照原文核对。已有经历可补齐空缺，默认保留已有值；覆盖需单独勾选。填入后请点“保存”。`),
  );
  const body = h('div', { class: 'parse-body' });

  if (r.fields.length) {
    body.append(h('h4', {}, '基本信息 / 联系方式 / 求职意向'));
    const list = h('div', { class: 'parse-list' });
    for (const f of r.fields) {
      // “custom:体重(kg)”：档案“自定义字段”里同名的一项
      const customLabel = f.path.startsWith('custom:') ? f.path.slice('custom:'.length) : undefined;
      const existing = customLabel ? (Array.isArray(root.custom) ? (root.custom as Obj[]).find((x) => x.label === customLabel)?.value : undefined) : getIn(root, f.path);
      const has = !isEmptyValue(existing);
      const same = has && sameJson(existing, f.value);
      const cb = h('input', { type: 'checkbox', checked: !f.sensitive && !has, disabled: same, 'aria-label': `填入${f.label}` }) as HTMLInputElement;
      cb.addEventListener('change', updateCount);
      fieldChecks.push({ cb, f });
      list.append(
        h(
          'label',
          { class: 'parse-row', title: `原文：${f.source}` },
          cb,
          h('span', { class: 'parse-label' }, customLabel ? `自定义字段 · ${customLabel}` : pathLabel(f.path.replaceAll('.', '/'))),
          h('span', { class: 'parse-value' }, fieldDisplay(f.path, f.value)),
          same
            ? h('span', { class: 'small muted' }, '与档案相同')
            : has
              ? h('span', { class: 'small warn-text' }, `档案已有：${fieldDisplay(f.path, existing)}`)
              : f.sensitive
                ? h('span', { class: 'small warn-text' }, '敏感，默认不勾选')
                : null,
        ),
      );
    }
    body.append(list);
  }

  const byCol = new Map<string, ParsedRecord[]>();
  for (const rec of r.records) {
    if (!byCol.has(rec.collection)) byCol.set(rec.collection, []);
    byCol.get(rec.collection)!.push(rec);
  }
  for (const [col, list] of byCol) {
    body.append(h('h4', {}, `${COLLECTION_ZH[col as ParsedRecord['collection']]}（${list.length} 条）`));
    const box = h('div', { class: 'parse-list' });
    for (const rec of list) {
      const existing = (root[col] as Obj[] | undefined) ?? [];
      const dup = existing.some((x) => sameRecord(rec.collection, x, rec.record));
      const cb = h('input', { type: 'checkbox', checked: !dup, 'aria-label': `填入${rec.display}` }) as HTMLInputElement;
      cb.addEventListener('change', updateCount);
      recChecks.push({ cb, r: rec });
      box.append(
        h(
          'label',
          { class: 'parse-row', title: `原文：\n${rec.source}` },
          cb,
          h('span', { class: 'parse-value' }, rec.display),
          dup ? h('span', { class: 'small muted' }, '已有经历：勾选补齐空缺') : null,
          rec.notes.length ? h('span', { class: 'small warn-text' }, rec.notes.join('；')) : null,
          h('span', { class: 'parse-record-fields small' }, ...Object.entries(rec.record).filter(([k]) => k !== 'id').map(([k, v]) => `${SECTIONS.find((s) => s.key === col)?.fields.find((f) => f.key === k)?.label ?? k}：${fieldDisplay(`${col}.${k}`, v)}\n`)),
          h('details', { class: 'parse-record-fields small' }, h('summary', {}, '原文依据'), h('pre', { class: 'source-pre' }, rec.source)),
        ),
      );
    }
    body.append(box);
  }
  if (!r.fields.length && !r.records.length) {
    body.append(h('div', { class: 'banner banner-warn' }, '没有识别出可以填入的内容。可以在左侧原文中选中文字，用字段旁的“← 填入”手动填写。'));
  }
  if (r.unparsed.length) {
    body.append(
      h('details', { class: 'small' }, h('summary', {}, `没有归入字段的行（${r.unparsed.length}），需要的话请手动填写`), h('pre', { class: 'source-pre' }, r.unparsed.join('\n'))),
    );
  }
  dlg.append(body);
  okBtn.addEventListener('click', () => {
    const fs = fieldChecks.filter((x) => x.cb.checked).map((x) => x.f);
    const rs = recChecks.filter((x) => x.cb.checked).map((x) => x.r);
    const res = applyParsed(draft, fs, rs, { overwrite: overwrite.checked });
    close();
    for (const p of res.applied) {
      const [col, idx] = p.split('.');
      const arr = (draft as unknown as Obj)[col];
      if (Array.isArray(arr) && /^\d+$/.test(idx ?? '')) {
        const id = String((arr[Number(idx)] as Obj).id);
        autoFilled.add(`${col}.${id}`);
        openState.set(id, true);
      } else autoFilled.add(p);
    }
    markDirty();
    renderForm();
    issues = validateProfile(normalizeDraft(draft));
    renderStatus();
    const kept = res.keptExisting.length ? `，${res.keptExisting.length} 项档案已有值未覆盖` : '';
    const dups = res.duplicates.length ? `，${res.duplicates.length} 条重复未添加` : '';
    toast(`已填入 ${res.applied.length} 项${kept}${dups}。黄色底的是自动填入的，请逐项核对后点“保存”。`, 'ok', 7000);
  });
  dlg.append(
    h(
      'div',
      { class: 'dialog-actions' },
      h('label', { class: 'inline small', for: 'parse-overwrite', style: 'margin-right:auto' }, overwrite, ' 覆盖档案中已有的值'),
      h('button', { type: 'button', class: 'btn', onclick: close }, '取消'),
      okBtn,
    ),
  );
  updateCount();
  document.body.appendChild(dlg);
  dlg.showModal();
}

async function doParse(file: File) {
  lastParse = null;
  document.getElementById('btn-reparse')!.hidden = true;
  sourceInfo.textContent = '正在提取文字…';
  clear(sourceEl);
  try {
    const { extractText, sensitiveRanges } = await import('./resume-parse');
    const r = await extractText(file);
    sourceInfo.textContent = `${file.name}${r.pages ? ` · ${r.pages} 页` : ''}。已自动识别；也可以选中文字后点右侧字段旁的“← 填入”。文件不会被保存。`;
    lastParse = parseResumeText(r.text);
    (document.getElementById('btn-reparse') as HTMLButtonElement | null)?.removeAttribute('hidden');
    if (r.warning) sourceEl.append(h('div', { class: 'banner banner-warn' }, r.warning));
    const pre = h('pre', { class: 'source-pre', 'data-testid': 'source-pre' });
    let pos = 0;
    for (const [s, e] of sensitiveRanges(r.text)) {
      if (s < pos) continue;
      pre.append(r.text.slice(pos, s), h('mark', { class: 'sensitive', title: '可能是证件号或手机号：不会自动写入档案，请自行核对后复制' }, r.text.slice(s, e)));
      pos = e;
    }
    pre.append(r.text.slice(pos));
    sourceEl.append(pre);
    if (lastParse && !r.warning) showParsePreview(lastParse);
  } catch (e) {
    sourceInfo.textContent = e instanceof Error ? e.message : String(e);
  }
}

function highlightSearch(q: string) {
  const pre = sourceEl.querySelector('pre');
  if (!pre || !q) return;
  const text = pre.textContent ?? '';
  const i = text.indexOf(q);
  if (i < 0) {
    toast('原文中没有找到', 'warn');
    return;
  }
  // 用浏览器选区定位
  const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    if (offset + len > i) {
      const range = document.createRange();
      range.setStart(node, i - offset);
      range.setEnd(node, Math.min(len, i - offset + q.length));
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      (node.parentElement as HTMLElement).scrollIntoView({ block: 'center' });
      selectionText = q;
      break;
    }
    offset += len;
  }
}

document.addEventListener('selectionchange', () => {
  const sel = getSelection();
  if (!sel || sel.isCollapsed) return;
  if (sourceEl.contains(sel.anchorNode)) selectionText = sel.toString();
});

// ---------------- 初始化 ----------------

async function init() {
  // 先绑定选文件事件：页面一出现就可能选文件，读档案期间的选择要排队，不能丢
  let markReady!: () => void;
  const ready = new Promise<void>((r) => (markReady = r));
  const importInput = document.getElementById('import-file') as HTMLInputElement;
  importInput.addEventListener('change', () => {
    const f = importInput.files?.[0];
    if (f) void ready.then(() => doImportFile(f));
    importInput.value = '';
  });
  const resumeInput = document.getElementById('resume-file') as HTMLInputElement;
  resumeInput.addEventListener('change', () => {
    const f = resumeInput.files?.[0];
    if (f) void ready.then(() => doParse(f));
    resumeInput.value = '';
  });
  saved = await loadProfile();
  draft = saved ? structuredClone(saved) : emptyProfile();
  renderForm();
  renderStatus();
  markReady();
  void initAi(() => sourceEl.querySelector('pre')?.textContent ?? '', (r) => { lastParse = r; showParsePreview(r); });
  formEl.addEventListener('submit', (e) => e.preventDefault());
  document.getElementById('btn-save')!.addEventListener('click', () => void doSave());
  document.getElementById('btn-review')!.addEventListener('click', () => void doReview());
  document.getElementById('btn-export')!.addEventListener('click', () => void doExport());
  document.getElementById('btn-delete')!.addEventListener('click', () => void doDeleteAll());
  document.getElementById('btn-sample')!.addEventListener('click', () => void importProfile(structuredClone(sampleProfile), '虚构示例档案（只用于试用和测试）'));
  document.getElementById('btn-reparse')!.addEventListener('click', () => {
    if (lastParse) showParsePreview(lastParse);
  });
  // 其他页面（如另一个档案页标签）改了存储时提示，避免互相覆盖
  onProfileChanged((p) => {
    if (canonicalJson(p ?? null) === selfWrite || sameJson(p, saved)) return;
    saved = p;
    if (!dirty) {
      draft = p ? structuredClone(p) : emptyProfile();
      renderForm();
    } else {
      toast('档案在其他页面被修改过。你这里有未保存的修改，保存时会覆盖那边的内容。', 'warn', 8000);
    }
    renderStatus();
  });
  const search = document.getElementById('source-search') as HTMLInputElement;
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') highlightSearch(search.value.trim());
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void doSave();
    }
  });
  void lastFocused;
}

void init();
