// 生成填写计划：字段描述 + 档案 + 适配器规则 → 每个字段的置信度、写入值和依据。
import type { AdapterRules, FieldRule } from '../../adapters/types';
import { certAliases, certCategoryHints } from '../normalize/cert';
import { aliasesFor, displayFor, DICTS, moneyAliases, yearsAliases, type Dict } from '../normalize/dicts';
import { displayDate, formatDate, padToDay, parseDate, precisionFit, truncate, type DateParts } from '../normalize/date';
import { matchOptions, matchPathSuffix, type OptionMatch } from '../normalize/options';
import { displayRegion, regionKey, regionPath } from '../normalize/region';
import { coreLabel, norm } from '../normalize/text';
import { bestMatch, levelFromScore, type MatchEvidence } from '../matcher/score';
import { guessCollection, RULES_BY_KEY, type PathRule } from '../matcher/semantic';
import type { CustomField, EducationRecord, Profile, RecordCollection, Region, Sensitivity } from '../profile/types';
import type { Candidate, FieldDescriptor, FillValue, Level, PlanItem, SkipReason } from './types';

export interface PlanContext {
  profile: Profile;
  adapter?: AdapterRules;
  /** 强制作用域（重复区块执行时绑定的集合） */
  collection?: RecordCollection | 'single';
  /** 绑定的档案记录（防混填：一次只用一条记录） */
  record?: Record<string, unknown> & { id: string };
  allowOverwrite?: boolean;
}

const LEVEL_RANK: Record<Level, number> = { high: 3, medium: 2, low: 1, skip: 0 };
const minLevel = (a: Level, b: Level): Level => (LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b);

const LEVEL_ORDER: Record<string, number> = {
  'junior-high-or-below': 0,
  'secondary-vocational': 1,
  'high-school': 1,
  'junior-college': 2,
  bachelor: 3,
  master: 4,
  doctor: 5,
};

export function highestEducation(p: Profile): EducationRecord | undefined {
  return [...(p.education ?? [])].sort((a, b) => (LEVEL_ORDER[b.level] ?? 0) - (LEVEL_ORDER[a.level] ?? 0))[0];
}

const SCOPE_ZH: Record<string, string> = {
  education: '教育经历',
  work: '工作/实习经历',
  projects: '项目经历',
  campus: '校园经历',
  honors: '荣誉奖励',
  languages: '语言能力',
  certificates: '证书',
  skills: '专业技能',
  family: '家庭成员',
};

/** 档案字段的中文名，给侧边栏“依据”用：“教育经历 › 入学时间”。 */
function fieldName(rule: PathRule): string {
  const name = rule.synonyms[0] ?? rule.key;
  const scope = rule.scope === 'single' ? '' : SCOPE_ZH[rule.scope] ?? '';
  return scope ? `${scope} › ${name}` : name;
}

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '' || v === 'unset';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function overseas(record: Record<string, unknown>): boolean {
  const country = typeof record.schoolCountry === 'string' ? record.schoolCountry.trim() : '';
  return record.admissionType === 'non-mainland' || (!!country && !/^(中国|中华人民共和国|China)$/i.test(country));
}

/** 取规则对应的档案值。 */
export function profileValue(rule: PathRule, ctx: PlanContext, record?: Record<string, unknown>): unknown {
  const p = ctx.profile;
  if (rule.key === 'derived.highestLevel') return highestEducation(p)?.level;
  if (rule.key === 'derived.highestSchoolRegion') return highestEducation(p)?.schoolRegion;
  if (rule.key === 'education.isOverseas') {
    // 由档案推出：非内地院校 / 学校所在国家不是中国 → 有；其余按最常见的“无”
    // （选了境外院校候选时网站会自动改成“有”，填写时不覆盖网站带出的值）
    if (!record) return undefined;
    return overseas(record) ? 'yes' : 'no';
  }
  if (rule.key === 'education.admissionType' && record && isBlank(record.admissionType)) {
    // 档案没写受教育类型：境外院校 → 海外留学，其余按最常见的“全日制统分统招”（标“中”，本人核对）
    return overseas(record) ? 'non-mainland' : 'unified';
  }
  if (rule.key === 'textTemplates.selfAssessment') {
    const bodies = (p.textTemplates ?? []).filter((t) => t.kind === 'self-assessment' && t.body.trim()).map((t) => t.body);
    return bodies.length ? bodies : undefined;
  }
  if (rule.scope === 'single') return getPath(p, rule.key);
  if (!record) return undefined;
  const field = rule.key.slice(rule.scope.length + 1);
  if (field === 'period') return record.start ? { start: record.start, end: record.end } : undefined;
  if (field === 'hasLevel') return record.level;
  return getPath(record, field);
}

