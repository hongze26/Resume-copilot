// 存回档案：用户在网页上点“保存”时，把页面上显示的内容与档案比对，生成“建议写回”的清单。
// 只生成建议；写入档案必须由用户在侧边栏勾选确认（applyWriteback）。
import type { AdapterRules } from '../../adapters/types';
import { certAliases, matchCertLeaves } from '../normalize/cert';
import { DICTS, displayFor, type Dict } from '../normalize/dicts';
import { formatDate, parseDate } from '../normalize/date';
import { displayRegion, regionKey } from '../normalize/region';
import { norm } from '../normalize/text';
import { RULES_BY_KEY, type PathRule } from '../matcher/semantic';
import { buildPlan } from '../plan/plan';
import type { FieldDescriptor } from '../plan/types';
import type { Profile, RecordCollection, Region } from './types';
import { validateProfile } from './validate';

/** 页面上一个控件及其当前显示文字。 */
export type PageFieldValue = FieldDescriptor & { text: string };

export interface WritebackItem {
  id: string;
  /** set：档案中为空，补上；replace：与档案不同；template：新增一段文字模板；custom：新建自定义字段；new-record：档案中没有这条记录，新建 */
  kind: 'set' | 'replace' | 'template' | 'custom' | 'new-record';
  label: string;
  /** 单表单：档案路径（basic.ethnicity）；重复区块：集合 + 记录内字段 */
  path?: string;
  collection?: RecordCollection;
  recordId?: string;
  field?: string;
  before?: string;
  after: string;
  value?: unknown;
  record?: Record<string, unknown>;
  details?: string[];
  checked: boolean;
  error?: string;
}

export interface WritebackContext {
  adapter?: AdapterRules;
  collection: RecordCollection | 'single';
  /** 侧边栏绑定的档案记录（通过“添加并准备第 N 条”填写的表单） */
  record?: Record<string, unknown> & { id: string };
}

const EMPTY_PAGE_TEXT = /^(请选择|请填写|请输入)/;

function dictOf(rule: PathRule): Dict | undefined {
  return rule.dict ? (DICTS[rule.dict] as Dict) : undefined;
}

