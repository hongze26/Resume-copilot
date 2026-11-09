// 国聘（c.iguopin.com）申请简历页适配器 —— 规则部分。
// 依据：第二阶段方案 1.3 节与 basic-info 材料。标注【待验证】的项需用诊断报告确认。
import type { AdapterRules, FieldRule, SectionRule } from '../types';
import type { RecordCollection } from '../../core/profile/types';

declare const __TEST__: boolean;

const SECTIONS: SectionRule[] = [
  { key: 'basic', titles: ['基本信息'], mode: 'single', collection: 'single' },
  { key: 'education', titles: ['教育经历'], mode: 'repeat', collection: 'education' },
  { key: 'languages', titles: ['英语能力'], mode: 'repeat', collection: 'languages' },
  { key: 'intention', titles: ['求职意向'], mode: 'single', collection: 'single' },
  { key: 'work', titles: ['工作/实习经历', '工作经历', '实习经历'], mode: 'repeat', collection: 'work' },
  { key: 'projects', titles: ['项目经历'], mode: 'repeat', collection: 'projects' },
  { key: 'honors', titles: ['荣誉奖励'], mode: 'repeat', collection: 'honors' },
  { key: 'certificates', titles: ['证书信息'], mode: 'repeat', collection: 'certificates' },
  { key: 'selfAssessment', titles: ['自我评价'], mode: 'single', collection: 'single' },
  { key: 'attachments', titles: ['附件'], mode: 'manual', manualNote: '附件需本人选择文件上传' },
  { key: 'other', titles: ['其他说明'], mode: 'manual', manualNote: '声明与手机签名必须由本人完成' },
];

const YES_NO = ['是', '否'];