function adapterRuleFor(f: FieldDescriptor, adapter?: AdapterRules): FieldRule | undefined {
  if (!adapter) return undefined;
  const labels = [coreLabel(f.label), norm(f.label)];
  return (
    adapter.fields.find((r) => r.section === f.sectionKey && r.id && f.id && r.id === f.id) ??
    adapter.fields.find((r) => r.section === f.sectionKey && r.label && labels.includes(norm(r.label)))
  );
}

/**
 * 适配器把字段对应到档案的自定义字段（custom.<id>）。按 id 找；档案重新导入后 id 会变，再按标签（或其他写法）与网页标签完全相等找回。
 */
function adapterCustomField(path: string, f: FieldDescriptor, p: Profile): CustomField | undefined {
  const list = p.custom ?? [];
  const byId = list.find((c) => `custom.${c.id}` === path);
  if (byId) return byId;
  const labels = [coreLabel(f.label), norm(f.label)];
  return list.find((c) => [c.label, ...(c.aliases ?? [])].some((a) => labels.includes(norm(a))));
}

function customRule(c: CustomField, sensitivity: Sensitivity): PathRule {
  return { key: `custom.${c.id}`, scope: 'single', synonyms: [c.label, ...(c.aliases ?? [])], valueType: 'text', sensitivity };
}

function scopeFor(f: FieldDescriptor, ctx: PlanContext): PathRule['scope'] {
  if (ctx.collection) return ctx.collection;
  const sec = ctx.adapter?.sections.find((s) => s.key === f.sectionKey);
  if (sec?.collection) return sec.collection;
  return guessCollection(f.section);
}

interface ValueOutcome {
  level: Level;
  value?: FillValue;
  display?: string;
  candidates?: Candidate[];
  skipReason?: SkipReason;
  reasons: string[];
  needsDetail?: 'day';
  longtext?: boolean;
  derived?: boolean;
}

const isChoice = (k: FieldDescriptor['kind']) => k === 'select' || k === 'native-select' || k === 'radio' || k === 'radio-button' || k === 'remote-select';

function choiceValue(kind: FieldDescriptor['kind'], text: string, accept?: string[]): FillValue {
  if (kind === 'radio' || kind === 'radio-button') return { t: 'radio', text, accept };
  return { t: 'option', text, search: text, accept };
}

/** 枚举值 → 页面选项。 */
function enumOutcome(
  f: FieldDescriptor,
  aliases: string[],
  display: string,
  sensitivity: Sensitivity,
  options: string[] | undefined,
  partial: boolean,
  excludeAliases: string[] = [],
): ValueOutcome {
  if (!isChoice(f.kind)) {
    // 文本框承载枚举：写首选文字
    return { level: 'high', value: { t: 'text', text: display }, display, reasons: [`把“${display}”写进这一栏`] };
  }
  const m: OptionMatch = matchOptions(aliases, options, { partial, excludeAliases, allowContains: sensitivity !== 'high' });
  switch (m.status) {
    case 'exact':
      return { level: 'high', value: choiceValue(f.kind, m.option), display: m.option, reasons: [`网页的选项里正好有“${m.option}”`] };
    case 'multiple':
    case 'contains':
      if (sensitivity === 'high') return { level: 'skip', skipReason: 'sensitive-ambiguous', reasons: [m.why] };
      return {
        level: 'medium',
        candidates: m.candidates.map((c) => ({ value: choiceValue(f.kind, c), display: c })),
        reasons: [`${m.why}（${m.candidates.join('、')}），先选第一个，可在上面改`],
      };
    case 'none':
      return { level: 'skip', skipReason: 'no-option', reasons: [`档案里是“${display}”，网页的选项里没有它`] };
    case 'unknown':
      if (f.kind === 'radio' || f.kind === 'radio-button') return { level: 'skip', skipReason: 'no-option', reasons: ['没读到这一栏有哪些选项'] };
      return {
        level: 'high',
        value: { t: 'option', text: display, search: display, accept: aliases },
        display,
        reasons: [`选项很多，填写时在下拉里搜“${display}”；搜不到一样的就不填`],
      };
  }
}