function dictKey(dict: Dict, text: string): string | undefined {
  const t = norm(text);
  const exact = Object.entries(dict).filter(([, al]) => al.some((a) => norm(a) === t));
  if (exact.length === 1) return exact[0][0];
  // 页面选项文字更长（“大学英语六级CET6”）：选唯一一个被包含的别名最长的键
  const scored = Object.entries(dict)
    .map(([k, al]) => [k, Math.max(0, ...al.filter((a) => norm(a).length >= 2 && t.includes(norm(a))).map((a) => norm(a).length))] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (scored.length === 0) return undefined;
  if (scored.length > 1 && scored[0][1] === scored[1][1]) return undefined;
  return scored[0][0];
}

export function parseRegion(text: string): Region | undefined {
  const segs = text
    .split(/\s*[/／>|]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs[0] === '中国') segs.shift();
  if (segs.length === 0) return undefined;
  const [province, city, district] = segs;
  return { province, ...(city ? { city } : {}), ...(district ? { district } : {}) };
}

/** 页面文字 → 档案值。无法可靠转换时返回 undefined（不写回）。 */
export function fromPageText(rule: PathRule, text: string): { value: unknown; display: string } | undefined {
  const t = text.trim();
  if (!t || EMPTY_PAGE_TEXT.test(t)) return undefined;
  switch (rule.valueType) {
    case 'text':
    case 'school':
    case 'longtext':
      return { value: t, display: t };
    case 'major-category': {
      const v = t.split(/\s*[/／]\s*/).filter(Boolean).join('/');
      return { value: v, display: t };
    }
    case 'number': {
      const n = Number(t.replace(/[,，\s]/g, ''));
      return Number.isFinite(n) ? { value: n, display: t } : undefined;
    }
    case 'years': {
      const n = parseFloat(t);
      return Number.isFinite(n) && n > 0 ? { value: n, display: t } : undefined;
    }
    case 'enum': {
      const dict = dictOf(rule);
      if (!dict) return { value: t, display: t }; // 自由文本枚举（单位性质等）
      const k = dictKey(dict, t);
      return k ? { value: k, display: displayFor(rule.dict, k) } : undefined;
    }
    case 'date':
    case 'date-or-present': {
      if (/至今/.test(t)) return rule.valueType === 'date-or-present' ? { value: 'present', display: '至今' } : undefined;
      const d = parseDate(t);
      if (!d) return undefined;
      return { value: formatDate(d), display: formatDate(d) };
    }
    case 'region': {
      const r = parseRegion(t);
      return r ? { value: r, display: displayRegion(r) } : undefined;
    }
    case 'certificate': {
      // 页面可能显示“分类 / 证书”，档案只存证书名
      const name = t.split(/\s*[/／]\s*/).filter(Boolean).pop() ?? t;
      return { value: name, display: name };
    }
    default:
      return undefined; // period、派生值、声明类、需本人完成的不写回
  }
}

/** 档案中已有值的显示文字（用于比较）。 */
function displayExisting(rule: PathRule, v: unknown): string {
  if (v === undefined || v === null || v === '' || v === 'unset') return '';
  if (rule.valueType === 'region') return displayRegion(v as Region);
  if (rule.valueType === 'enum' && rule.dict) return displayFor(rule.dict, String(v));
  if (rule.valueType === 'date' || rule.valueType === 'date-or-present') {
    if (v === 'present') return '至今';
    const d = parseDate(String(v));
    return d ? formatDate(d) : String(v);
  }
  if (rule.valueType === 'major-category') return String(v).split(/\s*[/／]\s*/).join(' / ');
  return String(v);
}

function same(rule: PathRule, existing: unknown, next: { value: unknown; display: string }): boolean {
  if (rule.valueType === 'region') {
    const a = existing as Region | undefined;
    const b = next.value as Region;
    if (!a) return false;
    const keys = (r: Region) => [...new Set([r.province, r.city, r.district].filter(Boolean).map((x) => regionKey(x)))];
    const ka = keys(a);
    const kb = keys(b);
    // 页面只显示到市（“湖南-岳阳”），档案更精确（到区县）时视为相同，不建议改粗
    return kb.length > 0 && kb.length <= ka.length && kb.every((x, i) => x === ka[i]);
  }
  if (typeof next.value === 'number') return Number(existing) === next.value;
  if (rule.valueType === 'certificate') {
    // 档案写“初级会计专业技术资格”、网站叫“初级会计职称”：同一证书的别名视为相同
    return matchCertLeaves([{ category: '', name: String(next.value) }], certAliases(String(existing ?? ''))).exact.length > 0;
  }
  if ((rule.valueType === 'date' || rule.valueType === 'date-or-present') && typeof next.value === 'string' && next.value !== 'present') {
    // 页面只显示到月/年时，档案中更精确的日期视为相同（2022-09 与 2022-09-01）
    const ex = displayExisting(rule, existing);
    if (ex === next.value || ex.startsWith(next.value + '-')) return true;
  }
  if (rule.valueType === 'major-category') {
    // 页面路径常带学历前缀（“本科（普通教育）/ 管理学 / 工商管理类”），档案只存后缀：以档案路径结尾即视为相同
    const segs = (x: unknown) => String(x ?? '').split(/\s*[/／]\s*/).map(norm).filter(Boolean);
    const a = segs(existing);
    const b = segs(next.value);
    return a.length > 0 && b.length >= a.length && a.every((x, i) => b[b.length - a.length + i] === x);
  }
  return norm(displayExisting(rule, existing)) === norm(next.display) || norm(String(existing ?? '')) === norm(String(next.value));
}

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split('.');
  let cur = obj;
  for (const seg of segs.slice(0, -1)) {
    if (!cur[seg] || typeof cur[seg] !== 'object') cur[seg] = {};
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]] = value;
}

const REQUIRED: Record<string, string[]> = {
  education: ['level', 'school', 'start'],
  work: ['kind', 'company', 'title', 'start'],
  projects: ['name', 'start'],
  languages: ['language', 'certificate'],
  honors: ['name'],
  certificates: ['name', 'status'],
};

const FIELD_ZH: Record<string, string> = {
  level: '学历', school: '学校', start: '开始时间', kind: '工作性质', company: '单位名称', title: '职位', name: '名称', language: '语种', certificate: '证书', status: '状态',
};

