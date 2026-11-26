// 简历文字 → 档案草稿（纯函数，本地规则，不联网、不使用大模型）。
// 只做“看得见的”抽取：标签后的值、日期区间所在行、常见证书名。结果交给档案页预览，由本人勾选后才写入档案。
import { ETHNIC_GROUPS } from '../normalize/dicts';
import { formatDate, parseDate } from '../normalize/date';
import { toHalfWidth } from '../normalize/text';
import type { EducationLevel, PoliticalStatus } from '../profile/types';

export type ParsedCollection =
  | 'education'
  | 'work'
  | 'projects'
  | 'studentLeadership'
  | 'socialPractice'
  | 'languages'
  | 'computerSkills'
  | 'certificates'
  | 'skills'
  | 'honors'
  | 'textTemplates'
  | 'family';

export interface ParsedField {
  /** 档案中的点分路径，如 basic.name、contact.email、basic.nativePlace */
  path: string;
  label: string;
  value: unknown;
  display: string;
  /** 高敏感：预览中默认不勾选 */
  sensitive?: boolean;
  /** 原文片段（用于预览中对照） */
  source: string;
}

export interface ParsedRecord {
  collection: ParsedCollection;
  record: Record<string, unknown>;
  display: string;
  source: string;
  /** 需要本人补充或确认的地方（如“学历未识别”） */
  notes: string[];
}

export interface ParseResult {
  fields: ParsedField[];
  records: ParsedRecord[];
  /** 识别到的区块标题（原文） */
  sections: string[];
  /** 没有归入任何字段的行（预览中折叠显示） */
  unparsed: string[];
  /** 大模型识别时没有填入的项和原因（格式不对、找不到原文依据），预览里列出 */
  dropped?: string[];
}

// ---------------- 文字规整 ----------------

const BULLET = /^[\s•●○◆◇■□▪▫·・\-*>›»✓√★☆◎①②③④⑤⑥⑦⑧⑨⑩]+|^[(（]?\d{1,2}[.．、)）]\s*(?=\D)/;

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

/** 英文简历的日期写法统一成“2019.09”：Sep 2019、Sept. 2019、09/2019。 */
function normDates(s: string): string {
  return s
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*,?\s*((?:19|20)\d{2})\b/gi, (_m, mon: string, y: string) => `${y}.${MONTHS[mon.slice(0, 3).toLowerCase()]}`)
    .replace(/(?<![\d.])(0?[1-9]|1[0-2])\s*\/\s*((?:19|20)\d{2})\b/g, (_m, mon: string, y: string) => `${y}.${mon.padStart(2, '0')}`);
}

/** 不改全角标点的规整：长文本（自我评价、工作描述）从这里取，保留原文的中文标点。 */
function keepWidth(line: string): string {
  return line
    .replace(/[​﻿]/g, '')
    // 制表符多用来对齐分栏（“2019.09-2023.06<Tab>湖南大学”），按两个空格算
    .replace(/\t+/g, '  ')
    .replace(/ /g, ' ')
    .replace(/ {2,}/g, '  ')
    .trim();
}

/** 用于匹配的规整：全角转半角、英文日期转数字。 */
function clean(line: string): string {
  return normDates(keepWidth(toHalfWidth(line)));
}

/** 规整后的行 → 原文的行（只去掉多余空白），解析一次时有效。 */
let ORIGIN = new Map<string, string>();
const orig = (line: string): string => ORIGIN.get(line) ?? line;
/** 长文本用原文（保留中文标点），去掉项目符号。 */
const origBody = (line: string): string => stripBullet(orig(line));

const nz = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toLowerCase();

function stripBullet(line: string): string {
  return line.replace(BULLET, '').trim();
}