function otherAliases(dictName: PathRule['dict'], key: string): string[] {
  if (!dictName) return [];
  const d = DICTS[dictName] as Dict;
  return Object.entries(d)
    .filter(([k]) => k !== key)
    .flatMap(([, v]) => v);
}

function dateOutcome(f: FieldDescriptor, raw: string, allowPresent: boolean): ValueOutcome {
  const d = parseDate(raw);
  if (!d) return { level: 'skip', skipReason: 'no-profile-value', reasons: ['档案里的日期写法看不懂，请在档案管理里改成 2024-09-01 这样'] };
  if (d === 'present') {
    if (!allowPresent) return { level: 'skip', skipReason: 'no-option', reasons: ['档案里写的是“至今”，但这一栏不能填“至今”'] };
    if (f.kind === 'date' && f.hasPresentOption === false) {
      return { level: 'skip', skipReason: 'manual', reasons: ['档案里写的是“至今”，但网页的日期框里没有“至今”可选，请自己选'] };
    }
    if (f.kind !== 'date') return { level: 'medium', candidates: [{ value: { t: 'text', text: '至今' }, display: '至今' }], reasons: ['把“至今”两个字写进这一栏'] };
    return { level: 'high', value: { t: 'date', date: 'present' }, display: '至今', reasons: ['档案里写的是“至今”，在日期框里点“至今”'] };
  }
  if (f.kind !== 'date') {
    const text = formatDate(d);
    return { level: 'medium', candidates: [{ value: { t: 'text', text }, display: text }], reasons: ['这一栏是文字框，按 2024-09-01 的格式写入'] };
  }
  const fit = precisionFit(d, f.datePrecision);
  if (fit === 'needs-detail') {
    // 档案只到月：按 1 日补齐、默认勾选（之后本人会在网页上核对）；侧边栏可改成具体日期
    const v = padToDay(d);
    return {
      level: 'medium',
      needsDetail: 'day',
      value: { t: 'date', date: v },
      display: displayDate(d),
      reasons: [`网页要填到哪一天，档案里只写到${d.m ? '月' : '年'}，先按 ${displayDate(v)} 填，可在上面改成具体日期`],
    };
  }
  const v = f.datePrecision ? truncate(d, f.datePrecision) : d;
  return { level: 'high', value: { t: 'date', date: v }, display: displayDate(v), reasons: [f.datePrecision === 'month' ? '网页只要求填到月' : f.datePrecision === 'year' ? '网页只要求填到年' : '按档案里的日期填'] };
}