const FIELDS: FieldRule[] = [
  // 基本信息
  { section: 'basic', id: 'avatar', manual: '照片需本人上传：一寸证件照，jpg/jpeg/gif/bmp/png' },
  { section: 'basic', id: 'full_name', locked: true, note: '实名信息，网站已锁定' },
  { section: 'basic', id: 'gender', locked: true, note: '实名信息，网站已锁定' },
  { section: 'basic', id: 'birthdate', locked: true, note: '实名信息，网站已锁定' },
  { section: 'basic', id: 'telephone', locked: true, note: '实名手机号，网站已锁定' },
  { section: 'basic', id: 'identified_type', locked: true, note: '实名信息，网站已锁定' },
  { section: 'basic', id: 'identified_number', locked: true, note: '证件号，网站已锁定，工具不处理' },
  { section: 'basic', id: 'email', path: 'contact.email' },
  { section: 'basic', id: 'country', path: 'basic.nationality', note: '选项【待验证】' },
  { section: 'basic', id: 'location', path: 'basic.currentResidence', kind: 'cascader' },
  { section: 'basic', id: 'hukou', path: 'basic.hukou', kind: 'cascader' },
  { section: 'basic', id: 'family_home', path: 'basic.nativePlace', kind: 'cascader' },
  { section: 'basic', id: 'nation', path: 'basic.ethnicity' },
  { section: 'basic', id: 'political', path: 'basic.politicalStatus', note: '选项【待验证】' },
  { section: 'basic', id: 'marriage', path: 'basic.maritalStatus' },
  { section: 'basic', label: '最高学历毕业院校所属地区', path: 'derived.highestSchoolRegion' },
  { section: 'basic', label: '最早可参加实习时间', path: 'intention.earliestStartDate' },
  { section: 'basic', id: 'contact_name', path: 'contact.emergencyContact.name' },
  { section: 'basic', id: 'contact_telephone', path: 'contact.emergencyContact.mobile' },

  // 教育经历
  { section: 'education', id: 'education', path: 'education.level', dependency: true, knownOptions: ['博士', '硕士', '本科', '专科', '高中', '中专/中技', '初中及以下'] },
  { section: 'education', id: 'skip_edu', path: 'education.hasLevel', dependency: true },
  { section: 'education', label: '是否专升本', path: 'education.isTransferFromJuniorCollege', knownOptions: YES_NO },
  { section: 'education', label: '是否有双学位', path: 'education.hasDoubleDegree', knownOptions: YES_NO },
  { section: 'education', label: '研究方向', path: 'education.researchDirection' },
  { section: 'education', label: '统招', path: 'education.admissionType', knownOptions: ['统招', '非统招', '非内地院校'] },
  { section: 'education', id: 'is_fulltime', path: 'education.studyMode' },
  { section: 'education', id: 'period', path: 'education.period' },
  { section: 'education', id: 'school', path: 'education.school', kind: 'remote-select', note: '远程搜索【待验证】' },
  { section: 'education', label: '学校名称', path: 'education.school', kind: 'remote-select' },
  { section: 'education', id: 'major_category', path: 'education.majorCategory' },
  { section: 'education', id: 'major', path: 'education.major', note: '依赖专业分类【推断】' },
  { section: 'education', label: '专业名称', path: 'education.major' },
  { section: 'education', id: 'gpa_score', path: 'education.gpa' },
  { section: 'education', id: 'school_system', path: 'education.durationYears' },
  { section: 'education', label: '是否是学生干部', path: 'education.isStudentCadre', knownOptions: YES_NO },
  { section: 'education', id: 'experience', path: 'education.schoolExperience' },

  // 工作/实习
  { section: 'work', id: 'company_name', path: 'work.company' },
  { section: 'work', id: 'company_nature', path: 'work.companyNature', optionsPartial: true },
  { section: 'work', id: 'job_name', path: 'work.title' },
  { section: 'work', id: 'employee_type', path: 'work.kind', knownOptions: ['全职', '兼职', '实习'] },
  { section: 'work', id: 'period_start', path: 'work.start' },
  { section: 'work', id: 'period_end_input', path: 'work.end' },
  { section: 'work', id: 'period_end_picker', path: 'work.end' },
  { section: 'work', id: 'introduction', path: 'work.description' },
  { section: 'work', id: 'location', path: 'work.location', kind: 'cascader' },
  { section: 'work', id: 'other_description', path: 'work.note' },

  // 英语能力
  { section: 'projects', id: 'project_name', path: 'projects.name' },
  { section: 'projects', id: 'role', path: 'projects.role' },
  { section: 'projects', id: 'company_name', path: 'projects.organization' },
  { section: 'projects', id: 'teams_scale', manual: '团队规模为人数区间，请按档案人数手动选择' },
  { section: 'projects', id: 'period_start', path: 'projects.start' },
  { section: 'projects', id: 'period_end', path: 'projects.end' },
  { section: 'projects', id: 'period_end_input', path: 'projects.end' },
  { section: 'projects', id: 'period_end_picker', path: 'projects.end' },
  { section: 'projects', id: 'introduction', path: 'projects.introduction' },
  { section: 'projects', id: 'duty', path: 'projects.duty' },
  { section: 'projects', id: 'achievement', path: 'projects.achievement' },

  // 荣誉奖励（basic-info/荣誉奖励.html）
  { section: 'honors', id: 'name', path: 'honors.name' },
  { section: 'honors', id: 'issued_on', path: 'honors.date' },
  { section: 'honors', id: 'level', path: 'honors.level', knownOptions: ['国际级', '国家级', '省部级', '地市级', '企业级', '学校级', '院系级', '其他'] },
  { section: 'honors', id: 'grade', path: 'honors.grade', knownOptions: ['特等奖', '一等奖', '二等奖', '三等奖', '其他'] },
  { section: 'honors', id: 'authority', path: 'honors.issuer' },
  { section: 'honors', id: 'description', path: 'honors.description' },

  // 证书信息（basic-info/证书信息/*.html）：只有“证书名称”，点开是“左侧分类、右侧证书项”的弹窗
  { section: 'certificates', id: 'name', path: 'certificates.name' },
  { section: 'certificates', label: '证书名称', path: 'certificates.name' },

  // 自我评价：只插入档案“文字模板”里本人写好的自我评价，不生成文字
  { section: 'selfAssessment', id: 'assessment', path: 'textTemplates.selfAssessment' },
  { section: 'selfAssessment', label: '自我评价', path: 'textTemplates.selfAssessment' },

  { section: 'languages', label: '证书名称', path: 'languages.certificate', optionsPartial: true },
  { section: 'languages', label: '成绩', path: 'languages.score' },

  // 求职意向
  { section: 'intention', label: '期望工作城市', manual: '期望城市弹窗将在下一版本（P1）支持，请手动选择' },
  { section: 'intention', label: '最低薪资(元/月)', path: 'intention.salaryMin' },
  { section: 'intention', label: '最高薪资(元/月)', path: 'intention.salaryMax' },
  { section: 'intention', label: '是否接受岗位调剂', path: 'intention.acceptJobAdjustment' },
  { section: 'intention', label: '是否接受单位调剂', path: 'intention.acceptEmployerAdjustment' },
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

function cmpDate(a?: unknown, b?: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''));
}