/** 按分隔符切分一行（竖线、两个以上空格、中文分隔符）。 */
function tokens(line: string): string[] {
  return line
    .split(/\s*[|｜丨]\s*|\s{2,}|\s*\/\s+|\s+\/\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// ---------------- 区块标题 ----------------

const SECTION_WORDS: Array<{ key: SectionKey; re: RegExp }> = [
  { key: 'basic', re: /^(基本信息|个人信息|基本资料|个人资料|个人概况|个人基本信息|个人简介信息|Personal\s*(Info|Information|Details|Profile)|Basic\s*Information|Contact(\s*Information)?)$/i },
  { key: 'intention', re: /^(求职意向|求职目标|应聘岗位|意向岗位|应聘职位|求职岗位|Job\s*(Objective|Intention)|Career\s*Objective|Objective)$/i },
  { key: 'education', re: /^(教育背景|教育经历|学习经历|教育情况|学历背景|学历信息|教育信息|学业背景|Education(al)?(\s*(Background|Experience))?)$/i },
  { key: 'work', re: /^(工作经历|实习经历|工作\/实习经历|实习\/工作经历|实习经验|工作经验|工作与实习经历|实习与工作经历|工作及实习经历|实习及工作经历|实习实践经历|实习实践|实践经历|职业经历|工作履历|实习履历|任职经历|Work\s*(Experience|History)|Internships?(\s*Experience)?|Experience|(Professional|Employment|Working)\s*(Experience|History))$/i },
  { key: 'projects', re: /^(项目经历|项目经验|科研经历|科研项目|研究经历|项目与科研|科研与项目经历|项目与科研经历|科研项目经历|项目实践|课题研究|学术科研|Projects?(\s*Experiences?)?|Research(\s*(Experience|Projects?))?|Academic\s*Projects?)$/i },
  { key: 'leadership', re: /^(校园经历|学生工作|学生干部经历|在校经历|社团经历|校内经历|社团活动|学生工作经历|校园活动|社会工作|组织经历|学生会经历|Leadership(\s*Experience)?|Campus\s*(Activities|Experience|Involvement)|(Extracurricular\s*)?Activities)$/i },
  { key: 'practice', re: /^(社会实践|志愿服务|志愿者经历|志愿经历|社会实践经历|实践活动|实践经验|志愿活动|Volunteer(ing)?(\s*Experience)?|Social\s*Practice)$/i },
  { key: 'honors', re: /^(获奖情况|荣誉奖励|所获荣誉|奖励荣誉|获奖经历|荣誉证书|奖项|荣誉|获奖|奖励情况|荣誉奖项|获奖荣誉|在校荣誉|荣誉称号|竞赛获奖|奖惩情况|奖学金|所获奖励|获奖与荣誉|荣誉与奖励|Honou?rs?(\s*(&|and)\s*Awards?)?|Awards?(\s*(&|and)\s*Honou?rs?)?|Scholarships?)$/i },
  { key: 'skills', re: /^(证书|技能证书|资格证书|证书资质|专业技能|技能|技能特长|个人技能|技能与证书|证书与技能|技能\/证书|证书\/技能|技能及证书|证书及技能|语言能力|外语能力|计算机能力|IT技能|职业技能|资质证书|职业资格|技能与语言|语言与技能|技能证书与语言能力|专业技能与证书|Skills?(\s*(&|and)\s*(Certificates?|Certifications?|Languages?))?|(Language|Computer|Technical|Professional)\s*Skills|Certificates?|Certifications?|Languages?)$/i },
  { key: 'family', re: /^(家庭成员|家庭情况|主要家庭成员|家庭成员及主要社会关系|家庭关系|家庭主要成员|Family(\s*Members?)?)$/i },
  { key: 'self', re: /^(自我评价|个人评价|自我介绍|个人总结|个人优势|自我描述|个人简介|个人陈述|自我总结|个人特点|Self[-\s]*(Evaluation|Assessment|Introduction)|Summary|About\s*Me|Personal\s*(Statement|Summary))$/i },
  // 档案里没有对应栏目的：单独成块，免得内容混进上一个区块（比如兴趣爱好被当成技能）
  { key: 'hobby', re: /^(兴趣爱好|爱好特长|个人爱好|兴趣特长|特长爱好|爱好|Hobbies(\s*(&|and)\s*Interests)?|Interests)$/i },
  { key: 'papers', re: /^(论文发表|发表论文|学术成果|科研成果|学术论文|论文及专利|论文与专利|Publications?)$/i },
  { key: 'other', re: /^(其他信息|附加信息|其他|其它|补充信息|其他说明|Additional\s*Information|Others?)$/i },
];

type SectionKey = 'header' | 'basic' | 'intention' | 'education' | 'work' | 'projects' | 'leadership' | 'practice' | 'honors' | 'skills' | 'family' | 'self' | 'hobby' | 'papers' | 'other';

const CJK = '一-龥';
const HEADING_TRIM = /^[\s【\[(（<《■□▌▍▎|｜◆◇●○•·#\-—=_~*>›»✦★☆▶►]+|[\s】\])）>》:：\-—=_~*<‹«]+$/g;

/**
 * 区块标题 → 区块和显示用的标题。模板里常见的写法都认：
 * “教育背景 EDUCATION”“EDUCATION 教育背景”“■ 教育背景 / Education”“教 育 背 景”“01 实习经历”“二、项目经历”。
 */
function headingInfo(line: string): { key: SectionKey; title: string } | undefined {
  if (line.length > 48) return undefined;
  let t = line
    .replace(HEADING_TRIM, '')
    .replace(/^[一二三四五六七八九十]+\s*[、.．]\s*/, '')
    .replace(/^(?:\d{1,2}|Part\s*\d)\s*[、.．]?\s+(?=\D)/i, '')
    .replace(/^\d{1,2}[、.．]\s*/, '')
    .replace(HEADING_TRIM, '')
    // “技能 | 证书”“技能｜证书”→“技能/证书”
    .replace(new RegExp(`(?<=[${CJK}])\\s*[|｜]\\s*(?=[${CJK}])`, 'g'), '/')
    // 字间空格：“教 育 背 景”
    .replace(new RegExp(`(?<=[${CJK}])\\s+(?=[${CJK}])`, 'g'), '')
    .trim();
  if (!t) return undefined;
  const test = (s: string) => SECTION_WORDS.find((w) => w.re.test(s.trim()))?.key;
  const whole = test(t);
  if (whole) return { key: whole, title: t };
  if (new RegExp(`[${CJK}]`).test(t)) {
    // 中文标题加英文副标题：只看中文部分；英文部分只能是标题常用词（“技能 Python Java”不是标题）
    const zh = t.replace(/[\sA-Za-z&/|｜·.\-—:：()（）[\]【】]+/g, ' ').trim();
    const en = t.replace(new RegExp(`[${CJK}/|｜·:：()（）\\[\\]【】\\-—]+`, 'g'), ' ').replace(/\s+/g, ' ').trim();
    if (/\s/.test(zh) || zh.length > 12) return undefined;
    if (en && !en.split(/[\s&]+/).filter(Boolean).every((w) => HEADING_EN.has(w.toLowerCase()))) return undefined;
    const key = test(zh);
    return key ? { key, title: zh } : undefined;
  }
  t = t.replace(/\s+/g, ' ');
  if (t.length > 40 || !/^[A-Za-z&/\s.\-]+$/.test(t)) return undefined;
  const key = test(t.replace(/\s*\/\s*/g, ' & '));
  return key ? { key, title: t } : undefined;
}

/** 英文副标题里允许出现的词（模板的“EDUCATION”“Work Experience”“About Me”）。 */
const HEADING_EN = new Set(
  ('education educational background experience experiences work working internship internships intern professional employment history '
    + 'project projects research academic skills skill certificates certificate certifications certification languages language computer technical '
    + 'honors honours honor honour awards award scholarship scholarships and self evaluation assessment introduction summary about me personal '
    + 'information info profile details basic contact objective job career intention campus activities activity extracurricular leadership involvement '
    + 'volunteer volunteering social practice family members member hobbies hobby interests publications publication papers additional other others statement').split(' '),
);

function headingKey(line: string): SectionKey | undefined {
  return headingInfo(line)?.key;
}

/** 这一行是不是简历的区块标题（PDF 版面判断用）。 */
export function isSectionHeading(line: string): boolean {
  return !!headingInfo(clean(line));
}

/** 窄单元格把日期区间折成两行：“2022.07-  普华永道…” + “2022.09” → “2022.07-2022.09  普华永道…”。 */
function joinWrappedRanges(lines: string[]): string[] {
  const out = [...lines];
  for (let i = 0; i + 1 < out.length; i++) {
    const m = /^((?:19|20)\d{2}\s*[.\-/年]\s*\d{1,2}\s*月?)\s*[-–—~～至到]\s*(?=\s|$)/.exec(out[i]);
    if (!m || findRange(out[i])) continue;
    const nx = /^((?:19|20)\d{2}\s*[.\-/年]\s*\d{1,2}\s*月?|至今|今|现在|present|now)(?=\s|$)/i.exec(out[i + 1]);
    if (!nx) continue;
    out[i] = `${m[1]}-${nx[1]}${out[i].slice(m[0].length)}`;
    const rest = out[i + 1].slice(nx[0].length).trim();
    if (rest) out[i + 1] = rest;
    else out.splice(i + 1, 1);
  }
  return out;
}

/**
 * 标题和内容在同一行（左侧标题栏的模板、PDF 同一行合并）：“教育背景  2019.09-2023.06 中山大学…”。
 * 只在标题词后面隔着两个以上空格，或紧跟日期时拆开；“项目经验丰富，…”这样的句子不拆。
 */
function splitHeadingLine(line: string): { heading: string; rest: string } | undefined {
  const m = /^((?:[■◆◇●○•▌▍▎|｜#*>›»★☆▶►\-—]+\s*)?[^\s|｜]{2,16}?(?:\s+[A-Za-z][A-Za-z&]*(?:\s[A-Za-z][A-Za-z&]*){0,2})?)(?:\s{2,}|\s*[|｜]\s*|\s+(?=(?:19|20)\d{2}))(\S.*)$/.exec(line);
  if (!m || !headingInfo(m[1])) return undefined;
  return { heading: m[1], rest: m[2] };
}

// ---------------- 日期 ----------------

// 年、月、日：“2023.08.07”“2023-8-7”“2023年8月7日”都认；日只在紧跟分隔符或带“日”时才算（“2019.09-2023.06”里的“-20”不是日）
const DAY = String.raw`(?:[.\-/](\d{1,2})(?!\d)\s*日?|\s*(\d{1,2})\s*日)?`;
const YM = String.raw`(\d{4})\s*(?:[.\-/年]\s*(\d{1,2})\s*月?${DAY})?`;
const PRESENT = String.raw`(至今|今|现在|目前|present|now|current)`;
const RANGE_RE = new RegExp(String.raw`${YM}\s*(?:[-–—~～至到]+|\bto\b)\s*(?:${YM}|${PRESENT})`, 'i');

interface Range {
  start: string;
  end?: string;
  text: string;
  index: number;
}

function ymString(y: string, m?: string, day?: string): string | undefined {
  const d = parseDate(m ? (day ? `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}` : `${y}-${m}`) : y);
  return d && d !== 'present' ? formatDate(d) : undefined;
}

function findRange(line: string): Range | undefined {
  const m = RANGE_RE.exec(line);
  if (!m) return undefined;
  // 分组：开始 年1 月2 日3/4，结束 年5 月6 日7/8，至今9
  const start = ymString(m[1], m[2], m[3] ?? m[4]);
  if (!start) return undefined;
  const end = m[9] ? 'present' : m[5] ? ymString(m[5], m[6], m[7] ?? m[8]) : undefined;
  return { start, end, text: m[0], index: m.index };
}

/** 单个日期（获奖时间、证书时间）。 */
function findSingleDate(line: string): { date: string; text: string } | undefined {
  const m = /(\d{4})\s*[.\-/年]\s*(\d{1,2})\s*月?(?:[.\-/](\d{1,2})(?!\d)\s*日?|\s*(\d{1,2})\s*日)?|(?<![\d.])(\d{4})\s*年/.exec(line);
  if (!m) return undefined;
  const date = m[1] ? ymString(m[1], m[2], m[3] ?? m[4]) : ymString(m[5]);
  return date ? { date, text: m[0] } : undefined;
}

// ---------------- 词表 ----------------

const SCHOOL_RE = /([A-Za-z一-龥()·]{2,30}?(?:大学|学院|学校|研究生院|研究院|研究所|University|College|Institute(?: of [A-Za-z ]+)?|School(?: of [A-Za-z ]+)?))(?![A-Za-z一-龥])/;
const COMPANY_RE = /(公司|集团|银行|事务所|研究院|研究所|中心|有限|分行|支行|证券|基金|保险|信托|期货|医院|学校|大学|学院|局|厅|委员会|政府|办公室|工作室|Inc\.?|Ltd\.?|LLC|Co\.?|Corp\.?|Group|Bank|Company)/i;
const TITLE_RE = /(实习生|实习|助理|经理|工程师|专员|分析师|顾问|主管|总监|会计|审计|研究员|开发|设计师|运营|产品|销售|代表|岗|员|师|生|Intern|Assistant|Analyst|Engineer|Manager|Associate|Consultant|Developer|Designer)/i;
const ROLE_RE = /(负责人|组长|队长|主持人|核心成员|成员|参与者|参与人|主要完成人|技术负责人|项目经理|Leader|Member|Owner|PI)/i;
const LEAD_ROLE_RE = /(主席|副主席|部长|副部长|干事|会长|副会长|社长|副社长|班长|团支书|支部书记|学习委员|组织委员|宣传委员|委员|队长|队员|负责人|成员|志愿者|助教|助理)/;

const LEVEL_WORDS: Array<[RegExp, EducationLevel]> = [
  [/博士|Ph\.?D|Doctor/i, 'doctor'],
  [/硕士|研究生|Master|M\.?S\.?c?\b|MBA|MPAcc|M\.?A\.?\b/i, 'master'],
  [/本科|学士|Bachelor|B\.?S\.?c?\b|B\.?A\.?\b|B\.?E\.?\b/i, 'bachelor'],
  [/专科|大专|高职/, 'junior-college'],
  [/高中/, 'high-school'],
  [/中专|中技|职高/, 'secondary-vocational'],
];
const DEGREE_FOR: Partial<Record<EducationLevel, string>> = { doctor: 'doctor', master: 'master', bachelor: 'bachelor' };
const LEVEL_ZH: Record<EducationLevel, string> = {
  doctor: '博士',
  master: '硕士',
  bachelor: '本科',
  'junior-college': '专科',
  'high-school': '高中',
  'secondary-vocational': '中专/中技',
  'junior-high-or-below': '初中及以下',
};

const POLITICAL_WORDS: Array<[RegExp, PoliticalStatus]> = [
  [/中共预备党员|预备党员/, 'cpc-probationary'],
  [/中共党员|共产党员|党员/, 'cpc-member'],
  [/共青团员|团员/, 'cyl-member'],
  [/民主党派/, 'democratic-party'],
  [/无党派/, 'non-party'],
  [/群众/, 'masses'],
];

const LANG_CERTS: Array<{ re: RegExp; language: string; certificate: string }> = [
  { re: /CET\s*-?\s*6|大学英语六级|英语六级|六级/i, language: '英语', certificate: 'CET6' },
  { re: /CET\s*-?\s*4|大学英语四级|英语四级|四级/i, language: '英语', certificate: 'CET4' },
  { re: /TEM\s*-?\s*8|专业八级|专八/i, language: '英语', certificate: 'TEM8' },
  { re: /TEM\s*-?\s*4|专业四级|专四/i, language: '英语', certificate: 'TEM4' },
  { re: /IELTS|雅思/i, language: '英语', certificate: 'IELTS' },
  { re: /TOEFL|托福/i, language: '英语', certificate: 'TOEFL' },
  { re: /GRE\b/i, language: '英语', certificate: 'GRE' },
  { re: /GMAT\b/i, language: '英语', certificate: 'GMAT' },
  { re: /CATTI/i, language: '英语', certificate: 'CATTI' },
  { re: /JLPT\s*N?([1-5])|日语\s*N([1-5])|日语能力(?:考试)?\s*N?([1-5])级?/i, language: '日语', certificate: 'JLPT' },
];

const COMPUTER_RE = /(计算机[一二三四]级|全国计算机等级考试|NCRE|计算机等级|软考|软件设计师|网络工程师|MOS|Microsoft Office Specialist)/i;
const CERT_RE = /(证书|资格|CDA|职称|执业|从业|CPA|ACCA|CFA|FRM|CMA|CIMA|CIA|CTA|PMP|注册会计师|证券|基金|期货|银行从业|教师资格|普通话|驾驶证|法律职业|税务师|会计师)/i;

// 先找明确写出的级别（“省级一等奖”），再按名称推断（“全国大学生…”）
const HONOR_LEVEL_EXPLICIT: Array<[RegExp, string]> = [
  [/国际级/, 'international'],
  [/国家级/, 'national'],
  [/省部级|省级|省[一二三特]等奖|省赛|赛区/, 'provincial'],
  [/市级|地市级|市[一二三特]等奖/, 'city'],
  [/校级|校[一二三特]等奖|校赛/, 'school'],
  [/院级|院系级|院[一二三特]等奖/, 'department'],
];
const HONOR_LEVEL_IMPLIED: Array<[RegExp, string]> = [
  [/国际/, 'international'],
  [/全国|国家/, 'national'],
  [/省/, 'provincial'],
  [/学校|校/, 'school'],
  [/学院/, 'department'],
];
const HONOR_GRADE_WORDS: Array<[RegExp, string]> = [
  [/特等奖/, 'special'],
  [/一等奖|金奖|First Prize/i, 'first'],
  [/二等奖|银奖|Second Prize/i, 'second'],
  [/三等奖|铜奖|Third Prize/i, 'third'],
];

// ---------------- 基本信息 ----------------

const KV_KEYS: Array<{ re: RegExp; path: string; label: string; kind: 'text' | 'date' | 'gender' | 'political' | 'ethnicity' | 'region' | 'number' | 'marital' | 'list' | 'regionList' | 'salary' | 'tri' | 'postal' | 'emergency' | 'custom' | 'edu'; sensitive?: boolean }> = [
  { re: /^(姓名|名字|Name)$/i, path: 'basic.name', label: '姓名', kind: 'text' },
  // 表格式简历把学校、专业、学历写在基本信息表里：收集起来生成一条教育经历
  { re: /^(毕业院校|毕业学校|就读院校|就读学校|所在院校|所在学校|学校名称|院校名称|学校|院校)$/, path: 'edu.school', label: '毕业院校', kind: 'edu' },
  { re: /^(所学专业|就读专业|专业名称|专业)$/, path: 'edu.major', label: '专业', kind: 'edu' },
  { re: /^(最高学历|学历层次|学历)$/, path: 'edu.level', label: '学历', kind: 'edu' },
  { re: /^(最高学位|学位)$/, path: 'edu.degree', label: '学位', kind: 'edu' },
  { re: /^(毕业时间|毕业日期|毕业年月|毕业年份|预计毕业时间|预计毕业)$/, path: 'edu.end', label: '毕业时间', kind: 'edu' },
  { re: /^(入学时间|入学日期|入学年月|入学年份)$/, path: 'edu.start', label: '入学时间', kind: 'edu' },
  { re: /^(所在院系|所在学院|院系|学院)$/, path: 'edu.college', label: '学院', kind: 'edu' },
  { re: /^(性别|Gender|Sex)$/i, path: 'basic.gender', label: '性别', kind: 'gender' },
  { re: /^(出生年月|出生日期|生日|出生年月日|Birthday|Date of Birth|DOB)$/i, path: 'basic.birthDate', label: '出生日期', kind: 'date' },
  { re: /^(民族)$/, path: 'basic.ethnicity', label: '民族', kind: 'ethnicity' },
  { re: /^(政治面貌)$/, path: 'basic.politicalStatus', label: '政治面貌', kind: 'political', sensitive: true },
  { re: /^(籍贯)$/, path: 'basic.nativePlace', label: '籍贯', kind: 'region' },
  { re: /^(生源地)$/, path: 'basic.studentOrigin', label: '生源地', kind: 'region' },
  { re: /^(户口所在地|户籍所在地|户籍|户口)$/, path: 'basic.hukou', label: '户口所在地', kind: 'region', sensitive: true },
  { re: /^(现居住地|现居地|现住址|所在城市|现居|居住地|目前所在地|所在地|现居城市)$/, path: 'basic.currentResidence', label: '现居住地', kind: 'region' },
  { re: /^(国籍|Nationality)$/i, path: 'basic.nationality', label: '国籍', kind: 'text' },
  { re: /^(身高)$/, path: 'basic.heightCm', label: '身高', kind: 'number' },
  { re: /^(婚姻状况|婚否)$/, path: 'basic.maritalStatus', label: '婚姻状况', kind: 'marital', sensitive: true },
  { re: /^(健康状况)$/, path: 'basic.healthStatus', label: '健康状况', kind: 'text', sensitive: true },
  { re: /^(英文名|英文姓名|English Name)$/i, path: 'basic.nameEn', label: '英文名', kind: 'text' },
  { re: /^(手机|手机号|手机号码|电话|联系电话|移动电话|Tel|Phone|Mobile)$/i, path: 'contact.mobile', label: '手机号', kind: 'text', sensitive: true },
  { re: /^(邮箱|电子邮箱|E-?mail|Email)$/i, path: 'contact.email', label: '邮箱', kind: 'text' },
  { re: /^(通讯地址|联系地址|家庭住址|地址|Address)$/i, path: 'contact.address', label: '通讯地址', kind: 'text', sensitive: true },
  { re: /^(求职意向|意向岗位|应聘岗位|期望职位|目标岗位|意向职位)$/, path: 'intention.jobTypes', label: '期望职位类别', kind: 'list' },
  { re: /^(期望城市|意向城市|期望工作城市|意向工作地点|期望地点)$/, path: 'intention.cities', label: '期望城市', kind: 'regionList' },
  { re: /^(到岗时间|最早到岗时间|最早到岗|到岗日期|可到岗时间|可实习时间)$/, path: 'intention.earliestStartDate', label: '最早到岗时间', kind: 'date' },
  { re: /^(期望月薪|期望薪资|期望薪酬|期望工资|薪资要求|期望月收入)$/, path: 'intention.salary', label: '期望月薪', kind: 'salary' },
  { re: /^(接受岗位调剂|服从岗位调剂|是否接受岗位调剂|岗位调剂|接受调剂|服从调剂)$/, path: 'intention.acceptJobAdjustment', label: '接受岗位调剂', kind: 'tri' },
  { re: /^(入党时间|入党日期)$/, path: 'basic.partyJoinDate', label: '入党时间', kind: 'date', sensitive: true },
  { re: /^(邮编|邮政编码)$/, path: 'contact.postalCode', label: '邮编', kind: 'postal' },
  { re: /^(紧急联系人)$/, path: 'contact.emergencyContact', label: '紧急联系人', kind: 'emergency', sensitive: true },
  // 档案没有固定字段的：存到“自定义字段”（智联“体重”按标签“体重(kg)”找回）
  { re: /^(体重)$/, path: 'custom:体重(kg)', label: '体重(kg)', kind: 'custom' },
  { re: /^(微信|微信号|WeChat)$/i, path: 'custom:微信号', label: '微信号', kind: 'custom' },
];
const KEY_ALT = KV_KEYS.map((k) => k.re.source.replace(/^\^\(|\)\$$/g, '')).join('|');
const KV_RE = new RegExp(String.raw`(${KEY_ALT})\s*[:：]\s*`, 'gi');
const specOf = (key: string) => KV_KEYS.find((k) => k.re.test(key.trim()));
const isKeyToken = (t: string): boolean => !!specOf(t.replace(/[:：]$/, ''));

/** 表格里为了对齐把标签字拉开：“姓  名”“籍 贯” → “姓名”“籍贯”。只合并词表里的标签。 */
const SPACED_KEYS: Array<[RegExp, string]> = [...new Set(KEY_ALT.split('|').filter((k) => /^[一-龥]{2,4}$/.test(k)))].map((k) => [new RegExp(`(?<![一-龥])${[...k].join('\\s+')}(?![一-龥])`, 'g'), k]);
function unspaceKeys(line: string): string {
  if (!/[一-龥]\s+[一-龥]/.test(line)) return line;
  let s = line;
  for (const [re, k] of SPACED_KEYS) s = s.replace(re, k);
  return s;
}

const PROVINCES = [
  '北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '海南',
  '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门',
];
const MUNICIPALITIES = new Set(['北京', '天津', '上海', '重庆']);

/** 不带省份就常被直接写出的城市（省会、计划单列市和招聘常见城市）。 */
const CITY_PROVINCE: Record<string, string> = Object.fromEntries(
  (
    [
      ['河北省', '石家庄 唐山 保定 廊坊'], ['山西省', '太原'], ['辽宁省', '沈阳 大连'], ['吉林省', '长春'], ['黑龙江省', '哈尔滨'],
      ['江苏省', '南京 苏州 无锡 常州 南通 徐州'], ['浙江省', '杭州 宁波 温州 绍兴 嘉兴 金华'], ['安徽省', '合肥 芜湖'], ['福建省', '福州 厦门 泉州'], ['江西省', '南昌'],
      ['山东省', '济南 青岛 烟台 潍坊'], ['河南省', '郑州 洛阳'], ['湖北省', '武汉 宜昌 襄阳'], ['湖南省', '长沙 株洲 湘潭 岳阳'], ['广东省', '广州 深圳 东莞 佛山 珠海 惠州 中山'],
      ['海南省', '海口 三亚'], ['四川省', '成都 绵阳'], ['贵州省', '贵阳'], ['云南省', '昆明'], ['陕西省', '西安'], ['甘肃省', '兰州'], ['青海省', '西宁'],
      ['内蒙古自治区', '呼和浩特 包头'], ['广西壮族自治区', '南宁 桂林'], ['西藏自治区', '拉萨'], ['宁夏回族自治区', '银川'], ['新疆维吾尔自治区', '乌鲁木齐'],
    ] as Array<[string, string]>
  ).flatMap(([p, cities]) => cities.split(' ').map((c) => [c, p])),
);

export function parseRegion(raw: string): { province: string; city?: string; district?: string } | undefined {
  const s = raw.replace(/[\s,，/·-]+/g, '').replace(/^中国/, '');
  if (!s) return undefined;
  const p = PROVINCES.find((x) => s.startsWith(x));
  if (!p) {
    // 只写了城市名（“深圳”“杭州市”）：常见城市补上省份
    const name = s.replace(/市$/, '');
    const prov = CITY_PROVINCE[name];
    return prov ? { province: prov, city: `${name}市` } : undefined;
  }
  let rest = s.slice(p.length).replace(/^(省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)/, '');
  const province = MUNICIPALITIES.has(p) ? `${p}市` : /内蒙古|西藏/.test(p) ? `${p}自治区` : p === '广西' ? '广西壮族自治区' : p === '宁夏' ? '宁夏回族自治区' : p === '新疆' ? '新疆维吾尔自治区' : /香港|澳门/.test(p) ? `${p}特别行政区` : p === '台湾' ? '台湾省' : `${p}省`;
  const out: { province: string; city?: string; district?: string } = { province };
  if (MUNICIPALITIES.has(p)) {
    out.city = province;
    const d = /^(.{1,6}?(区|县))/.exec(rest);
    if (d) out.district = d[1];
    return out;
  }
  const c = /^(.{1,8}?(市|自治州|地区|盟))/.exec(rest) ?? (/^([一-龥]{2,3})$/.exec(rest) ? [rest, rest] : null);
  if (c) {
    // “杭州”“广州”是市名，要补“市”；只有“××自治州 / 地区 / 盟”保持原样
    out.city = /(市|自治州|地区|盟)$/.test(c[1]) ? c[1] : `${c[1]}市`;
    rest = rest.slice(c[1].length);
    const d = /^(.{1,8}?(区|县|市|旗))/.exec(rest);
    if (d) out.district = d[1];
  }
  return out;
}

function regionDisplay(r: { province: string; city?: string; district?: string }): string {
  return [r.province, r.city, r.district].filter(Boolean).join(' / ');
}

function genderOf(v: string): 'male' | 'female' | undefined {
  if (/^(男|male|m)$/i.test(v.trim())) return 'male';
  if (/^(女|female|f)$/i.test(v.trim())) return 'female';
  return undefined;
}

function politicalOf(v: string): PoliticalStatus | undefined {
  return POLITICAL_WORDS.find(([re]) => re.test(v))?.[1];
}

const POLITICAL_ZH: Record<PoliticalStatus, string> = {
  'cpc-member': '中共党员',
  'cpc-probationary': '中共预备党员',
  'cyl-member': '共青团员',
  'democratic-party': '民主党派',
  'non-party': '无党派人士',
  masses: '群众',
  other: '其他',
};

function ethnicityOf(v: string): string | undefined {
  const s = v.trim();
  return ETHNIC_GROUPS.find((e) => s === e || s === e.replace(/族$/, '') || s.startsWith(e));
}

class Collector {
  fields = new Map<string, ParsedField>();
  /** 基本信息表里的学校、专业等（edu.school → 值），最后合成一条教育经历 */
  edu = new Map<string, { value: string; source: string }>();
  add(f: ParsedField) {
    if (!this.fields.has(f.path)) this.fields.set(f.path, f);
  }
}

function addKv(c: Collector, key: string, rawValue: string, source: string): boolean {
  const spec = specOf(key);
  if (!spec) return false;
  const v = rawValue.replace(/[;；,，]+$/, '').trim();
  if (!v) return false;
  const base = { path: spec.path, label: spec.label, sensitive: spec.sensitive, source };
  switch (spec.kind) {
    case 'edu': {
      // 值里不能再像一个标签（“学校 专业”这种表头行）
      if (isKeyToken(v) || v.length > 40) return false;
      if (!c.edu.has(spec.path)) c.edu.set(spec.path, { value: v, source });
      return true;
    }
    case 'text': {
      if (spec.path === 'contact.mobile') {
        const m = /1[3-9]\d{9}/.exec(v.replace(/[\s-]/g, ''));
        if (!m) return false;
        c.add({ ...base, value: m[0], display: m[0] });
        return true;
      }
      if (spec.path === 'contact.email') {
        const m = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(v);
        if (!m) return false;
        c.add({ ...base, value: m[0], display: m[0] });
        return true;
      }
      if (spec.path === 'basic.name') {
        // 表格里为了对齐写成“王 五”
        const name = v.replace(/(?<=[一-龥])\s+(?=[一-龥])/g, '');
        if (name.length > 20) return false;
        c.add({ ...base, value: name, display: name });
        return true;
      }
      c.add({ ...base, value: v, display: v });
      return true;
    }
    case 'date': {
      const pd = parseDate(v.replace(/(出生|生)$/, '').trim());
      const d = pd && pd !== 'present' ? { date: formatDate(pd), text: v } : findSingleDate(v);
      if (!d) return false;
      c.add({ ...base, value: d.date, display: d.date });
      return true;
    }
    case 'gender': {
      const g = genderOf(v);
      if (!g) return false;
      c.add({ ...base, value: g, display: g === 'male' ? '男' : '女' });
      return true;
    }
    case 'political': {
      const p = politicalOf(v);
      if (!p) return false;
      c.add({ ...base, value: p, display: POLITICAL_ZH[p] });
      // “中共党员（2022.06.28 入党）”
      const jd = /入党/.test(v) ? findSingleDate(v) : undefined;
      if (jd && !c.fields.has('basic.partyJoinDate')) c.add({ path: 'basic.partyJoinDate', label: '入党时间', sensitive: true, source, value: jd.date, display: jd.date });
      return true;
    }
    case 'ethnicity': {
      const e = ethnicityOf(v);
      if (!e) return false;
      c.add({ ...base, value: e, display: e });
      return true;
    }
    case 'region': {
      const r = parseRegion(v.replace(/[(（][^)）]*户[^)）]*[)）]/g, ''));
      if (!r) return false;
      c.add({ ...base, value: r, display: regionDisplay(r) });
      // “湖北省宜昌市西陵区（城镇户口）”
      if (spec.path === 'basic.hukou') {
        const t = /城镇|非农/.test(v) ? 'urban' : /农村|农业/.test(v) ? 'rural' : /集体/.test(v) ? 'collective' : undefined;
        if (t) c.add({ path: 'basic.hukouType', label: '户口类型', sensitive: true, source, value: t, display: t === 'urban' ? '城镇' : t === 'rural' ? '农村' : '集体' });
      }
      return true;
    }
    case 'salary': {
      // 15000-25000 元 / 15k-25k / 1.5万-2.5万 / 8000 元以上
      const nums = Array.from(v.matchAll(/(\d+(?:\.\d+)?)\s*([kK千wW万])?/g)).map((x) => Math.round(Number(x[1]) * (/[kK千]/.test(x[2] ?? '') ? 1000 : /[wW万]/.test(x[2] ?? '') ? 10000 : 1)));
      const ok = nums.filter((n) => n >= 500 && n <= 500000);
      if (ok.length === 0) return false;
      c.add({ path: 'intention.salaryMin', label: '期望最低月薪', source, value: ok[0], display: `${ok[0]} 元` });
      if (ok.length > 1) c.add({ path: 'intention.salaryMax', label: '期望最高月薪', source, value: ok[1], display: `${ok[1]} 元` });
      return true;
    }
    case 'tri': {
      const t = /^(是|接受|服从|愿意|同意|yes)/i.test(v) ? 'yes' : /^(否|不接受|不服从|不愿意|no)/i.test(v) ? 'no' : undefined;
      if (!t) return false;
      c.add({ ...base, value: t, display: t === 'yes' ? '是' : '否' });
      return true;
    }
    case 'postal': {
      const m = /(?<!\d)\d{6}(?!\d)/.exec(v);
      if (!m) return false;
      c.add({ ...base, value: m[0], display: m[0] });
      return true;
    }
    case 'emergency': {
      // “林建国（父亲）139-0013-9000”
      const name = /^([一-龥·]{2,6})/.exec(v)?.[1];
      const relation = /(父亲|母亲|配偶|丈夫|妻子|哥哥|弟弟|姐姐|妹妹|祖父|祖母|外祖父|外祖母|朋友|同学|老师)/.exec(v)?.[1];
      const mobile = /1[3-9]\d{9}/.exec(v.replace(/[\s-]/g, ''))?.[0];
      if (!name && !mobile) return false;
      if (name) c.add({ ...base, path: 'contact.emergencyContact.name', label: '紧急联系人姓名', value: name, display: name });
      if (relation) c.add({ ...base, path: 'contact.emergencyContact.relation', label: '与紧急联系人关系', value: relation, display: relation });
      if (mobile) c.add({ ...base, path: 'contact.emergencyContact.mobile', label: '紧急联系人电话', value: mobile, display: mobile });
      return true;
    }
    case 'custom': {
      const val = spec.label === '体重(kg)' ? /(\d{2,3}(?:\.\d)?)/.exec(v)?.[1] : v;
      if (!val) return false;
      c.add({ ...base, value: val, display: spec.label === '体重(kg)' ? `${val} 公斤` : val });
      return true;
    }
    case 'regionList': {
      const list = v
        .split(/[、,，;；/\s]+/)
        .map(parseRegion)
        .filter((r): r is NonNullable<typeof r> => !!r);
      if (list.length === 0) return false;
      c.add({ ...base, value: list, display: list.map(regionDisplay).join('、') });
      return true;
    }
    case 'number': {
      const m = /(\d{2,3}(?:\.\d)?)/.exec(v);
      if (!m) return false;
      c.add({ ...base, value: Number(m[1]), display: `${m[1]} 厘米` });
      return true;
    }
    case 'marital': {
      const map: Array<[RegExp, string, string]> = [
        [/未婚/, 'unmarried', '未婚'],
        [/已婚/, 'married', '已婚'],
        [/离异/, 'divorced', '离异'],
        [/丧偶/, 'widowed', '丧偶'],
      ];
      const hit = map.find(([re]) => re.test(v));
      if (!hit) return false;
      c.add({ ...base, value: hit[1], display: hit[2] });
      return true;
    }
    case 'list': {
      const list = v
        .split(/[、,，;；/|]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length === 0) return false;
      c.add({ ...base, value: list, display: list.join('、') });
      return true;
    }
  }
}

/** 一行里的“键：值”对。值截止到下一个键或分隔符。 */
function kvPairs(line: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  const hits: Array<{ key: string; start: number; valueStart: number }> = [];
  KV_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KV_RE.exec(line))) {
    // 键前面必须是行首或分隔符，避免“紧急联系人电话：”被当作“电话：”
    const before = line.slice(0, m.index);
    if (/(联系人|父亲|母亲|家庭|紧急|单位|公司|学校|导师|证明人)$/.test(before)) continue;
    hits.push({ key: m[1], start: m.index, valueStart: m.index + m[0].length });
  }
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : line.length;
    const seg = line.slice(h.valueStart, end).trim();
    // 列表类（求职意向、期望城市）保留整段，其余取第一个分隔符前的部分
    const kind = specOf(h.key)?.kind;
    const isList = kind === 'list' || kind === 'regionList';
    const value = isList ? seg : seg.split(/\s*[|｜丨]\s*|\s{2,}/)[0].trim();
    out.push({ key: h.key, value });
  });
  return out;
}

/**
 * 表格式简历的一行：“姓名 王五 性别 男 出生年月 1999.05”“姓名 | 王五 | 性别 | 男”。
 * 标签后面直到下一个标签的内容是值。至少两个标签，或整行就是“标签 值”，才按表格理解。
 */
function tablePairs(line: string): Array<{ key: string; value: string }> {
  if (/[。！？]/.test(line)) return [];
  const ts = line.split(/\s*[|｜丨]\s*|\s+/).filter(Boolean);
  const at = ts.map((t, i) => (isKeyToken(t) ? i : -1)).filter((i) => i >= 0);
  if (at.length === 0 || !(at.length >= 2 || (at[0] === 0 && ts.length === 2))) return [];
  const out: Array<{ key: string; value: string }> = [];
  at.forEach((i, n) => {
    const value = ts.slice(i + 1, n + 1 < at.length ? at[n + 1] : ts.length).join(' ');
    if (value) out.push({ key: ts[i].replace(/[:：]$/, ''), value });
  });
  return out;
}

/** 整行只有一个标签（“籍贯”“邮箱：”）：值在下一行。 */
function keyOnly(line: string): string | undefined {
  const t = line.trim().replace(/\s*[:：]$/, '');
  return isKeyToken(t) ? t : undefined;
}

const NAME_STOP = /简历|个人|求职|应聘|基本|信息|资料|联系|电话|手机|邮箱|地址|教育|经历|技能|证书|荣誉|评价|意向/;

function parseHeader(lines: string[], c: Collector, consumed: Set<string>) {
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const L = unspaceKeys(line);
    const colon = kvPairs(L);
    const pairs = colon.length ? colon : tablePairs(L);
    let used = false;
    // 标签和值分在两行：“邮箱：”后的值被窄栏换到下一行，或表格单元格逐格成行
    const lone = keyOnly(L);
    const next = li + 1 < lines.length ? unspaceKeys(lines[li + 1]) : undefined;
    if (lone && next !== undefined && !keyOnly(next) && kvPairs(next).length === 0 && !headingKey(next) && addKv(c, lone, next.trim(), `${line}\n${lines[li + 1]}`)) {
      consumed.add(line);
      consumed.add(lines[li + 1]);
      li++;
      continue;
    }
    for (const p of pairs) used = addKv(c, p.key, p.value, line) || used;
    // 顶部横幅里的“湖南大学 · 会计学 · 本科”：没有标签也能看出是教育信息
    if (!pairs.length && !c.edu.has('edu.school') && line.length <= 60) {
      const school = SCHOOL_RE.exec(line)?.[1];
      const level = levelOf(line);
      if (school && level && !/(公司|集团|银行|实习|工作|任职)/.test(line)) {
        c.edu.set('edu.school', { value: school, source: line });
        c.edu.set('edu.level', { value: LEVEL_ZH[level], source: line });
        const major = line
          .replace(school, ' ')
          .split(/[\s|｜丨·,，/]+/)
          .map((t) => t.replace(LEVEL_STRIP, '').replace(/专业$/, '').trim())
          .find((t) => t.length >= 2 && t.length <= 20 && !/\d|届|GPA|学院$/.test(t));
        if (major) c.edu.set('edu.major', { value: major, source: line });
        used = true;
      }
    }
    // 没有“键：值”的行：按分隔符逐段识别（男 | 23岁 | 中共党员 | 湖南长沙）
    for (const t of line.split(/[\s|｜丨,，;；]+/).filter(Boolean)) {
      if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(t)) used = addKv(c, '邮箱', t, line) || used;
      else if (/^(\+?86[-\s]?)?1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}$/.test(t)) used = addKv(c, '手机', t, line) || used;
      else if (/^(男|女)$/.test(t)) used = addKv(c, '性别', t, line) || used;
      else if (POLITICAL_WORDS.some(([re]) => re.test(t)) && t.length <= 8) used = addKv(c, '政治面貌', t, line) || used;
      else if (/^[一-龥]{1,5}族$/.test(t) && ethnicityOf(t)) used = addKv(c, '民族', t, line) || used;
      else if (/^(\d{4})\s*[.\-/年]\s*(\d{1,2})\s*月?\s*(出生|生)$/.test(t)) used = addKv(c, '出生日期', t, line) || used;
    }
    // 散落在行内的邮箱 / 手机
    const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(line);
    if (email) used = addKv(c, '邮箱', email[0], line) || used;
    const mobile = /(?<!\d)1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}(?!\d)/.exec(line);
    if (mobile && !/身份证|证件|紧急|联系人|父亲|母亲|家属|导师|证明人/.test(line)) used = addKv(c, '手机', mobile[0], line) || used;
    if (used) consumed.add(line);
  }
  // 姓名：没有“姓名：”时，取开头几行中 2–4 个汉字的独立行（“姓名”“性别”这类标签不算）
  if (!c.fields.has('basic.name')) {
    for (const line of lines.slice(0, 4)) {
      const first = line.split(/[\s|｜丨,，:：]+/)[0] ?? '';
      if (/^[一-龥]{2,4}$/.test(first) && !NAME_STOP.test(first) && !isKeyToken(first) && !headingKey(first) && !ethnicityOf(first) && !politicalOf(first) && !/^(男|女)/.test(first)) {
        c.add({ path: 'basic.name', label: '姓名', value: first, display: first, source: line });
        consumed.add(line);
        break;
      }
    }
  }
}

