// 规则匹配与打分（第 6 节）。纯函数，不接触 DOM。
import { coreLabel, norm } from '../normalize/text';
import { DICTS, type Dict } from '../normalize/dicts';
import type { FieldDescriptor, ControlKind } from '../plan/types';
import { PATH_RULES, type PathRule, type ValueType } from './semantic';

export const SCORE = {
  // 标签与同义词完全相等 + 区块吻合 = 85（高）；只有标签相等 = 65（中，需确认）
  exactLabel: 65,
  containsLabel: 35,
  section: 20,
  idName: 15,
  placeholder: 10,
  optionsOverlap: 15,
  conflict: -50,
} as const;

export const HIGH_THRESHOLD = 85;
export const MEDIUM_THRESHOLD = 60;

export interface MatchEvidence {
  rule: PathRule;
  score: number;
  labelEvidence: 'exact' | 'contains' | 'none';
  reasons: string[];
  conflict?: string;
}

/** 控件能否承载该值类型（6.2 第 4 步）。 */
export function kindCompatible(vt: ValueType, kind: ControlKind): boolean {
  const textual = kind === 'text' || kind === 'textarea';
  const choice = kind === 'select' || kind === 'native-select' || kind === 'radio' || kind === 'radio-button' || kind === 'remote-select';
  switch (vt) {
    case 'text':
      return textual || kind === 'number' || choice;
    case 'longtext':
      return textual;
    case 'number':
      return textual || kind === 'number' || choice;
    case 'enum':
    case 'years':
    case 'derived-highest-level':
      return choice || textual;
    case 'date':
    case 'date-or-present':
      return kind === 'date' || textual;
    case 'period':
      return kind === 'date-range';
    case 'region':
    case 'derived-highest-region':
      return kind === 'cascader' || choice || textual || kind === 'custom-popup';
    case 'major-category':
      return choice || kind === 'cascader';
    case 'certificate':
      return kind === 'cascader' || kind === 'custom-popup' || choice || textual;
    case 'regions':
      return kind === 'cascader' || kind === 'custom-popup' || textual;
    case 'skill':
      return kind === 'custom-popup' || choice || textual;
    case 'school':
      return kind === 'remote-select' || kind === 'select' || textual;
    case 'has-level':
      return kind === 'radio-button' || kind === 'radio' || choice;
    case 'manual':
      return true;
  }
}

function idTokens(d: FieldDescriptor): string {
  return [d.id, d.name].filter(Boolean).map((s) => norm(s)).join(' ');
}

function optionsOverlap(rule: PathRule, options: string[] | undefined): boolean {
  if (!rule.dict || !options || options.length === 0) return false;
  const all = new Set<string>();
  for (const aliases of Object.values(DICTS[rule.dict] as Dict)) aliases.forEach((a) => all.add(norm(a)));
  const hit = options.filter((o) => all.has(norm(o))).length;
  return hit / options.length >= 0.8;
}

/** 对单个字段，按作用域给每条规则打分。 */
export function scoreRules(d: FieldDescriptor, scope: PathRule['scope'], extraRules: PathRule[] = []): MatchEvidence[] {
  const label = coreLabel(d.label);
  const fullLabel = norm(d.label);
  const section = norm(d.section);
  const ids = idTokens(d);
  const ph = norm(d.placeholder);
  const out: MatchEvidence[] = [];
  for (const rule of [...PATH_RULES, ...extraRules]) {
    if (rule.scope !== scope) continue;
    const reasons: string[] = [];
    let score = 0;
    let labelEvidence: MatchEvidence['labelEvidence'] = 'none';
    const syn = rule.synonyms.map(norm);
    if (label && (syn.includes(label) || syn.includes(fullLabel))) {
      score += SCORE.exactLabel;
      labelEvidence = 'exact';
      reasons.push(`网页上这一栏叫“${d.label.trim()}”，和档案里的叫法一样`);
    } else if (label) {
      const kw = [...syn, ...(rule.keywords ?? []).map(norm)].filter((s) => s.length >= 2);
      const hit = kw.find((s) => label.includes(s));
      if (hit) {
        score += SCORE.containsLabel;
        labelEvidence = 'contains';
        reasons.push(`网页上这一栏的名称里有“${hit}”`);
      }
    }
    if (labelEvidence === 'none' && !(rule.idHints ?? []).some((h) => ids.split(' ').includes(norm(h)))) continue;
    if (rule.sections?.some((s) => section.includes(norm(s)))) {
      score += SCORE.section;
      reasons.push('它所在的区块也对得上');
    }
    if ((rule.idHints ?? []).some((h) => ids.split(' ').includes(norm(h)))) {
      score += SCORE.idName;
      reasons.push('网页内部的字段名也对得上');
    }
    if (ph && syn.some((s) => s.length >= 2 && ph.includes(s))) {
      score += SCORE.placeholder;
      reasons.push('输入框里的灰色提示文字也对得上');
    }
    if (optionsOverlap(rule, d.options)) {
      score += SCORE.optionsOverlap;
      reasons.push('下拉里的选项和档案这一项的取值一致');
    }
    const ex = rule.exclude?.find((e) => fullLabel.includes(norm(e)));
    let conflict: string | undefined;
    if (ex) {
      score += SCORE.conflict;
      conflict = `但名称里有“${ex}”，意思可能不一样`;
      reasons.push(conflict);
    }
    if (!kindCompatible(rule.valueType, d.kind)) {
      continue;
    }
    out.push({ rule, score, labelEvidence, reasons, conflict });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

export interface BestMatch {
  evidence?: MatchEvidence;
  ambiguousWith?: MatchEvidence;
}

/**
 * 选出最佳规则，并做冲突对检查（6.2 第 3 步）：
 * 两条不同规则的标签证据同等强（都是包含，或都完全相等）→ 视为未消歧，最佳规则 −50。
 * 高敏感规则只接受“标签完全相等”，打分路径禁用。
 */
export function bestMatch(d: FieldDescriptor, scope: PathRule['scope'], extraRules: PathRule[] = []): BestMatch {
  const all = scoreRules(d, scope, extraRules).filter((e) => {
    if (e.rule.sensitivity === 'high') return e.labelEvidence === 'exact' && !e.conflict;
    return true;
  });
  if (all.length === 0) return {};
  const [first, second] = all;
  if (second && second.rule.key !== first.rule.key && second.labelEvidence !== 'none' && second.labelEvidence === first.labelEvidence) {
    const adjusted: MatchEvidence = {
      ...first,
      score: first.score + SCORE.conflict,
      conflict: `标签同时像“${second.rule.synonyms[0]}”，无法区分`,
      reasons: [...first.reasons, `这个名称也像档案里的“${second.rule.synonyms[0]}”，分不清是哪一个`],
    };
    return { evidence: adjusted, ambiguousWith: second };
  }
  return { evidence: first };
}

export function levelFromScore(score: number): 'high' | 'medium' | 'low' {
  if (score >= HIGH_THRESHOLD) return 'high';
  if (score >= MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}
