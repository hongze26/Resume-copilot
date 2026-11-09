// 枚举词表：规范键 → 别名（第一个是首选显示文字）。
// 别名只用于“完全相等”判断（经 norm 规整后）。歧义词（如“研究生”）不放进任何一个键，
// 只在 AMBIGUOUS 中登记，用于把“包含关系”降为中置信。

export type Dict = Record<string, string[]>;

export const EDUCATION_LEVEL: Dict = {
  doctor: ['博士', '博士研究生', '研究生(博士)', '博士研究生学历', 'Doctor', 'PhD'],
  master: ['硕士', '硕士研究生', '研究生(硕士)', '硕士研究生学历', 'Master'],
  bachelor: ['本科', '大学本科', '本科学历', 'Bachelor'],
  'junior-college': ['专科', '大专', '高职', '专科(高职)', '大学专科'],
  'secondary-vocational': ['中专/中技', '中专', '中技', '技校', '中等专业学校'],
  'high-school': ['高中', '普通高中'],
  'junior-high-or-below': ['初中及以下', '初中', '初中以下'],
};

export const DEGREE: Dict = {
  doctor: ['博士', '博士学位'],
  master: ['硕士', '硕士学位'],
  bachelor: ['学士', '学士学位'],
  none: ['无', '无学位'],
  other: ['其他'],
};

export const POLITICAL_STATUS: Dict = {
  // 智联校园把党员和预备党员合成一项“中共党员（含预备党员）”
  'cpc-member': ['中共党员', '中国共产党党员', '党员', '中共党员（含预备党员）'],
  'cpc-probationary': ['中共预备党员', '预备党员', '中共党员（含预备党员）'],
  'cyl-member': ['共青团员', '团员', '中国共产主义青年团团员'],
  'democratic-party': ['民主党派', '民主党派成员'],
  'non-party': ['无党派人士', '无党派民主人士'],
  masses: ['群众'],
  other: ['其他'],
};

export const GENDER: Dict = { male: ['男'], female: ['女'] };

export const ID_TYPE: Dict = {
  'resident-id': ['居民身份证', '身份证', '二代身份证', '中华人民共和国居民身份证'],
  passport: ['护照'],
  'hk-macau-pass': ['港澳居民来往内地通行证', '港澳通行证', '回乡证'],
  'taiwan-pass': ['台湾居民来往大陆通行证', '台湾通行证', '台胞证'],
  other: ['其他'],
};

/** 技能/语言掌握程度：一般 / 良好 / 熟练 / 精通。 */
export const SKILL_LEVEL: Dict = {
  basic: ['一般', '了解', '入门', '掌握'],
  good: ['良好', '较好'],
  proficient: ['熟练'],
  expert: ['精通'],
};

export const MARITAL: Dict = {
  unmarried: ['未婚'],
  married: ['已婚'],
  divorced: ['离异', '离婚'],
  widowed: ['丧偶'],
};

export const TRI_STATE: Dict = {
  yes: ['是', '有', '接受', '服从', '愿意'],
  no: ['否', '无', '不接受', '不服从', '不愿意'],
};

export const ADMISSION: Dict = {
  unified: ['统招', '统招全日制', '全日制统分统招'],
  'non-unified': ['非统招'],
  'non-mainland': ['非内地院校', '境外院校', '海外院校', '海外留学'],
};

export const STUDY_MODE: Dict = {
  'full-time': ['全日制'],
  'part-time': ['非全日制'],
};

export const WORK_KIND: Dict = {
  'full-time': ['全职'],
  'part-time': ['兼职'],
  internship: ['实习'],
};

export const LANGUAGE_CERT: Dict = {
  CET4: ['大学英语四级CET4', '大学英语四级', '英语四级', 'CET-4', 'CET4', '四级'],
  CET6: ['大学英语六级CET6', '大学英语六级', '英语六级', 'CET-6', 'CET6', '六级'],
  TEM4: ['英语专业四级TEM4', '英语专业四级', '专业四级', 'TEM-4', 'TEM4'],
  TEM8: ['英语专业八级TEM8', '英语专业八级', '专业八级', 'TEM-8', 'TEM8'],
  IELTS: ['雅思IELTS', '雅思', 'IELTS'],
  TOEFL: ['托福TOEFL', '托福', 'TOEFL'],
  GRE: ['GRE美国研究生入学考试', 'GRE'],
  GMAT: ['GMAT商科研究生入学考试', 'GMAT'],
  CATTI: ['CATTI翻译专业资格(水平)认证考试', 'CATTI'],
};