// ---------------- 经历条目 ----------------

interface Entry {
  head: string; // 含日期区间的行（去掉日期后）
  range: Range;
  body: string[];
  raw: string[];
}

/** 条目正文按原文（保留中文标点）。 */
const bodyOrig = (e: Entry): string[] => e.body.map((_, i) => origBody(e.raw[e.raw.length - e.body.length + i]));

const looksLikeTitle = (l: string | undefined): boolean => !!l && l.length <= 60 && (SCHOOL_RE.test(l) || COMPANY_RE.test(l) || /[|｜丨]/.test(l));

/** 以“含日期区间的行”为条目起点切分。日期单独成行时，与相邻的标题行合并。 */
function splitEntries(lines: string[]): { entries: Entry[]; loose: string[] } {
  const entries: Entry[] = [];
  const loose: string[] = [];
  let cur: Entry | undefined;
  let pendingTitle: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const r = findRange(line);
    if (r) {
      let head = (line.slice(0, r.index) + ' ' + line.slice(r.index + r.text.length)).replace(/\s*[|｜丨]\s*/g, '  ').replace(/^[\s:：,，-]+|[\s:：,，-]+$/g, '').trim();
      const raw = [line];
      const next = i + 1 < lines.length && !findRange(lines[i + 1]) && !headingKey(lines[i + 1]) ? lines[i + 1] : undefined;
      // 日期独占一行：标题在上一行或下一行。上一行像标题（学校/单位/竖线分隔）时优先用上一行。
      const usePrev = !head && pendingTitle && (looksLikeTitle(pendingTitle) || !looksLikeTitle(next));
      if (usePrev && pendingTitle) {
        head = pendingTitle;
        raw.unshift(pendingTitle);
        if (cur && cur.body[cur.body.length - 1] === pendingTitle) {
          cur.body.pop();
          cur.raw.pop();
        } else {
          const li = loose.lastIndexOf(pendingTitle);
          if (li >= 0) loose.splice(li, 1);
        }
      } else if (!head && next) {
        head = next;
        i++;
        raw.push(head);
      }
      cur = { head, range: r, body: [], raw };
      entries.push(cur);
      pendingTitle = undefined;
    } else if (cur) {
      cur.body.push(stripBullet(line));
      cur.raw.push(line);
      pendingTitle = line;
    } else {
      loose.push(line);
      pendingTitle = line;
    }
  }
  return { entries, loose };
}