function periodOutcome(f: FieldDescriptor, v: { start?: string; end?: string }): ValueOutcome {
  const s = parseDate(v.start);
  const e = v.end ? parseDate(v.end) : null;
  if (!s || s === 'present') return { level: 'skip', skipReason: 'no-profile-value', reasons: ['档案里这一条没写开始时间'] };
  if (!e) return { level: 'skip', skipReason: 'no-profile-value', reasons: ['档案里这一条没写结束时间'] };
  if (e === 'present' && f.hasPresentOption !== true) {
    return { level: 'skip', skipReason: 'manual', reasons: ['档案里结束时间是“至今”，这个日期框没有“至今”可选，请自己选'] };
  }
  const fitS = precisionFit(s, f.datePrecision);
  const fitE = e === 'present' ? 'ok' : precisionFit(e, f.datePrecision);
  if (fitS === 'needs-detail' || fitE === 'needs-detail') {
    const start = padToDay(s);
    const end = e === 'present' ? 'present' : padToDay(e);
    return {
      level: 'medium',
      value: { t: 'date-range', start, end },
      display: `${displayDate(start)} – ${displayDate(end)}`,
      reasons: ['网页要填到哪一天，档案里只写到月，先按每月 1 日填，填完请在网页上核对'],
    };
  }
  const tr = (d: DateParts) => (f.datePrecision ? truncate(d, f.datePrecision) : d);
  const start = tr(s);
  const end = e === 'present' ? 'present' : tr(e);
  return { level: 'high', value: { t: 'date-range', start, end }, display: `${displayDate(start)} – ${displayDate(end)}`, reasons: ['开始和结束时间都取自档案里同一条经历'] };
}

function regionOutcome(f: FieldDescriptor, r: Region, sensitivity: Sensitivity, options?: string[], partial = false): ValueOutcome {
  const display = displayRegion(r);
  if (f.kind === 'cascader') {
    return { level: 'high', value: { t: 'cascade', path: regionPath(r) }, display, reasons: ['按省、市、区一级一级选'] };
  }
  if (f.kind === 'custom-popup') return { level: 'skip', skipReason: 'manual', reasons: ['这种地区选择框工具还不会填，请自己选'] };
  if (isChoice(f.kind)) {
    const aliases = [r.province, regionKey(r.province), regionKey(r.province) + '省', regionKey(r.province) + '市'];
    const o = enumOutcome(f, aliases, r.province, sensitivity, options, partial);
    return o;
  }
  return { level: 'medium', candidates: [{ value: { t: 'text', text: display.replace(/ \/ /g, '') }, display }], reasons: ['这一栏是文字框，把省市区连起来写入'] };
}

function certificateOutcome(f: FieldDescriptor, name: string, record?: Record<string, unknown>): ValueOutcome {
  if (record?.status && record.status !== 'obtained') {
    const st = record.status === 'partial' ? '部分通过' : '在考';
    return { level: 'skip', skipReason: 'manual', reasons: [`档案中这张证书是“${st}”，网站证书栏只能选证书名称，默认不填；如需填写请在页面上手动选择`] };
  }
  if (f.kind === 'text' || f.kind === 'textarea') return { level: 'high', value: { t: 'text', text: name }, display: name, reasons: [] };
  if (isChoice(f.kind)) return enumOutcome(f, certAliases(name), name, 'low', f.options, f.optionsPartial ?? true);
  const category = typeof record?.category === 'string' ? record.category : undefined;
  return {
    level: 'high',
    value: { t: 'popup-pick', names: certAliases(name), categories: certCategoryHints(name, category) },
    display: name,
    reasons: ['在网站的证书弹窗里找名字一样的证书（“CET6”“英语六级”这类叫法都算）；找不到就列出相近的给你选'],
  };
}

/** 技能名称的几种写法：“Excel（数据透视表、常用函数）”→ Excel；“Python/SQL”→ Python、SQL。 */
export function skillAliases(name: string): string[] {
  const base = name.replace(/[（(][^）)]*[）)]/g, '').trim();
  const parts = base.split(/[\/／、,，]/).map((s) => s.trim()).filter(Boolean);
  return [...new Set([name.trim(), base, ...parts].filter(Boolean))];
}

/** 排名“15/180”“前 8%”→ 百分比。 */
export function rankPercent(raw: string): number | undefined {
  const frac = raw.match(/^\s*(\d+)\s*[/／]\s*(\d+)\s*$/);
  if (frac && Number(frac[2]) > 0) return (Number(frac[1]) / Number(frac[2])) * 100;
  const pct = raw.match(/(\d+(?:\.\d+)?)\s*[%％]/);
  return pct ? Number(pct[1]) : undefined;
}

