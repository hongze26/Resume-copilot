// 没有内置适配器的网站：用本次扫描到的页面区块，临时组装一份“适配器规则”。
//
// 这样通用识别、定制适配器和内置适配器走同一条流程（扫描 → 按区块出计划 → 绑定档案记录 → 确认 → 填写），
// 侧边栏不需要为通用页面另写一套。区块属于哪类信息，优先听定制适配器的，其次按标题猜（core/matcher/sections.ts）。
import { norm } from '../core/normalize/text';
import { guessSection, sectionCore } from '../core/matcher/sections';
import type { RecordCollection } from '../core/profile/types';
import type { CustomAdapterDef } from './custom';
import type { AdapterRules, FieldRule, SectionRule } from './types';

export interface PageSection {
  key: string;
  title: string;
}

const sameTitle = (a: string, b: string) => norm(sectionCore(a)) === norm(sectionCore(b));

/** 已保存记录的比对关键字（学校名、单位名…）：页面文字里同时出现这些字就算“页面中已存在”。 */
export function recordKeysFor(collection: RecordCollection, record: Record<string, unknown>): string[] {
  const pick = (k: string) => (typeof record[k] === 'string' && record[k] ? [String(record[k])] : []);
  switch (collection) {
    case 'education':
      return pick('school');
    case 'work':
      return pick('company');
    case 'languages':
      return pick('certificate');
    default:
      return pick('name');
  }
}

function sectionRule(s: PageSection, def?: CustomAdapterDef): SectionRule {
  const custom = def?.sections.find((c) => sameTitle(c.title, s.title));
  const guess = custom ? { collection: custom.collection, manualNote: custom.manualNote } : guessSection(s.title);
  if (guess.collection === 'manual') return { key: s.key, titles: [s.title], mode: 'manual', manualNote: guess.manualNote ?? '这一栏需本人完成' };
  if (guess.collection === 'single') return { key: s.key, titles: [s.title], mode: 'single', collection: 'single' };
  return { key: s.key, titles: [s.title], mode: 'repeat', collection: guess.collection };
}

/** 定制适配器的字段对应关系，换成本次扫描的区块键（按区块标题对应）。 */
function customFields(def: CustomAdapterDef, sections: PageSection[]): FieldRule[] {
  const out: FieldRule[] = [];
  for (const f of def.fields) {
    if (!f.path && !f.manual) continue;
    const title = def.sections.find((s) => s.key === f.section)?.title;
    const page = title ? sections.filter((s) => sameTitle(s.title, title)) : [];
    for (const p of page) {
      const base = { section: p.key, ...(f.manual ? { manual: f.manual } : {}), ...(f.path ? { path: f.path } : {}) };
      if (f.id) out.push({ ...base, id: f.id });
      out.push({ ...base, label: f.label });
    }
  }
  return out;
}

/**
 * 组装规则。base 是通用规则或定制适配器的静态规则（名称、权限、说明文字）；
 * sections 是页面上找到的区块（键在一次页面生命周期内稳定）。
 */
export function composeRules(base: AdapterRules, sections: PageSection[], def?: CustomAdapterDef): AdapterRules {
  return {
    ...base,
    allowExecute: true,
    sections: sections.map((s) => sectionRule(s, def)),
    fields: def ? customFields(def, sections) : [],
    recordKeys: (collection, record) => recordKeysFor(collection, record),
  };
}