function levelOf(s: string): EducationLevel | undefined {
  return LEVEL_WORDS.find(([re]) => re.test(s))?.[1];
}

const EN_SCHOOL_RE = /((?:The )?University of [A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){0,3}|[A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){0,3} (?:University|College|Institute of Technology))/;
const LEVEL_STRIP = /(硕士研究生|博士研究生|本科生|本科|硕士|博士|研究生|学士学位|学士|学位|专科|大专|在读|非全日制|全日制|统招)/g;

/** 学校与学院连写时拆开：“北京大学光华管理学院” → 北京大学 + 光华管理学院。 */
function splitSchool(raw: string): { school: string; college?: string } {
  const s = raw.replace(/^(本科|硕士|博士|专科|研究生|大专)/, '');
  const m = /^(.+?(?:大学|学校))(.{2,}?(?:学院|系))$/.exec(s);
  return m ? { school: m[1], college: m[2] } : { school: s };
}

/** 常见境外（含港澳台）院校的中文名。只用于推断“境外院校”，不确定时不推断。 */
const NON_MAINLAND_RE = /^(新加坡|香港|澳门|台湾|南洋理工|曼彻斯特|伦敦|帝国理工|爱丁堡|格拉斯哥|伯明翰|利兹|谢菲尔德|诺丁汉|布里斯托|华威|杜伦|约克大学|悉尼|墨尔本|新南威尔士|昆士兰|莫纳什|多伦多|麦吉尔|英属哥伦比亚|哥伦比亚大学|纽约大学|南加州|加州大学|宾夕法尼亚|东京|京都|早稻田|庆应|首尔|延世|高丽|牛津|剑桥)/;

