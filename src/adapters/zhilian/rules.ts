// 智联校园网申（xiaoyuan.zhaopin.com/scrd/resume2）适配器 —— 规则部分。
// 依据：登录后页面编辑态的结构（2026-11-09 核对）。字段 id 为 Element 表单项的 prop（label[for]）。
// 标注【待验证】的项：材料里没有对应浮层/弹窗的结构，需在真实页面用诊断报告确认。
import type { AdapterRules, FieldRule, SectionRule } from '../types';
import type { RecordCollection } from '../../core/profile/types';

declare const __TEST__: boolean;

const SECTIONS: SectionRule[] = [
  { key: 'basic', titles: ['个人信息'], mode: 'single', collection: 'single' },
  { key: 'education', titles: ['教育经历'], mode: 'repeat', collection: 'education' },
  { key: 'intention', titles: ['求职意向'], mode: 'single', collection: 'single' },
  { key: 'work', titles: ['实习/工作经历', '实习经历', '工作经历'], mode: 'repeat', collection: 'work' },
  { key: 'languages', titles: ['语言能力'], mode: 'repeat', collection: 'languages' },
  { key: 'skills', titles: ['专业技能'], mode: 'repeat', collection: 'skills' },
  { key: 'honors', titles: ['奖励荣誉'], mode: 'repeat', collection: 'honors' },
  { key: 'attachments', titles: ['附件'], mode: 'manual', manualNote: '证件照和简历附件需本人选择文件上传' },
  { key: 'other', titles: ['其他信息'], mode: 'single', collection: 'single' },
];

// 地区是网站自带的城市弹窗（s-region）：按 省 → 市 → 区县 点选，直辖市在“热门”里（drivers/sui.ts）

