// 证书名称匹配：档案里的证书名 ↔ 网站证书弹窗里的证书项。
// 只认“名称一致”（含常见别名、去掉“证书/资格证”等后缀）；相近的只作为候选，由本人确认。
import { norm } from './text';

export interface CertLeaf {
  category: string;
  name: string;
}

/** 同一证书的常见叫法（每组互为别名），以及它通常所在的弹窗分类。 */
const GROUPS: Array<{ names: string[]; categories: string[] }> = [
  { names: ['初级会计专业技术资格', '初级会计职称', '初级会计师', '初级会计资格', '初级会计'], categories: ['会计类'] },
  { names: ['中级会计专业技术资格', '中级会计职称', '中级会计师', '中级会计资格', '中级会计'], categories: ['会计类'] },
  { names: ['高级会计专业技术资格', '高级会计职称', '高级会计师'], categories: ['会计类'] },
  { names: ['注册会计师', '中国注册会计师', 'CPA', '注册会计师CPA'], categories: ['会计类', '审计类'] },
  { names: ['ACCA', '特许公认会计师', 'ACCA特许公认会计师'], categories: ['会计类'] },
  { names: ['CMA', '美国注册管理会计师', '注册管理会计师'], categories: ['会计类'] },
  { names: ['税务师', '注册税务师'], categories: ['会计类'] },
  { names: ['CIA', '国际注册内部审计师', '国际内部审计师'], categories: ['审计类'] },
  { names: ['CFA', '特许金融分析师', 'CFA特许金融分析师'], categories: ['金融类'] },
  { names: ['FRM', '金融风险管理师'], categories: ['金融类'] },
  { names: ['证券从业资格', '证券从业人员资格', '证券从业'], categories: ['金融类'] },
  { names: ['基金从业资格', '基金从业人员资格', '基金从业'], categories: ['金融类'] },
  { names: ['银行从业资格', '银行业专业人员职业资格', '银行从业'], categories: ['金融类'] },
  { names: ['期货从业资格', '期货从业人员资格', '期货从业'], categories: ['金融类'] },
  { names: ['法律职业资格', '法律职业资格考试', '法考', '司法考试'], categories: ['法律类'] },
  { names: ['教师资格', '教师资格证'], categories: ['教育类'] },
  { names: ['普通话水平测试', '普通话等级', '普通话'], categories: ['汉语类'] },
  { names: ['全国计算机等级考试二级', '计算机二级', 'NCRE二级'], categories: ['IT类'] },
  { names: ['雅思', 'IELTS', '雅思IELTS'], categories: ['英语类'] },
  // 英语考试：智联证书弹窗里叫“全国大学英语六级考试(CET6)”“英语专业八级考试(TEM-8)”
  { names: ['大学英语四级', 'CET4', 'CET-4', '英语四级', '全国大学英语四级考试'], categories: ['全国大学英语考试（CET）', '英语类'] },
  { names: ['大学英语六级', 'CET6', 'CET-6', '英语六级', '全国大学英语六级考试'], categories: ['全国大学英语考试（CET）', '英语类'] },
  { names: ['英语专业四级', 'TEM4', 'TEM-4', '专四', '英语专业四级考试'], categories: ['英语专业考试（TEM）', '英语类'] },
  { names: ['英语专业八级', 'TEM8', 'TEM-8', '专八', '英语专业八级考试'], categories: ['英语专业考试（TEM）', '英语类'] },
  { names: ['托业', 'TOEIC'], categories: ['托业（TOEIC）', '英语类'] },
  { names: ['托福', 'TOEFL', '托福TOEFL'], categories: ['英语类'] },
  { names: ['PMP', '项目管理专业人士资格'], categories: ['项目管理类'] },
];

const SUFFIX = /(资格证书|资格证|证书|证|认证|考试)$/;

/** 比较用的几种写法：原样、去括号说明、括号内文字、去“证书/资格证”等后缀。 */
export function certKeys(s: string): string[] {
  const n = norm(s);
  const out = new Set<string>([n]);
  const noParen = n.replace(/\([^)]*\)/g, '');
  if (noParen) out.add(noParen);
  for (const m of n.matchAll(/\(([^)]+)\)/g)) out.add(m[1]);
  for (const k of [...out]) {
    let t = k;
    while (SUFFIX.test(t) && t.replace(SUFFIX, '').length >= 2) t = t.replace(SUFFIX, '');
    out.add(t);
  }
  return [...out].filter(Boolean);
}

/** 名称中的英文缩写（如 IELTS、CPA），用于“雅思IELTS”这类中英混写。 */
function asciiTokens(s: string): string[] {
  return (norm(s).match(/[a-z][a-z0-9]{2,}/g) ?? []).filter((t) => !/^\d+$/.test(t));
}

function groupOf(name: string): (typeof GROUPS)[number] | undefined {
  const keys = certKeys(name);
  return GROUPS.find((g) => g.names.some((a) => certKeys(a).some((k) => keys.includes(k))));
}

/** 档案证书名的全部可接受叫法（原名 + 别名组）。 */
export function certAliases(name: string): string[] {
  const g = groupOf(name);
  return [...new Set([name, ...(g?.names ?? [])])];
}

/** 优先查找的弹窗分类：档案里写的分类在前，其次是别名组的常见分类。 */
export function certCategoryHints(name: string, category?: string): string[] {
  return [...new Set([...(category ? [category] : []), ...(groupOf(name)?.categories ?? [])])];
}

/**
 * exact：名称一致（规整后相等、去后缀后相等，或纯英文缩写与证书项里的缩写相同）；
 * loose：证书项包含档案名（≥2 个字）或档案名包含证书项（≥3 个字），只作为候选。
 */
export function matchCertLeaves(leaves: CertLeaf[], accept: string[]): { exact: CertLeaf[]; loose: CertLeaf[] } {
  const accKeys = new Set(accept.flatMap(certKeys));
  const accAscii = new Set(accept.filter((a) => /^[a-z0-9]+$/i.test(a.trim())).map((a) => a.trim().toLowerCase()).filter((a) => a.length >= 3));
  const exact: CertLeaf[] = [];
  const loose: CertLeaf[] = [];
  for (const leaf of leaves) {
    const lk = certKeys(leaf.name);
    if (lk.some((k) => accKeys.has(k)) || asciiTokens(leaf.name).some((t) => accAscii.has(t))) {
      exact.push(leaf);
      continue;
    }
    // 相近只作候选（本人确认），所以档案名短到 2 个字（“证券”）也给出
    const near = lk.some((k) => [...accKeys].some((a) => (a.length >= 2 && k.includes(a)) || (k.length >= 3 && a.includes(k))));
    if (near) loose.push(leaf);
  }
  return { exact, loose };
}

/** 去重：同名证书出现在多个分类里时只保留第一个（调用方按优先分类排序）。 */
export function uniqueByName(leaves: CertLeaf[]): CertLeaf[] {
  const seen = new Set<string>();
  return leaves.filter((l) => {
    const k = norm(l.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const certPath = (l: CertLeaf): string => `${l.category} / ${l.name}`;