function parseEducation(e: Entry): ParsedRecord {
  const all = [e.head, ...e.body].join('  ');
  const notes: string[] = [];
  const rec: Record<string, unknown> = {};
  if (e.range.start) rec.start = e.range.start;
  else notes.push('入学时间未识别');
  if (e.range.end) rec.end = e.range.end;
  const rawSchool = SCHOOL_RE.exec(e.head)?.[1] ?? EN_SCHOOL_RE.exec(e.head)?.[1] ?? SCHOOL_RE.exec(all)?.[1] ?? EN_SCHOOL_RE.exec(all)?.[1];
  const sp = rawSchool ? splitSchool(rawSchool) : undefined;
  const school = sp?.school;
  if (school) rec.school = school;
  else notes.push('没有识别到学校名称');
  const level = levelOf(e.head) ?? levelOf(all);
  if (level) {
    rec.level = level;
    if (/学士|硕士|博士|学位|Bachelor|Master|Ph\.?D/i.test(all) && DEGREE_FOR[level]) rec.degree = DEGREE_FOR[level];
  } else notes.push('学历未识别，请选择');
  // 学院
  let headRest = rawSchool ? e.head.replace(rawSchool, ' ') : e.head;
  const college = sp?.college ?? /([一-龥]{1,20}(学院|系))(?![一-龥])/.exec(headRest)?.[1];
  if (college && college !== school) {
    rec.college = college;
    headRest = headRest.replace(college, ' ');
  }
  // 专业
  const majorKv = /专业\s*[:：]\s*([^\s|｜,，;；]{2,30})/.exec(all);
  if (majorKv) rec.major = majorKv[1];
  else {
    const cand = headRest
      .split(/[\s|｜丨,，;；]+/)
      .map((t) => t.replace(/\(.*?\)/g, '').replace(LEVEL_STRIP, '').replace(/^专业[:：]?/, '').trim())
      .filter((t) => t.length >= 2 && t.length <= 20 && !/^\d|GPA|绩点|排名|^[A-Za-z.]{1,4}$/i.test(t));
    if (cand[0]) rec.major = cand[0].replace(/专业$/, '');
  }
  if (!rec.major && !headRest.replace(/[\s|｜丨,，;；·]+/g, '')) {
    // 单元格逐行提取时，学校下一行是专业：只认像专业名称的词（“荣获国家奖学金”不算）
    const m = e.body.slice(0, 3).map((l) => l.trim()).find((l) => MAJOR_LIKE.test(l) && !/(大学|学院|学校)$/.test(l) && !levelOf(l));
    if (m) rec.major = m.replace(/专业$/, '');
  }
  if (!rec.major) notes.push('专业未识别');
  const direction = /研究方向\s*[:：]\s*([^\s|｜,，;；]{2,30})/.exec(all);
  if (direction) rec.researchDirection = direction[1];
  const gpa = /(?:GPA|绩点|平均学分绩点)\s*[:：]?\s*(\d(?:\.\d{1,2})?\s*(?:\/\s*\d(?:\.\d)?)?)/i.exec(all);
  if (gpa) rec.gpa = gpa[1].replace(/\s+/g, '');
  const rank = /(?:专业)?排名\s*[:：]?\s*((?:前\s*)?\d+(?:\.\d+)?\s*%|\d+\s*\/\s*\d+)/.exec(all);
  if (rank) rec.rank = rank[1].replace(/\s+/g, '');
  const courses = /(?:主修课程|核心课程|主要课程|相关课程)\s*[:：]\s*(.+)/.exec(e.body.join('\n'));
  if (courses) {
    rec.mainCourses = courses[1]
      .split(/[、,，;；]+/)
      .map((s) => s.replace(/\(\d+(\.\d+)?\)|（\d+）|\d{2,3}分?$/g, '').trim())
      .filter((s) => s && s.length <= 30);
  }
  if (/非全日制/.test(all)) rec.studyMode = 'part-time';
  else if (/全日制/.test(all)) rec.studyMode = 'full-time';
  if (/统招/.test(all) && !/非统招/.test(all)) rec.admissionType = 'unified';
  else if (/非统招/.test(all)) rec.admissionType = 'non-unified';
  else if (school && NON_MAINLAND_RE.test(school)) {
    rec.admissionType = 'non-mainland';
    notes.push('按学校名称推断为境外院校，请核对');
  }
  const duration = /学制\s*[:：]?\s*(\d+(?:\.5)?)\s*年/.exec(all);
  if (duration) rec.durationYears = Number(duration[1]);
  for (const [label, key] of [['是否专升本', 'isTransferFromJuniorCollege'], ['是否有双学位', 'hasDoubleDegree'], ['是否是学生干部', 'isStudentCadre']] as const) {
    const hit = new RegExp(`${label}\\s*[:：]\\s*(是|否)`).exec(all);
    if (hit) rec[key] = hit[1] === '是' ? 'yes' : 'no';
  }
  const experience = /在校经历\s*[:：]\s*(.+)/.exec(bodyOrig(e).join('\n'));
  if (experience) rec.schoolExperience = experience[1];
  const display = `${level ? LEVEL_ZH[level] : '学历?'} · ${school ?? '学校?'}${rec.major ? ` · ${rec.major}` : ''} · ${e.range.start || '?'}–${e.range.end ?? ''}`;
  return { collection: 'education', record: rec, display, source: e.raw.join('\n'), notes };
}