function newId(collection: string): string {
  return `${collection}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** 由页面上的值生成写回建议。 */
export function proposeWriteback(profile: Profile, values: PageFieldValue[], ctx: WritebackContext): WritebackItem[] {
  const fields = values.filter((v) => !v.disabled && v.kind !== 'upload' && v.kind !== 'checkbox');
  // 借用填写计划的字段识别（适配器字典优先），只取它判断出的档案路径
  const plan = buildPlan(
    fields.map((f) => ({ ...f, isEmpty: false, visible: true })),
    { profile, adapter: ctx.adapter, collection: ctx.collection, record: ctx.record ?? (ctx.collection === 'single' ? undefined : { id: '__page__' }), allowOverwrite: true },
  );
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: WritebackItem[] = [];
  const seen = new Set<string>();

  // 重复区块：先汇总成一条“页面上的记录”
  const pageRecord: Record<string, unknown> = {};
  const pageDisplay: Array<[string, string, string]> = []; // [field, label, display]

  for (const it of plan) {
    const f = byKey.get(it.fieldKey);
    if (!f || !f.text) continue;
    if (it.skipReason === 'locked' || it.skipReason === 'manual' || it.skipReason === 'duplicate') continue;
    if (!it.path) {
      // 不认识的字段：单表单区块新建自定义字段
      if (ctx.collection === 'single' && it.skipReason === 'unrecognized' && f.text && !EMPTY_PAGE_TEXT.test(f.text)) {
        const label = f.label.replace(/[*＊:：]/g, '').trim();
        if (!label || seen.has(`custom:${label}`)) continue;
        seen.add(`custom:${label}`);
        const existing = profile.custom?.find((c) => norm(c.label) === norm(label) || c.aliases?.some((a) => norm(a) === norm(label)));
        if (existing && norm(existing.value) === norm(f.text)) continue;
        out.push({ id: `custom:${label}`, kind: 'custom', label, path: existing ? `custom.${existing.id}` : undefined, before: existing?.value, after: f.text, value: f.text, checked: !existing });
      }
      continue;
    }
    if (ctx.collection === 'single') {
      const rule = RULES_BY_KEY[it.path] ?? (it.path.startsWith('custom.') ? undefined : undefined);
      if (it.path.startsWith('custom.')) {
        const c = profile.custom?.find((x) => `custom.${x.id}` === it.path);
        if (c && norm(c.value) !== norm(f.text) && !seen.has(it.path)) {
          seen.add(it.path);
          out.push({ id: it.path, kind: 'replace', label: c.label, path: it.path, before: c.value, after: f.text, value: f.text, checked: false });
        }
        continue;
      }
      if (!rule || seen.has(rule.key) || rule.key.startsWith('derived.')) continue;
      const next = fromPageText(rule, f.text);
      if (!next) continue;
      seen.add(rule.key);
      if (rule.key === 'textTemplates.selfAssessment') {
        const tpls = (profile.textTemplates ?? []).filter((t) => t.kind === 'self-assessment');
        if (tpls.some((t) => norm(t.body) === norm(String(next.value)))) continue;
        out.push({ id: rule.key, kind: 'template', label: f.label, path: rule.key, after: short(next.display), value: next.value, checked: tpls.length === 0, before: tpls.length ? `已有 ${tpls.length} 段自我评价` : undefined });
        continue;
      }
      const existing = getPath(profile, rule.key);
      if (existing !== undefined && existing !== '' && existing !== 'unset') {
        if (same(rule, existing, next)) continue;
        out.push({ id: rule.key, kind: 'replace', label: f.label, path: rule.key, before: displayExisting(rule, existing), after: next.display, value: next.value, checked: false });
      } else {
        out.push({ id: rule.key, kind: 'set', label: f.label, path: rule.key, after: next.display, value: next.value, checked: true });
      }
      continue;
    }
    // 重复区块：path 形如 work[__page__].companyNature
    const m = /^([a-zA-Z]+)\[[^\]]*\]\.(.+)$/.exec(it.path);
    if (!m) continue;
    const ruleKey = `${m[1]}.${m[2]}`;
    const rule = RULES_BY_KEY[ruleKey];
    if (!rule) continue;
    const field = m[2];
    // 派生值（是否涉及该段学历、是否海外）由档案推出，不存回
    if (field === 'hasLevel' || field === 'isOverseas' || field in pageRecord) continue;
    if (field === 'period') {
      const parts = f.text.split(/\s*(?:~|～|至|—|–|-{1,2}(?=\s*\d{4}))\s*/).filter(Boolean);
      const s = parts[0] ? parseDate(parts[0]) : null;
      const e = parts[1] ? (/至今/.test(parts[1]) ? 'present' : parseDate(parts[1])) : null;
      if (s && s !== 'present' && !('start' in pageRecord)) {
        pageRecord.start = formatDate(s);
        pageDisplay.push(['start', '开始时间', formatDate(s)]);
      }
      if (e && !('end' in pageRecord)) {
        pageRecord.end = e === 'present' ? 'present' : formatDate(e);
        pageDisplay.push(['end', '结束时间', e === 'present' ? '至今' : formatDate(e)]);
      }
      continue;
    }
    const next = fromPageText(rule, f.text);
    if (!next) continue;
    pageRecord[field] = next.value;
    pageDisplay.push([field, f.label.replace(/-.*$/, ''), next.display]);
  }

  if (ctx.collection === 'single') return out;
  const col = ctx.collection;
  if (Object.keys(pageRecord).length === 0) return out;
  if (col === 'languages' && !pageRecord.language) pageRecord.language = '英语';
  // 网站证书栏只有名称；在网站上保存的证书视为已取得（写回前由本人确认）
  if (col === 'certificates' && !pageRecord.status) pageRecord.status = 'obtained';

  const records = ((profile as unknown as Record<string, unknown>)[col] ?? []) as Array<Record<string, unknown> & { id: string }>;
  const keysOf = (r: Record<string, unknown>) => ctx.adapter?.recordKeys?.(col, r) ?? [String(r.name ?? r.school ?? r.company ?? r.certificate ?? '')].filter(Boolean);
  const pageKeys = keysOf(pageRecord).map(norm);
  const target =
    (ctx.record && records.find((r) => r.id === ctx.record!.id)) ??
    (pageKeys.length ? records.find((r) => {
      const k = keysOf(r).map(norm);
      return k.length === pageKeys.length && k.every((x, i) => x === pageKeys[i]);
    }) : undefined);

  if (target) {
    for (const [field, label, display] of pageDisplay) {
      const rule = RULES_BY_KEY[`${col}.${field}`] ?? RULES_BY_KEY[`${col}.period`];
      const existing = target[field];
      const next = { value: pageRecord[field], display };
      const blank = existing === undefined || existing === null || existing === '' || existing === 'unset';
      if (!blank && rule && same(field === 'start' || field === 'end' ? { ...rule, valueType: 'date-or-present' } : rule, existing, next)) continue;
      out.push({
        id: `${col}:${target.id}:${field}`,
        kind: blank ? 'set' : 'replace',
        label: `${label}`,
        collection: col,
        recordId: target.id,
        field,
        before: blank ? undefined : rule ? displayExisting(field === 'start' || field === 'end' ? { ...rule, valueType: 'date-or-present' } : rule, existing) : String(existing),
        after: display,
        value: next.value,
        checked: blank,
      });
    }
    return out;
  }

  const record = { id: newId(col), ...pageRecord };
  const missing = (REQUIRED[col] ?? []).filter((k) => record[k as keyof typeof record] === undefined || record[k as keyof typeof record] === '');
  out.push({
    id: `${col}:new`,
    kind: 'new-record',
    label: `新增一条记录：${pageDisplay.slice(0, 2).map((d) => d[2]).join(' · ')}`,
    collection: col,
    after: pageDisplay.map((d) => `${d[1]}：${short(d[2])}`).join('；'),
    details: pageDisplay.map((d) => `${d[1]}：${short(d[2])}`),
    record,
    checked: missing.length === 0,
    error: missing.length ? `缺少必填项：${missing.map((k) => FIELD_ZH[k] ?? k).join('、')}，无法新建` : undefined,
  });
  return out;
}

function short(s: string): string {
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

/** 把勾选的建议写入档案（返回新对象，不修改入参）。校验不通过时抛错，档案保持不变。 */
export function applyWriteback(profile: Profile, items: WritebackItem[], now = new Date()): Profile {
  const p = JSON.parse(JSON.stringify(profile)) as Profile;
  const root = p as unknown as Record<string, unknown>;
  for (const it of items) {
    if (!it.checked || it.error) continue;
    switch (it.kind) {
      case 'set':
      case 'replace':
        if (it.collection && it.recordId && it.field) {
          const rec = ((root[it.collection] ?? []) as Array<Record<string, unknown>>).find((r) => r.id === it.recordId);
          if (rec) rec[it.field] = it.value;
        } else if (it.path?.startsWith('custom.')) {
          const c = p.custom?.find((x) => `custom.${x.id}` === it.path);
          if (c) c.value = String(it.value);
        } else if (it.path) {
          setPath(root, it.path, it.value);
        }
        break;
      case 'template':
        p.textTemplates = [...(p.textTemplates ?? []), { id: newId('tpl'), title: '自我评价（从网页保存）', kind: 'self-assessment', body: String(it.value) }];
        break;
      case 'custom':
        if (it.path?.startsWith('custom.')) {
          const c = p.custom?.find((x) => `custom.${x.id}` === it.path);
          if (c) c.value = String(it.value);
        } else {
          p.custom = [...(p.custom ?? []), { id: newId('custom'), label: it.label, value: String(it.value), sensitivity: 'medium' }];
        }
        break;
      case 'new-record':
        if (it.collection && it.record) root[it.collection] = [...((root[it.collection] ?? []) as unknown[]), it.record];
        break;
    }
  }
  p.meta = { ...p.meta, updatedAt: now.toISOString() };
  const issues = validateProfile(p);
  if (issues.length) throw new Error(`写回后档案格式不正确：${issues.slice(0, 3).map((i) => `${i.path} ${i.message}`).join('；')}`);
  return p;
}