export function isIguopinUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // 国聘的申请简历页不止 c.iguopin.com（职位申请流程会跳到其他子域名）；页面上找不到区块时侧边栏会改用通用识别
    if (u.hostname === 'iguopin.com' || u.hostname.endsWith('.iguopin.com')) return true;
    // 测试构建：本地夹具 /gp-like/ 视为国聘页面
    if (typeof __TEST__ !== 'undefined' && __TEST__ && (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && u.pathname.startsWith('/gp-like')) return true;
    return false;
  } catch {
    return false;
  }
}

export const iguopinRules: AdapterRules = {
  id: 'iguopin',
  name: '国聘',
  version: '0.1.0',
  verifiedAt: '2026-11-08（材料与本地夹具）',
  matches: isIguopinUrl,
  origins: (url) => {
    const u = new URL(url);
    return [`${u.protocol}//${u.host}/*`];
  },
  allowExecute: true,
  sections: SECTIONS,
  fields: FIELDS,
  notes: [
    '姓名、性别、出生日期、手机号、证件类型、证件号由网站实名锁定，工具不写入。',
    '每个经历区块填好后，请本人核对并点击页面上的“保存”。工具从不点击保存、提交或投递。',
    '网站可能自动保存你填写的内容。写入目标：c.iguopin.com。',
    '期望城市、团队规模、附件、其他说明请手动完成；自我评价只插入档案“文字模板”里你写好的内容。',
    '证书只填档案中“已取得”的；在证书弹窗里只选名称一致的一项，找不到时列出相近证书由你确认。',
  ],
  orderRecords<T extends { id: string }>(collection: RecordCollection, records: T[]): T[] {
    const arr = [...records] as Array<T & Record<string, unknown>>;
    if (collection === 'education') {
      // 按学历从低到高，同层级按开始时间升序
      arr.sort((a, b) => (LEVEL_ORDER[String(a.level)] ?? 0) - (LEVEL_ORDER[String(b.level)] ?? 0) || cmpDate(a.start, b.start));
    } else if (collection === 'work' || collection === 'projects' || collection === 'honors') {
      // 最近的在前
      arr.sort((a, b) => cmpDate(b.start ?? b.date, a.start ?? a.date));
    } else if (collection === 'certificates') {
      // 已取得的在前；部分通过/在考的排后面（默认不填）
      arr.sort((a, b) => Number(a.status !== 'obtained') - Number(b.status !== 'obtained'));
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
        return [String(record.certificate ?? '')].filter(Boolean);
      case 'projects':
      case 'honors':
      case 'certificates':
        return [String(record.name ?? '')].filter(Boolean);
      default:
        return [];
    }
  },
};