/** 正文前的“工作内容：”这类栏目名不是内容本身（网页上的字段已经叫“工作描述”）。 */
const BODY_LABEL = /^(工作内容|工作职责|主要职责|工作描述|职责描述|主要工作|岗位职责|工作业绩|实习内容)(?:\s*[:：]\s*|\s+|$)/;

function bodyText(e: Entry, skip = 0): string | undefined {
  const t = bodyOrig(e).slice(skip).map((l) => l.replace(BODY_LABEL, '')).filter(Boolean).join('\n').trim();
  return t || undefined;
}

const MAJOR_LIKE = /^[一-龥()（）与和及]{1,20}(学|工程|技术|管理|经济|金融|会计|审计|财务|法|设计|教育|艺术|文学|翻译|新闻|传播|医学|护理|药学|科学|统计|物理|化学|生物|数学|计算机|软件|电子|通信|自动化|机械|土木|建筑|材料|能源|环境|心理|哲学|历史|政治|英语|日语|商务|贸易|物流|营销|人力资源|信息|数据|智能)(专业)?$/;

const SALARY_RE = /(?:月薪|薪资|工资|月收入|薪酬)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*([kK千wW万])?\s*(?:元|RMB)?(?:\s*\/\s*月)?/;

function parseWork(e: Entry, sectionTitle: string): ParsedRecord {
  const notes: string[] = [];
  const rec: Record<string, unknown> = {};
  if (e.range.start) rec.start = e.range.start;
  if (e.range.end) rec.end = e.range.end;
  // 含中文的片段按空格再切（英文单位名中的空格保留）
  const sal = SALARY_RE.exec(e.head) ?? SALARY_RE.exec(e.body.join(' '));
  if (sal) rec.salary = Math.round(Number(sal[1]) * (/[kK千]/.test(sal[2] ?? '') ? 1000 : /[wW万]/.test(sal[2] ?? '') ? 10000 : 1));
  const head = sal ? e.head.replace(sal[0], ' ') : e.head;
  const ts = tokens(head).flatMap((t) => (/[一-龥]/.test(t) ? t.split(/\s+/) : [t]));
  const company = ts.find((t) => COMPANY_RE.test(t) && !/(实习生|助理|经理|工程师|专员|分析师|顾问)$/.test(t)) ?? ts[0];
  let rest = ts.filter((t) => t !== company);
  const loc = rest.map((t) => ({ t, r: parseRegion(t) })).find((x) => x.r && x.t.length <= 12);
  if (loc) {
    rec.location = loc.r;
    rest = rest.filter((t) => t !== loc.t);
  }
  const dept = rest.find((t) => /(部|处|科|组|中心|事业部|团队|Department|Team)$/i.test(t));
  let title = rest.find((t) => t !== dept && TITLE_RE.test(t)) ?? rest.find((t) => t !== dept);
  // 单元格逐行提取时，单位下一行是职位
  const first = e.body[0]?.trim();
  const titleFromBody = !title && !!first && first.length <= 20 && !/[\s:：,，。;；]/.test(first) && TITLE_RE.test(first);
  if (titleFromBody) title = first;
  if (company) rec.company = company;
  else notes.push('单位名称未识别');
  if (dept) rec.department = dept;
  if (title) rec.title = title.replace(/[(（](兼职|实习|全职)[)）]$/, '').trim();
  else notes.push('职位名称未识别');
  if (!e.range.start) notes.push('开始时间未识别');
  const all = [e.head, ...e.body].join(' ');
  if (/兼职|Part[-\s]?time/i.test(e.head)) rec.kind = 'part-time';
  else if (/实习|Intern/i.test(e.head) || (/实习/.test(sectionTitle) && !/工作/.test(sectionTitle))) rec.kind = 'internship';
  else if (/兼职|Part[-\s]?time/i.test(all)) rec.kind = 'part-time';
  else if (/实习/.test(sectionTitle) || /实习|Intern/i.test(all)) {
    rec.kind = 'internship';
    notes.push('工作性质按“实习”推断，请核对');
  } else {
    rec.kind = 'full-time';
    notes.push('工作性质按“全职”推断，请核对');
  }
  const desc = bodyText(e, titleFromBody ? 1 : 0);
  if (desc) rec.description = desc;
  return { collection: 'work', record: rec, display: `${company ?? '单位?'} · ${title ?? '职位?'} · ${e.range.start}–${e.range.end ?? ''}`, source: e.raw.join('\n'), notes };
}