export const NATIONALITY: Dict = {
  中国: ['中国', '中华人民共和国', '中国大陆', 'China'],
};

export const HONOR_LEVEL: Dict = {
  international: ['国际级'],
  national: ['国家级'],
  provincial: ['省部级', '省级'],
  city: ['地市级', '市级'],
  enterprise: ['企业级'],
  school: ['学校级', '校级'],
  department: ['院系级', '院级'],
  other: ['其他'],
};

export const HONOR_GRADE: Dict = {
  special: ['特等奖'],
  first: ['一等奖'],
  second: ['二等奖'],
  third: ['三等奖'],
  other: ['其他'],
};

export const ETHNIC_GROUPS = [
  '汉族', '蒙古族', '回族', '藏族', '维吾尔族', '苗族', '彝族', '壮族', '布依族', '朝鲜族',
  '满族', '侗族', '瑶族', '白族', '土家族', '哈尼族', '哈萨克族', '傣族', '黎族', '傈僳族',
  '佤族', '畲族', '高山族', '拉祜族', '水族', '东乡族', '纳西族', '景颇族', '柯尔克孜族', '土族',
  '达斡尔族', '仫佬族', '羌族', '布朗族', '撒拉族', '毛南族', '仡佬族', '锡伯族', '阿昌族', '普米族',
  '塔吉克族', '怒族', '乌孜别克族', '俄罗斯族', '鄂温克族', '德昂族', '保安族', '裕固族', '京族', '塔塔尔族',
  '独龙族', '鄂伦春族', '赫哲族', '门巴族', '珞巴族', '基诺族',
];

export const ETHNICITY: Dict = Object.fromEntries(
  ETHNIC_GROUPS.map((n) => [n, [n, n.replace(/族$/, '')]]),
);

/** 歧义词：出现时如果能对应多个规范键，就只能作为中置信候选。 */
export const AMBIGUOUS: Record<string, Record<string, string[]>> = {
  educationLevel: { 研究生: ['master', 'doctor'], 学士: ['bachelor'] },
};

export const DICTS = {
  educationLevel: EDUCATION_LEVEL,
  degree: DEGREE,
  politicalStatus: POLITICAL_STATUS,
  gender: GENDER,
  idType: ID_TYPE,
  skillLevel: SKILL_LEVEL,
  marital: MARITAL,
  triState: TRI_STATE,
  admission: ADMISSION,
  studyMode: STUDY_MODE,
  workKind: WORK_KIND,
  languageCert: LANGUAGE_CERT,
  nationality: NATIONALITY,
  ethnicity: ETHNICITY,
  honorLevel: HONOR_LEVEL,
  honorGrade: HONOR_GRADE,
} as const;

export type DictName = keyof typeof DICTS;

/** 规范键 → 别名列表。值不在词表中时，原值本身作为唯一别名（自由文本枚举，如单位性质）。 */
export function aliasesFor(dict: DictName | undefined, key: string): string[] {
  if (!dict) return [key];
  const d = DICTS[dict] as Dict;
  return d[key] ?? [key];
}

/** 规范键的首选显示文字。 */
export function displayFor(dict: DictName | undefined, key: string): string {
  return aliasesFor(dict, key)[0];
}

/** 月薪数值的常见选项写法：8000 → ['8000','8千','8k','8K']；12000 → ['12000','1.2万','12k','12K','12千']。 */
export function moneyAliases(n: number): string[] {
  if (!Number.isFinite(n) || n <= 0) return [];
  const trim = (x: number) => String(Math.round(x * 100) / 100);
  const out = [String(n)];
  if (n >= 10000) out.push(`${trim(n / 10000)}万`);
  if (n >= 1000) out.push(`${trim(n / 1000)}千`, `${trim(n / 1000)}k`, `${trim(n / 1000)}K`);
  return [...new Set(out)];
}

/** 学制等数值：4 → ['4年','4']；0.5 → ['0.5年','半年']。 */
export function yearsAliases(n: number): string[] {
  const s = Number.isInteger(n) ? String(n) : String(n);
  const out = [`${s}年`, s];
  if (n === 0.5) out.push('半年');
  return out;
}