const FIELDS: FieldRule[] = [
  // 个人信息（个人信息.html）
  { section: 'basic', id: 'name', path: 'basic.name' },
  { section: 'basic', id: 'id_card_type', path: 'basic.idType', knownOptions: ['身份证', '其他'], note: '只选证件类型，证件号码由本人填写' },
  { section: 'basic', id: 'birth', path: 'basic.birthDate' },
  { section: 'basic', id: 'gender', path: 'basic.gender', knownOptions: ['男', '女'] },
  { section: 'basic', id: 'nation', path: 'basic.ethnicity' },
  { section: 'basic', id: 'healthiness_status', path: 'basic.healthStatus', knownOptions: ['健康', '良好', '有病史'] },
  { section: 'basic', id: 'marital_status', path: 'basic.maritalStatus', knownOptions: ['未婚', '已婚', '离异', '保密'] },
  { section: 'basic', id: 'politics_bg', path: 'basic.politicalStatus', knownOptions: ['团员', '中共党员（含预备党员）', '民主党派', '无党派人士', '群众'] },
  { section: 'basic', id: 'nowlocated_city', path: 'basic.currentResidence', kind: 'cascader' },
  { section: 'basic', id: 'hukou_city', path: 'basic.hukou', kind: 'cascader' },
  { section: 'basic', id: 'FIELD1002_city', path: 'basic.studentOrigin', kind: 'cascader' },
  { section: 'basic', id: 'mobile_number', path: 'contact.mobile', note: '区号保持网站默认（86）' },
  { section: 'basic', id: 'email', path: 'contact.email' },
  { section: 'basic', id: 'address', path: 'contact.address' },
  { section: 'basic', id: 'stature', path: 'basic.heightCm' },
  // 体重：档案没有固定字段，对应到档案“自定义字段”里标签为“体重(kg)”或“体重”的一项（按标签找回）
  { section: 'basic', id: 'avoirdupois', path: 'custom.weight' },

  // 教育经历（教育经历.html）。选了学历/学校后会出现更多字段（研究方向、院系、专业…），填写后重新扫描
  // 学校名称是输入联想框：写入全称后点名称完全一致的候选（网站据此带出“是否海外”等）；没有一致的候选就保留输入的全称
  { section: 'education', id: 'school_name', path: 'education.school', dependency: true },
  { section: 'education', id: 'edu_date_start', path: 'education.start' },
  { section: 'education', id: 'edu_date_end', path: 'education.end' },
  { section: 'education', id: 'edu_type', path: 'education.admissionType', knownOptions: ['全日制统分统招', '海外留学', '成人教育', '定向', '非定向', '委培', '自费', '其他'] },
  { section: 'education', id: 'education_level', path: 'education.degree', knownOptions: ['博士', 'MBA', '硕士', '双学士', '学士', '其他', '无'] },
  { section: 'education', id: 'education_degree', path: 'education.level', dependency: true, knownOptions: ['博士研究生', 'MBA/EMBA', '硕士研究生', '本科', '大专', '中专/中技', '高中', '初中及以下'] },
  { section: 'education', id: 'education_degree_direction', path: 'education.researchDirection' },
  { section: 'education', id: 'college_name', path: 'education.college' },
  { section: 'education', id: 'major_name', path: 'education.major', note: '控件形态【待验证】（已保存记录里是只读文字）' },
  { section: 'education', id: 'grade_rank', path: 'education.rank', knownOptions: ['前5%', '前10%', '前20%', '前30%', '其他'] },
  { section: 'education', id: 'is_oversea', path: 'education.isOverseas', dependency: true, knownOptions: ['有', '无'], note: '由档案推出：非内地院校或学校所在国家不是中国 → 有' },
  { section: 'education', id: 'oversea_experience', path: 'education.overseasYears' },

  // 求职意向（求职意向.html）
  { section: 'intention', id: 'desired_employment_type', manual: '期望工作性质为多选，请本人勾选' },
  { section: 'intention', id: 'desired_city', path: 'intention.cities', kind: 'cascader', note: '多选（最多 3 个），逐个选择后点弹窗的“确定”' },
  { section: 'intention', id: 'desired_salary_minimum', path: 'intention.salaryMin', optionsPartial: true },
  { section: 'intention', id: 'desired_salary_maximum', path: 'intention.salaryMax', optionsPartial: true, note: '可选范围随最低薪资变化' },

  // 实习/工作经历（工作经历.html）
  { section: 'work', id: 'company_name', path: 'work.company' },
  { section: 'work', id: 'job_date_start', path: 'work.start' },
  { section: 'work', id: 'job_date_end', path: 'work.end', note: '档案为“至今”时点日期面板左侧的“至今”' },
  { section: 'work', id: 'job_type', path: 'work.kind', knownOptions: ['全职', '兼职', '实习'] },
  { section: 'work', id: 'salary', path: 'work.salary' },
  { section: 'work', id: 'job_title', path: 'work.title' },
  { section: 'work', id: 'work_description', path: 'work.description' },
  { section: 'work', id: 'is_references', path: 'work.hasReferee', knownOptions: ['是', '否'] },

  // 语言能力（语言能力.html）：网站按语种一条；选了语种后出现证书子表单，证书栏点开是“考试 → 级别”弹窗
  { section: 'languages', id: 'language', path: 'languages.language', dependency: true },
  { section: 'languages', id: 'certificate', path: 'languages.certificate', kind: 'custom-popup' },
  { section: 'languages', label: '证书', path: 'languages.certificate', kind: 'custom-popup' },
  { section: 'languages', label: '证书名称', path: 'languages.certificate', kind: 'custom-popup' },
  { section: 'languages', id: 'language_skill_listen_say', path: 'languages.listenSpeak', knownOptions: ['一般', '良好', '熟练', '精通'] },
  { section: 'languages', id: 'language_skill_read_write', path: 'languages.readWrite', knownOptions: ['一般', '良好', '熟练', '精通'] },

  // 奖励荣誉（奖励荣誉.html）
  { section: 'honors', id: 'awards', path: 'honors.name' },
  { section: 'honors', id: 'award_time', path: 'honors.date' },
  { section: 'honors', id: 'award_office', path: 'honors.issuer' },

  // 专业技能（专业技能.html）：技能类型点开是“大类 → 小类 → 技能”弹窗，按名称查找
  { section: 'skills', id: 'skill_type', path: 'skills.name', kind: 'custom-popup' },
  { section: 'skills', id: 'skill_level', path: 'skills.level', knownOptions: ['一般', '良好', '熟练', '精通'] },

  // 附件
  { section: 'attachments', id: 'work_photo_path', manual: '证件照需本人上传' },
  { section: 'attachments', id: 'attach_path', manual: '简历附件需本人上传' },

  // 其他信息：只插入档案“文字模板”里本人写好的自我评价
  { section: 'other', id: 'self_assessment', path: 'textTemplates.selfAssessment' },
];