function parseProject(e: Entry): ParsedRecord {
  const notes: string[] = [];
  const rec: Record<string, unknown> = {};
  if (e.range.start) rec.start = e.range.start;
  if (e.range.end) rec.end = e.range.end;
  let ts = tokens(e.head).flatMap((t) => (/[一-龥]/.test(t) && t.length > 16 ? t.split(/\s+/) : [t]));
  // “校园二手交易平台 项目负责人”：角色在末尾、只隔一个空格（PDF 常把多个空格合成一个）
  if (!ts.some((t) => ROLE_RE.test(t) && t.length <= 12) && ts.length === 1) {
    const m = /^(.+?)\s+(\S{0,8}(负责人|组长|队长|主持人|核心成员|成员|参与者|参与人|主要完成人|项目经理))$/.exec(ts[0]);
    if (m) ts = [m[1], m[2]];
  }
  const role = ts.find((t) => ROLE_RE.test(t) && t.replace(/[(（][^)）]*[)）]/g, '').length <= 12);
  const name = ts.find((t) => t !== role) ?? '';
  if (name) rec.name = name.replace(/^项目名称\s*[:：]\s*/, '');
  else notes.push('项目名称未识别');
  if (role) {
    // “组长（4 人）”
    const team = /[(（]\s*(\d{1,3})\s*人\s*[)）]/.exec(role);
    if (team) rec.teamSize = Number(team[1]);
    rec.role = role.replace(/[(（]\s*\d{1,3}\s*人\s*[)）]/, '').replace(/^(角色|担任)\s*[:：]?\s*/, '').trim();
  }
  const org = ts.find((t) => t !== role && t !== name && (SCHOOL_RE.test(t) || COMPANY_RE.test(t)));
  if (org) rec.organization = org;
  let target = 'introduction';
  for (const line of bodyOrig(e)) {
    const labeled = /^(项目介绍|项目描述|项目职责|本人职责|项目成果|项目业绩|所在单位|项目单位|团队规模)\s*[:：]\s*(.*)$/.exec(line);
    if (labeled) {
      const key = ({ 项目介绍: 'introduction', 项目描述: 'introduction', 项目职责: 'duty', 本人职责: 'duty', 项目成果: 'achievement', 项目业绩: 'achievement', 所在单位: 'organization', 项目单位: 'organization', 团队规模: 'teamSize' } as Record<string, string>)[labeled[1]];
      if (key === 'teamSize') {
        if (/^\d+\s*人?$/.test(labeled[2])) rec.teamSize = Number(labeled[2].replace(/人$/, '').trim());
      } else rec[key] = rec[key] ? `${rec[key]}\n${labeled[2]}` : labeled[2];
      if (['introduction', 'duty', 'achievement'].includes(key)) target = key;
    } else rec[target] = rec[target] ? `${rec[target]}\n${line}` : line;
  }
  return { collection: 'projects', record: rec, display: `${rec.name ?? '项目?'}${role ? ` · ${role}` : ''} · ${e.range.start}–${e.range.end ?? ''}`, source: e.raw.join('\n'), notes };
}

function parseRole(e: Entry, collection: 'studentLeadership' | 'socialPractice'): ParsedRecord {
  const notes: string[] = [];
  const rec: Record<string, unknown> = {};
  if (e.range.start) rec.start = e.range.start;
  if (e.range.end) rec.end = e.range.end;
  const ts = tokens(e.head).flatMap((t) => (/[一-龥]/.test(t) ? t.split(/\s+/) : [t]));
  const role = ts.find((t) => LEAD_ROLE_RE.test(t) && t.length <= 12 && ts.length > 1);
  const org = ts.find((t) => t !== role);
  if (org) rec.organization = org;
  else notes.push('组织名称未识别');
  if (role) rec.role = role;
  else if (ts.length === 1 && org) {
    // “校学生会宣传部部长”：组织和职务写在一起
    const m = /(.+?)(主席|副主席|副部长|部长|干事|副会长|会长|副社长|社长|班长|团支书|支部书记|委员|队长|负责人|成员|志愿者)$/.exec(org);
    if (m) {
      rec.organization = m[1];
      rec.role = m[2];
    } else notes.push('职务未识别');
  } else notes.push('职务未识别');
  const desc = bodyText(e);
  if (desc) rec.description = desc;
  return { collection, record: rec, display: `${rec.organization ?? '组织?'} · ${rec.role ?? '职务?'}`, source: e.raw.join('\n'), notes };
}

// ---------------- 荣誉、证书、技能 ----------------

const ISSUER_RE = /(部|委员会|委|学会|协会|大学|学院|学校|政府|中心|局|厅|团委|基金会|公司|集团|组委会|联合会|研究会|银行)$/;
const dropEmptyParens = (s: string) => s.replace(/[(（]\s*[)）]/g, '').replace(/\s{2,}/g, ' ');

function parseHonorLine(line: string): ParsedRecord | undefined {
  const d = findSingleDate(line);
  let name = (d ? line.replace(d.text, ' ') : line).replace(/^[\s:：|｜,，;；-]+|[\s:：|｜,，;；-]+$/g, '').replace(/\s{2,}/g, ' ');
  name = dropEmptyParens(stripBullet(name)).trim();
  if (name.length < 2) return undefined;
  const rec: Record<string, unknown> = {};
  // “国家奖学金（中华人民共和国教育部）”：括号里像机构名的是颁奖单位
  const iss = /^(.+?)\s*[(（]([^()（）]{2,30})[)）]$/.exec(name);
  if (iss && ISSUER_RE.test(iss[2])) {
    name = iss[1].trim();
    rec.issuer = iss[2].trim();
  }
  rec.name = name;
  if (d) rec.date = d.date;
  const explicit = HONOR_LEVEL_EXPLICIT.find(([re]) => re.test(name));
  const implied = explicit ? undefined : HONOR_LEVEL_IMPLIED.find(([re]) => re.test(name));
  const lv = explicit ?? implied;
  if (lv) rec.level = lv[1];
  const gr = HONOR_GRADE_WORDS.find(([re]) => re.test(name));
  if (gr) rec.grade = gr[1];
  return { collection: 'honors', record: rec, display: `${name}${d ? ` · ${d.date}` : ''}`, source: line, notes: implied ? ['奖励级别按名称推断，请核对'] : [] };
}

function parseSkillItem(item: string, line: string): ParsedRecord | undefined {
  const t = item.trim().replace(/^(证书|技能|语言|计算机|外语|英语|资格证书|职业资格)\s*[:：]\s*/, '');
  if (!t || t.length > 60) return undefined;
  const d = findSingleDate(t);
  const noDate = dropEmptyParens(d ? t.replace(d.text, ' ') : t).trim();
  for (const lc of LANG_CERTS) {
    const m = lc.re.exec(noDate);
    if (!m) continue;
    const level = m[1] ?? m[2] ?? m[3];
    const isJlpt = lc.certificate === 'JLPT';
    const rec: Record<string, unknown> = { language: lc.language, certificate: isJlpt ? `JLPT N${level ?? ''}` : lc.certificate };
    const after = noDate.slice(m.index + m[0].length);
    const sc = isJlpt ? /(\d{2,3})\s*分/.exec(after) : /(\d{2,3}(?:\.\d)?|\d\.\d)\s*分?/.exec(after);
    if (sc) rec.score = sc[1];
    if (d) rec.date = d.date;
    return { collection: 'languages', record: rec, display: `${lc.language} · ${rec.certificate}${rec.score ? ` · ${rec.score}` : ''}`, source: line, notes: [] };
  }
  if (COMPUTER_RE.test(t)) {
    const rec: Record<string, unknown> = { name: noDate.replace(/\s{2,}/g, ' ').trim() };
    if (d) rec.date = d.date;
    return { collection: 'computerSkills', record: rec, display: String(rec.name), source: line, notes: [] };
  }
  if (CERT_RE.test(t)) {
    const name = noDate.replace(/\s{2,}/g, ' ').trim();
    let status: string = 'obtained';
    const notes: string[] = [];
    if (/在考|备考|准备|报考|进行中|in progress/i.test(t)) status = 'in-progress';
    else if (/部分|已过|已通过.+[、,，]|\d\s*门|\d\s*科|科目/.test(t)) status = 'partial';
    else notes.push('按“已取得”记录，请核对');
    const rec: Record<string, unknown> = { name: name.replace(/\s*[(（](备考中|在考|准备中|报考中?|进行中|已报名)[)）]/, '').trim(), status };
    if (d) rec.date = d.date;
    return { collection: 'certificates', record: rec, display: `${name}（${status === 'obtained' ? '已取得' : status === 'partial' ? '部分通过' : '在考'}）`, source: line, notes };
  }
  // 其余视为技能，去掉“熟练掌握/熟悉/了解”
  const lvl: Array<[RegExp, string]> = [
    [/^(精通)/, 'expert'],
    [/^(熟练掌握|熟练使用|熟练|掌握)/, 'proficient'],
    [/^(良好)/, 'good'],
    [/^(熟悉|了解|会使用|能够使用|一般)/, 'basic'],
  ];
  const hit = lvl.find(([re]) => re.test(t));
  let name = t.replace(/^(精通|熟练掌握|熟练使用|熟练|掌握|良好|熟悉|了解|会使用|能够使用|一般)\s*/, '').replace(/[。.;；]$/, '').trim();
  // “Python（pandas、scikit-learn）”：括号里是补充说明
  let note: string | undefined;
  const paren = /^(.+?)\s*[(（]([^()（）]+)[)）]$/.exec(name);
  if (paren) {
    name = paren[1].trim();
    note = paren[2].trim();
  }
  if (!name || name.length > 24 || /[。，,]/.test(name)) return undefined;
  const rec: Record<string, unknown> = { name };
  if (hit) rec.level = hit[1];
  if (note) rec.note = note;
  return { collection: 'skills', record: rec, display: name, source: line, notes: [] };
}

/** 按分隔符切分，但不切括号里的内容（“CPA（已通过会计、税法）”是一项）。 */
function splitOutsideParens(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '（') depth++;
    if ((ch === ')' || ch === '）') && depth > 0) depth--;
    if (depth === 0 && sep.test(ch)) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/**
 * 窄栏中被折行的列表：“熟练使用 Java、Spring” + “Boot、MySQL” → 一行。
 * 只在上一行是“顿号/逗号分隔的列表”、且断在两个英文单词之间时合并。
 */
function joinWrapped(lines: string[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev !== undefined && /[、,，]/.test(prev) && /[A-Za-z]$/.test(prev) && /^[A-Za-z]/.test(l) && !/[:：]/.test(l)) {
      out[out.length - 1] = `${prev} ${l}`;
    } else out.push(l);
  }
  return out;
}

function splitSkillLine(line: string): string[] {
  const body = line.replace(/^[^:：]{1,8}[:：]\s*/, (m) => (/证书|技能|语言|计算机|外语|英语|资格|软件|工具|编程|办公/.test(m) ? '' : m));
  // “熟练使用 Python、SQL、Excel”：动词前缀分配给后面每一项；
  // “精通 Excel，熟练使用 SQL、Python”：遇到新的前缀就换成新的（Python 是“熟练”，不是“精通”）
  const LEVEL = /^(精通|熟练掌握|熟练使用|熟练|掌握|良好|熟悉|了解|会使用|一般)\s*/;
  let prefix: string | undefined;
  return splitOutsideParens(body, /[；;，,、|｜]/).map((s) => {
    const own = LEVEL.exec(s)?.[1];
    if (own) {
      prefix = own;
      return s;
    }
    return prefix && !/^(精通|熟练|掌握|良好|熟悉|了解|会|一般|听说|读写)/.test(s) && s.replace(/[(（][^)）]*[)）]/g, '').length <= 20 ? `${prefix}${s}` : s;
  });
}