/** 档案排名 → 页面“前 5% / 前 10% …”档位：取能包含该排名的最小档，需本人确认。 */
function rankOutcome(f: FieldDescriptor, raw: string, options?: string[]): ValueOutcome | undefined {
  const pct = rankPercent(raw);
  if (pct === undefined || !options?.length) return undefined;
  const buckets = options
    .map((o) => ({ o, n: Number(norm(o).match(/^前(\d+(?:\.\d+)?)[%％]$/)?.[1]) }))
    .filter((b) => Number.isFinite(b.n))
    .sort((a, b) => a.n - b.n);
  const hit = buckets.find((b) => pct <= b.n)?.o ?? options.find((o) => norm(o) === '其他');
  if (!hit) return undefined;
  return {
    level: 'medium',
    derived: true,
    candidates: [{ value: choiceValue(f.kind, hit), display: hit }],
    reasons: [`档案排名“${raw}”约为前 ${Math.round(pct * 10) / 10}%，对应“${hit}”，请确认`],
  };
}

function valueFor(rule: PathRule, raw: unknown, f: FieldDescriptor, fr: FieldRule | undefined, ctx: PlanContext, record?: Record<string, unknown>): ValueOutcome {
  const options = f.options ?? fr?.knownOptions;
  const partial = f.options ? !!f.optionsPartial : !!fr?.optionsPartial || !fr?.knownOptions;
  switch (rule.valueType) {
    case 'manual':
      return { level: 'skip', skipReason: 'manual', reasons: [fr?.manual ?? rule.manualNote ?? '需要本人完成'] };
    case 'text': {
      const text = String(raw);
      if (isChoice(f.kind)) {
        const o = enumOutcome(f, [text], text, rule.sensitivity, options, partial);
        if (rule.key === 'education.rank' && o.level === 'skip') return rankOutcome(f, text, options) ?? o;
        return o;
      }
      return { level: 'high', value: { t: 'text', text }, display: text, reasons: [] };
    }
    case 'number': {
      const text = String(raw);
      if (isChoice(f.kind)) {
        // 月薪下拉常写成“8千”“1.2万”
        const aliases = rule.key.startsWith('intention.salary') ? moneyAliases(Number(raw)) : [text];
        return enumOutcome(f, aliases.length ? aliases : [text], text, rule.sensitivity, options, partial);
      }
      return { level: 'high', value: { t: 'text', text }, display: text, reasons: [] };
    }
    case 'longtext': {
      const texts = (Array.isArray(raw) ? raw : [raw]).map(String);
      const short = (text: string) => (text.length > 40 ? text.slice(0, 40) + '…' : text);
      return {
        level: 'medium',
        longtext: true,
        candidates: texts.map((text) => ({ value: { t: 'text', text }, display: short(text) })),
        reasons: [texts.length > 1 ? `档案里有 ${texts.length} 段文字可用，请选一段` : '原样填入你在档案里写好的这段文字，不改写'],
      };
    }
    case 'enum':
    case 'derived-highest-level': {
      const key = String(raw);
      const aliases = aliasesFor(rule.dict, key);
      if (f.kind === 'custom-popup') {
        // 网站弹窗（如智联语言证书）：按别名在弹窗里查找名称一致的一项
        return { level: 'high', value: { t: 'popup-pick', names: aliases }, display: displayFor(rule.dict, key), reasons: ['在网站的选择弹窗里找名字一样的一项；找不到就列出相近的给你选'] };
      }
      const o = enumOutcome(f, aliases, displayFor(rule.dict, key), rule.sensitivity, options, partial, otherAliases(rule.dict, key));
      if (rule.valueType === 'derived-highest-level' && o.level === 'high') {
        return { ...o, level: 'medium', derived: true, candidates: o.value ? [{ value: o.value, display: o.display ?? '' }] : undefined, value: undefined, reasons: [...o.reasons, '档案里没直接写，是从教育经历推出来的'] };
      }
      const guessed =
        (rule.key === 'education.admissionType' && record && isBlank(record.admissionType)) ||
        (rule.key === 'education.isOverseas' && record && isBlank(record.admissionType) && isBlank(record.schoolCountry));
      if (guessed && o.level === 'high') {
        return { ...o, level: 'medium', derived: true, candidates: o.value ? [{ value: o.value, display: o.display ?? '' }] : undefined, value: undefined, reasons: [...o.reasons, '档案里没写这一项，按最常见的情况先选；海外院校请改（选了海外院校候选时网站会自动改好）'] };
      }
      return o;
    }
    case 'years': {
      const n = Number(raw);
      const o = enumOutcome(f, yearsAliases(n), `${n}年`, rule.sensitivity, options, partial);
      return o;
    }
    case 'date':
      return dateOutcome(f, String(raw), false);
    case 'date-or-present':
      return dateOutcome(f, String(raw), true);
    case 'period':
      return periodOutcome(f, raw as { start?: string; end?: string });
    case 'region':
      return regionOutcome(f, raw as Region, rule.sensitivity, options, partial);
    case 'derived-highest-region': {
      const o = regionOutcome(f, raw as Region, rule.sensitivity, options, partial);
      if (o.level === 'high') {
        return { ...o, level: 'medium', derived: true, candidates: o.value ? [{ value: o.value, display: o.display ?? '' }] : undefined, value: undefined, reasons: [...o.reasons, '档案里没直接写，是从最高学历那条推出来的'] };
      }
      return o;
    }
    case 'major-category': {
      const segs = String(raw)
        .split(/[/／]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const last = segs[segs.length - 1];
      if (options && options.length && !partial) {
        const m = matchPathSuffix(segs, options);
        if (m.status === 'exact') return { level: 'high', value: { t: 'option', text: m.option, search: last }, display: m.option, reasons: ['网页的专业分类和档案对得上'] };
        if (m.status === 'multiple') return { level: 'medium', candidates: m.candidates.map((c) => ({ value: { t: 'option', text: c, search: last }, display: c })), reasons: [m.why] };
        return { level: 'skip', skipReason: 'no-option', reasons: ['网页的专业分类里找不到这个专业'] };
      }
      return {
        level: 'high',
        value: { t: 'option', text: segs.join(' / '), search: last, match: 'suffix', accept: [segs.join('/')] },
        display: segs.join(' / '),
        reasons: [`搜索“${last}”，只选择路径以“${segs.join('/')}”结尾且唯一的一项`],
      };
    }
    case 'school': {
      const school = String(raw);
      if (f.kind === 'remote-select') {
        return { level: 'high', value: { t: 'remote-option', query: school, accept: [school] }, display: school, reasons: ['输入完整校名，在弹出的候选里点名字一样的那个'] };
      }
      if (isChoice(f.kind)) return enumOutcome(f, [school], school, rule.sensitivity, options, partial);
      return { level: 'high', value: { t: 'text', text: school }, display: school, reasons: [] };
    }
    case 'certificate':
      return certificateOutcome(f, String(raw), record);
    case 'regions': {
      const list = (Array.isArray(raw) ? raw : [raw]).filter((r): r is Region => !!r && typeof r === 'object' && 'province' in r);
      if (!list.length) return { level: 'skip', skipReason: 'no-profile-value', reasons: ['档案中没有期望城市'] };
      if (f.kind !== 'cascader') return { level: 'skip', skipReason: 'manual', reasons: [rule.manualNote ?? '请手动选择'] };
      const display = list.map(displayRegion).join('、');
      return { level: 'high', value: { t: 'cascade-multi', paths: list.map(regionPath) }, display, reasons: [`在城市弹窗里逐个选择（${list.length} 个），只选名称一致的项`] };
    }
    case 'skill': {
      const name = String(raw);
      const names = skillAliases(name);
      if (f.kind === 'custom-popup') return { level: 'high', value: { t: 'popup-pick', names }, display: name, reasons: [`在技能弹窗里按名称查找“${names.join('”或“')}”，只选名称一致的一项`] };
      if (isChoice(f.kind)) return enumOutcome(f, names, name, rule.sensitivity, options, partial);
      return { level: 'high', value: { t: 'text', text: name }, display: name, reasons: [] };
    }
    case 'has-level': {
      // 只有档案中有该层级记录时才选“本人有该段学历”；绑定了记录即代表有。
      if (!ctx.record) return { level: 'skip', skipReason: 'manual', reasons: ['声明性质的回答，请本人确认'] };
      const yes = ['本人有该段学历', '有', '是'];
      const o = enumOutcome(f, yes, '本人有该段学历', 'low', options, partial);
      return { ...o, reasons: [...o.reasons, '档案中有这段学历记录'] };
    }
  }
}

function emptyItem(f: FieldDescriptor, order: number): Omit<PlanItem, 'level' | 'reasons'> {
  return { fieldKey: f.key, label: f.label, section: f.section, sensitivity: 'low', order, kind: f.kind };
}

/** 生成计划。返回值按执行顺序排序（依赖字段在前）。 */
export function buildPlan(fields: FieldDescriptor[], ctx: PlanContext): PlanItem[] {
  const items: PlanItem[] = [];
  const recordsCache = new Map<string, Record<string, unknown>[]>();
  const usedPaths = new Set<string>();
  // 通用识别时自定义字段只做标签完全相等（按高敏感处理）
  const customRules: PathRule[] = (ctx.profile.custom ?? []).map((c) => customRule(c, 'high'));

  fields.forEach((f, i) => {
    if (!f.visible) return;
    const base = emptyItem(f, i);
    const fr = adapterRuleFor(f, ctx.adapter);
    const scope = scopeFor(f, ctx);

    // 适配器声明的锁定 / 手动字段
    if (fr?.locked || (f.disabled && !fr?.path)) {
      items.push({ ...base, level: 'skip', skipReason: 'locked', reasons: [fr?.note ?? '网站已锁定该字段（实名信息等），工具不写入'] });
      return;
    }
    if (fr?.manual) {
      items.push({ ...base, level: 'skip', skipReason: 'manual', reasons: [fr.manual] });
      return;
    }

    // 确定规则：适配器字典优先，其次通用语义词典
    let rule: PathRule | undefined;
    let fieldLevel: Level;
    let score: number | undefined;
    const reasons: string[] = [];
    if (fr?.path?.startsWith('custom.')) {
      const c = adapterCustomField(fr.path, f, ctx.profile);
      if (!c) {
        items.push({ ...base, path: fr.path, level: 'skip', skipReason: 'no-profile-value', reasons: [`网页的“${f.label.trim()}”原本对应档案里的一个自定义字段，但档案里已经没有它了；请在档案管理的“自定义字段”里加回来`] });
        return;
      }
      rule = customRule(c, c.sensitivity ?? 'medium');
      fieldLevel = 'high';
      reasons.push(`网页的“${f.label.trim()}”对应档案里的自定义字段“${c.label}”`);
    } else if (fr?.path && RULES_BY_KEY[fr.path]) {
      rule = RULES_BY_KEY[fr.path];
      fieldLevel = 'high';
      reasons.push(`网页的“${f.label.trim()}”对应档案里的“${fieldName(rule)}”（${ctx.adapter?.name ?? '本网站'}专用对应表）`);
    } else {
      const bm = bestMatch(f, scope, scope === 'single' ? customRules : []);
      const ev: MatchEvidence | undefined = bm.evidence;
      if (!ev) {
        items.push({ ...base, level: 'low', skipReason: 'unrecognized', reasons: ['档案里找不到和这一栏对应的内容'] });
        return;
      }
      rule = ev.rule;
      score = ev.score;
      fieldLevel = levelFromScore(ev.score);
      reasons.push(`网页的“${f.label.trim()}”应该是档案里的“${fieldName(rule)}”：`, ...ev.reasons);
    }
    const dependency = fr?.dependency ?? rule.dependency;
    const kind = fr?.kind ?? f.kind;
    const fd: FieldDescriptor = kind === f.kind ? f : { ...f, kind };

    if (f.disabled) {
      items.push({ ...base, path: rule.key, level: 'skip', skipReason: 'locked', sensitivity: rule.sensitivity, reasons: [...reasons, '网站不允许修改这一栏'] });
      return;
    }
    if (fieldLevel === 'low') {
      items.push({ ...base, path: rule.key, level: 'low', skipReason: 'low-confidence', score, sensitivity: rule.sensitivity, reasons });
      return;
    }

    // 绑定记录
    let record = ctx.record;
    if (!record && scope !== 'single') {
      if (!recordsCache.has(scope)) {
        const arr = ((ctx.profile as unknown as Record<string, Record<string, unknown>[] | undefined>)[scope] ?? []) as Array<Record<string, unknown> & { id: string }>;
        recordsCache.set(scope, ctx.adapter?.orderRecords ? ctx.adapter.orderRecords(scope as RecordCollection, arr) : arr);
      }
      record = recordsCache.get(scope)![f.formIndex] as (Record<string, unknown> & { id: string }) | undefined;
    }

    // 自定义字段
    let raw: unknown;
    if (rule.key.startsWith('custom.')) {
      raw = ctx.profile.custom?.find((c) => `custom.${c.id}` === rule!.key)?.value;
    } else {
      raw = profileValue(rule, ctx, record);
    }
    const path = record && scope !== 'single' ? `${scope}[${record.id}].${rule.key.slice(scope.length + 1)}` : rule.key;
    const dupKey = `${f.sectionKey ?? f.section}|${f.formIndex}|${path}`;
    if (usedPaths.has(dupKey)) {
      items.push({ ...base, path, recordId: record?.id, level: 'skip', skipReason: 'duplicate', sensitivity: rule.sensitivity, reasons: ['和上一栏是同一项内容，只填一次'] });
      return;
    }
    usedPaths.add(dupKey);

    if (rule.valueType !== 'manual' && isBlank(raw)) {
      items.push({ ...base, path, recordId: record?.id, level: 'skip', skipReason: 'no-profile-value', sensitivity: rule.sensitivity, reasons: [...reasons, scope !== 'single' && !record ? '档案里没有对应的这一条经历' : '档案里没填这一项，可以去档案管理补上'] });
      return;
    }
    if (!f.isEmpty && !ctx.allowOverwrite && rule.valueType !== 'manual') {
      items.push({ ...base, path, recordId: record?.id, level: 'skip', skipReason: 'has-value', sensitivity: rule.sensitivity, reasons: [...reasons, '网页上这一栏已经有内容，不覆盖'] });
      return;
    }

    const vo = valueFor(rule, raw, fd, fr, ctx, record);
    let level = vo.level === 'skip' ? 'skip' : minLevel(fieldLevel, vo.level);
    let value = vo.value;
    let candidates = vo.candidates;
    // 字段置信度为中时，高置信的值也只作为候选
    if (level === 'medium' && value) {
      candidates = [{ value, display: vo.display ?? '' }];
      value = undefined;
    }
    if (rule.sensitivity === 'high' && level === 'medium') {
      level = 'skip';
      items.push({ ...base, path, level, skipReason: 'sensitive-ambiguous', sensitivity: 'high', reasons: [...reasons, ...vo.reasons, '高敏感字段只在完全确定时填写'] });
      return;
    }
    items.push({
      ...base,
      kind,
      path,
      recordId: record?.id,
      level,
      value: level === 'high' ? value : undefined,
      display: vo.display,
      candidates: level === 'medium' ? candidates : undefined,
      needsDetail: vo.needsDetail,
      skipReason: vo.skipReason,
      sensitivity: rule.sensitivity,
      longtext: vo.longtext,
      derived: vo.derived,
      dependency,
      score,
      reasons: [...reasons, ...vo.reasons],
    });
  });

  return items.sort((a, b) => (a.dependency === b.dependency ? a.order - b.order : a.dependency ? -1 : 1));
}

/** 统计，用于预览标题。 */
export function summarize(items: PlanItem[]): Record<Level, number> {
  const s: Record<Level, number> = { high: 0, medium: 0, low: 0, skip: 0 };
  for (const it of items) s[it.level]++;
  return s;
}

export { formatDate };