const LEVEL_ORDER: Record<string, number> = {
  'junior-high-or-below': 0,
  'secondary-vocational': 1,
  'high-school': 1,
  'junior-college': 2,
  bachelor: 3,
  master: 4,
  doctor: 5,
};

const cmpDate = (a?: unknown, b?: unknown) => String(a ?? '').localeCompare(String(b ?? ''));

export function isZhilianUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname === 'xiaoyuan.zhaopin.com' && u.pathname.startsWith('/scrd/resume')) return true;
    // 测试构建：本地夹具 /zl-like/ 视为智联校园
    if (typeof __TEST__ !== 'undefined' && __TEST__ && (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && u.pathname.startsWith('/zl-like')) return true;
    return false;
  } catch {
    return false;
  }
}

export const zhilianRules: AdapterRules = {
  id: 'zhilian',
  name: '智联校园',
  version: '0.1.0',
  verifiedAt: '2026-11-09（页面片段与本地夹具）',
  matches: isZhilianUrl,
  origins: (url) => {
    const u = new URL(url);
    return [`${u.protocol}//${u.host}/*`];
  },
  allowExecute: true,
  sections: SECTIONS,
  fields: FIELDS,
  notes: [
    '页面一次只显示一个区块：在网页右侧导航切换区块后，点“重新扫描本页”。',
    '个人信息、求职意向等先点“展开编辑表单并扫描”（工具会点网页上的“编辑”）；经历类点“添加并准备”。',
    '填好后请本人核对并点网页上的“保 存”或表单里的“添 加”。工具从不点击保存、添加记录、提交或投递。',
    '现居住城市、户口所在地、高考生源地、期望城市在网站的城市弹窗里按 省 → 市 → 区县 点选；页面要求选到区县而档案只到市时，请在页面上补选。',
    '语言证书、技能类型在网站弹窗里按名称查找，只选名称一致的一项；找不到时列出相近的项。',
    '体重：档案没有固定字段，请在档案“自定义字段”里加“体重(kg)”。',
  ],
  orderRecords<T extends { id: string }>(collection: RecordCollection, records: T[]): T[] {
    let arr = [...records] as Array<T & Record<string, unknown>>;
    if (collection === 'education') {
      arr.sort((a, b) => (LEVEL_ORDER[String(b.level)] ?? 0) - (LEVEL_ORDER[String(a.level)] ?? 0) || cmpDate(b.start, a.start));
    } else if (collection === 'skills') {
      // 网站上的技能类型来自固定字典：能拆成多个名称的（“Python/SQL”）仍按一条填写
      arr = arr.filter((r) => String(r.name ?? '').trim());
    } else if (collection === 'work' || collection === 'honors') {
      arr.sort((a, b) => cmpDate(b.start ?? b.date, a.start ?? a.date));
    } else if (collection === 'languages') {
      // 网站按语种一条：同一语种的多张证书只填一次
      const seen = new Set<string>();
      arr = arr.filter((r) => {
        const k = String(r.language ?? '');
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    return arr;
  },
  recordKeys(collection, record) {
    switch (collection) {
      case 'education':
        return [String(record.school ?? '')].filter(Boolean);
      case 'work':
        return [String(record.company ?? '')].filter(Boolean);
      case 'languages':
        return [String(record.language ?? '')].filter(Boolean);
      case 'honors':
      case 'skills':
        return [String(record.name ?? '')].filter(Boolean);
      default:
        return [];
    }
  },
};