const ABILITY: Record<string, string> = { 一般: 'basic', 良好: 'good', 熟练: 'proficient', 精通: 'expert' };

const RELATION_RE = /^(父亲|母亲|配偶|丈夫|妻子|儿子|女儿|哥哥|弟弟|姐姐|妹妹|兄弟|姐妹|祖父|祖母|外祖父|外祖母|爷爷|奶奶|外公|外婆)\s*[:：]?\s*(.+)$/;

/** “父亲：林建国  宜昌市第一中学  教师  中共党员” */
function parseFamilyLine(line: string): ParsedRecord | undefined {
  const m = RELATION_RE.exec(line.trim());
  if (!m) return undefined;
  // PDF 常把多个空格合成一个：含中文的片段再按空格切
  const ts = tokens(m[2]).flatMap((t) => (/[一-龥]/.test(t) ? t.split(/\s+/) : [t]));
  const name = ts.shift();
  if (!name || !/^[一-龥·]{2,6}$/.test(name)) return undefined;
  const rec: Record<string, unknown> = { relation: m[1], name };
  const rest: string[] = [];
  for (const t of ts) {
    const mob = /1[3-9]\d{9}/.exec(t.replace(/[\s-]/g, ''));
    const pol = t.length <= 12 ? politicalOf(t) : undefined;
    if (mob) rec.mobile = mob[0];
    else if (pol) rec.politicalStatus = pol;
    else if (!rec.employer && (COMPANY_RE.test(t) || /(中学|小学|医院|学校|单位|公司|厂|所|站|社)$/.test(t))) rec.employer = t;
    else rest.push(t);
  }
  if (rest.length) rec.position = rest.join(' ');
  const d = findSingleDate(m[2]);
  if (d) rec.birthDate = d.date;
  return { collection: 'family', record: rec, display: `${m[1]} · ${name}${rec.employer ? ` · ${rec.employer}` : ''}`, source: line, notes: [] };
}

// ---------------- 主入口 ----------------

export function parseResumeText(input: string): ParseResult {
  ORIGIN = new Map();
  const lines: string[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = clean(raw);
    if (!line) continue;
    if (!ORIGIN.has(line)) ORIGIN.set(line, keepWidth(raw));
    lines.push(line);
  }

  // 切分区块；标题和内容在同一行时拆开（“教育背景  2019.09-2023.06 中山大学…”）
  const blocks: Array<{ key: SectionKey; title: string; lines: string[] }> = [{ key: 'header', title: '', lines: [] }];
  for (const line of joinWrappedRanges(lines)) {
    const h = headingInfo(line);
    if (h) {
      blocks.push({ key: h.key, title: h.title, lines: [] });
      continue;
    }
    const sp = splitHeadingLine(line);
    if (sp) {
      const key = headingInfo(sp.heading)!;
      blocks.push({ key: key.key, title: key.title, lines: [] });
      // “求职意向  财务分析师  期望城市：上海”：标题本身也是“求职意向：”这个标签
      const rest = key.key === 'intention' && !isKeyToken(sp.rest.split(/[\s:：|｜]/)[0]) ? `求职意向:${sp.rest}` : sp.rest;
      const o = splitHeadingLine(orig(line));
      if (o && !ORIGIN.has(rest)) ORIGIN.set(rest, o.rest);
      blocks[blocks.length - 1].lines.push(rest);
      continue;
    }
    blocks[blocks.length - 1].lines.push(line);
  }

  const c = new Collector();
  const records: ParsedRecord[] = [];
  const unparsed: string[] = [];
  const consumed = new Set<string>();

  for (const b of blocks) {
    switch (b.key) {
      case 'header':
      case 'basic':
      case 'intention':
        parseHeader(b.lines, c, consumed);
        // “求职意向”区块里没有“键：值”的短行，视为期望职位
        if (b.key === 'intention' && !c.fields.has('intention.jobTypes')) {
          const jobs = b.lines.filter((l) => !consumed.has(l) && l.length <= 30).flatMap((l) => l.split(/[、,，;；/|｜]+/).map((x) => x.trim()).filter(Boolean));
          if (jobs.length) {
            c.add({ path: 'intention.jobTypes', label: '期望职位类别', value: jobs, display: jobs.join('、'), source: b.lines.join('\n') });
            b.lines.forEach((l) => consumed.add(l));
          }
        }
        for (const l of b.lines) if (!consumed.has(l)) unparsed.push(l);
        break;
      case 'education': {
        const { entries, loose } = splitEntries(b.lines);
        for (const e of entries) records.push(parseEducation(e));
        // 条目外的“GPA / 主修课程”行归到最近一条教育经历
        unparsed.push(...loose);
        break;
      }
      case 'work': {
        const { entries, loose } = splitEntries(b.lines);
        for (const e of entries) records.push(parseWork(e, b.title));
        unparsed.push(...loose);
        break;
      }
      case 'projects': {
        const { entries, loose } = splitEntries(b.lines);
        for (const e of entries) records.push(parseProject(e));
        unparsed.push(...loose);
        break;
      }
      case 'leadership':
      case 'practice': {
        const { entries, loose } = splitEntries(b.lines);
        for (const e of entries) records.push(parseRole(e, b.key === 'leadership' ? 'studentLeadership' : 'socialPractice'));
        unparsed.push(...loose);
        break;
      }
      case 'honors':
        for (const l of b.lines) {
          // 一行多个奖项（用分号/顿号分隔且没有日期区间）
          const parts = /[；;]/.test(l) ? l.split(/[；;]+/) : [l];
          let any = false;
          for (const p of parts) {
            const r = parseHonorLine(p.trim());
            if (r) {
              records.push(r);
              any = true;
            }
          }
          if (!any) unparsed.push(l);
        }
        break;
      case 'skills':
        for (const l of joinWrapped(b.lines)) {
          let any = false;
          const lineRecs: ParsedRecord[] = [];
          const ability: Record<string, string> = {};
          for (const item of splitSkillLine(stripBullet(l))) {
            // “听说熟练，读写精通”：归到同一行的语言证书上
            const ab = /(听说|读写)(?:能力)?\s*[:：]?\s*(一般|良好|熟练|精通)$/.exec(item.trim());
            if (ab) {
              ability[ab[1] === '听说' ? 'listenSpeak' : 'readWrite'] = ABILITY[ab[2]];
              continue;
            }
            const r = parseSkillItem(item, l);
            if (r) {
              records.push(r);
              lineRecs.push(r);
              any = true;
            }
          }
          const langs = lineRecs.filter((r) => r.collection === 'languages');
          for (const r of langs) Object.assign(r.record, ability);
          if (langs.length && Object.keys(ability).length) any = true;
          if (!any) unparsed.push(l);
        }
        break;
      case 'family':
        for (const l of b.lines) {
          const r = parseFamilyLine(stripBullet(l));
          if (r) records.push(r);
          else unparsed.push(l);
        }
        break;
      case 'self':
      case 'hobby':
      case 'papers': {
        // 原样保存（保留中文标点），不改写
        const body = b.lines.map(origBody).join('\n').trim();
        const title = b.key === 'self' ? (/[一-龥]/.test(b.title) ? b.title : '自我评价') : b.key === 'hobby' ? '兴趣爱好' : (/[一-龥]/.test(b.title) ? b.title : '论文发表');
        if (body) records.push({ collection: 'textTemplates', record: { title, kind: b.key === 'self' ? 'self-assessment' : 'other', body }, display: `${title}（${body.length} 字）`, source: b.lines.join('\n'), notes: ['原样保存，不改写'] });
        break;
      }
      case 'other':
        unparsed.push(...b.lines);
        break;
    }
  }

  // 基本信息表里的学校、专业、学历：教育经历里已有同一所学校时只补空缺，没有时新建一条
  const school = c.edu.get('edu.school');
  if (school) {
    const rec: Record<string, unknown> = { school: school.value.replace(/[(（][^)）]*[)）]$/, '').trim() };
    const notes: string[] = [];
    const lv = c.edu.get('edu.level') && levelOf(c.edu.get('edu.level')!.value);
    if (lv) rec.level = lv;
    else notes.push('学历未识别，请选择');
    const dg = c.edu.get('edu.degree') && levelOf(c.edu.get('edu.degree')!.value);
    if (dg && DEGREE_FOR[dg]) rec.degree = DEGREE_FOR[dg];
    const major = c.edu.get('edu.major')?.value.replace(/专业$/, '');
    if (major) rec.major = major;
    const college = c.edu.get('edu.college')?.value;
    if (college) rec.college = college;
    const date = (k: string) => {
      const v = c.edu.get(k)?.value;
      return v ? findSingleDate(v)?.date ?? (/^\d{4}$/.test(v.trim()) ? v.trim() : undefined) : undefined;
    };
    const start = date('edu.start');
    const end = date('edu.end');
    if (start) rec.start = start;
    else notes.push('入学时间未识别，请补充');
    if (end) rec.end = end;
    const sameSchool = records.find((r) => r.collection === 'education' && nz(r.record.school) === nz(rec.school));
    if (sameSchool) {
      for (const [k, v] of Object.entries(rec)) if (sameSchool.record[k] === undefined) sameSchool.record[k] = v;
    } else {
      const sources = [...new Set([...c.edu.values()].map((x) => x.source))].join('\n');
      records.unshift({
        collection: 'education',
        record: rec,
        display: `${lv ? LEVEL_ZH[lv] : '学历?'} · ${rec.school}${major ? ` · ${major}` : ''}${end ? ` · ${end} 毕业` : ''}`,
        source: sources,
        notes: ['从基本信息里的学校、专业生成', ...notes],
      });
    }
  }

  // 正文里散落的邮箱/手机（没有基本信息区块的简历）
  if (!c.fields.has('contact.email') || !c.fields.has('contact.mobile')) {
    for (const l of lines.slice(0, 12)) {
      const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(l);
      if (email) addKv(c, '邮箱', email[0], l);
      const mobile = /(?<!\d)1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}(?!\d)/.exec(l);
      if (mobile && !/身份证|证件|紧急|联系人|父亲|母亲|家属|导师|证明人/.test(l)) addKv(c, '手机', mobile[0], l);
    }
  }

  return {
    fields: [...c.fields.values()],
    records,
    sections: blocks.filter((b) => b.key !== 'header').map((b) => b.title),
    unparsed: unparsed.filter((l) => l.length > 1),
  };
}
