// 通用语义词典：档案路径 ↔ 中英文同义词。
// 单表单字段的 key 是完整档案路径（basic.ethnicity）；重复区块字段的 key 是“集合.字段”（education.school）。
import type { DictName } from '../normalize/dicts';
import { guessSection } from './sections';
import type { RecordCollection, Sensitivity } from '../profile/types';

export type ValueType =
  | 'text'
  | 'enum'
  | 'date'
  | 'date-or-present'
  | 'period' // 起止（date-range 控件）
  | 'region'
  | 'number'
  | 'years' // 学制
  | 'longtext'
  | 'major-category'
  | 'school'
  | 'has-level' // 是否涉及该段学历
  | 'derived-highest-level'
  | 'derived-highest-region'
  | 'certificate' // 分类弹窗中的证书名
  | 'regions' // 多个地区（期望城市）
  | 'skill' // 技能名称（弹窗按名称查找）
  | 'manual';

export interface PathRule {
  key: string;
  scope: 'single' | RecordCollection;
  synonyms: string[]; // 标签完全相等（规整后）
  keywords?: string[]; // 额外的包含关键词（用于冲突检测，不单独构成高分）
  exclude?: string[]; // 标签含这些词时视为冲突（−50）
  sections?: string[]; // 区块标题关键词
  idHints?: string[]; // id/name 语义
  valueType: ValueType;
  dict?: DictName;
  sensitivity: Sensitivity;
  dependency?: boolean;
  manualNote?: string;
}

const BASIC_SECTIONS = ['基本信息', '个人信息', '基本资料', '个人资料', '基础信息', '报名信息'];
const CONTACT_SECTIONS = [...BASIC_SECTIONS, '联系方式', '联系信息'];
const INTENTION_SECTIONS = ['求职意向', '意向', '求职期望'];
const EDU_SECTIONS = ['教育经历', '教育背景', '学习经历', '教育信息', '学历信息'];
const WORK_SECTIONS = ['工作经历', '工作履历', '实习经历', '工作/实习经历', '实践经历', '工作经验'];
const LANG_SECTIONS = ['英语能力', '语言能力', '外语能力'];
const SKILL_SECTIONS = ['专业技能', '技能', '技能特长', '专业技能与特长'];
const PROJECT_SECTIONS = ['项目经历'];
const HONOR_SECTIONS = ['荣誉奖励', '获奖情况', '奖励', '奖惩'];
const CERT_SECTIONS = ['证书信息', '证书', '资格证书', '职业资格', '执业资格', '职(执)业资格'];
const SELF_SECTIONS = ['自我评价', '自我描述', '个人评价', '自我介绍'];

export const PATH_RULES: PathRule[] = [
  // ---------- 基本信息 ----------
  { key: 'basic.name', scope: 'single', synonyms: ['姓名', '真实姓名', 'Name', '中文姓名'], exclude: ['紧急', '英文', '父', '母', '联系人'], sections: BASIC_SECTIONS, idHints: ['name', 'fullname', 'full_name', 'realname'], valueType: 'text', sensitivity: 'medium' },
  { key: 'basic.nameEn', scope: 'single', synonyms: ['英文名', '英文姓名', 'EnglishName'], sections: BASIC_SECTIONS, idHints: ['englishname', 'name_en'], valueType: 'text', sensitivity: 'medium' },
  { key: 'basic.gender', scope: 'single', synonyms: ['性别', 'Gender', 'Sex'], sections: BASIC_SECTIONS, idHints: ['gender', 'sex'], valueType: 'enum', dict: 'gender', sensitivity: 'medium' },
  { key: 'basic.birthDate', scope: 'single', synonyms: ['出生日期', '出生年月', '生日', '出生年月日', 'Birthday', 'DateofBirth'], sections: BASIC_SECTIONS, idHints: ['birthdate', 'birthday', 'birth'], valueType: 'date', sensitivity: 'medium' },
  // 证件类型只选类型（身份证/护照…），证件号码始终由本人填写
  { key: 'basic.idType', scope: 'single', synonyms: ['证件类型', '证件号码类型'], sections: BASIC_SECTIONS, idHints: ['identified_type', 'idtype', 'cardtype', 'id_card_type'], valueType: 'enum', dict: 'idType', sensitivity: 'high' },
  { key: 'basic.idNumber', scope: 'single', synonyms: ['证件号码', '证件号', '身份证号', '身份证号码', '身份证'], sections: BASIC_SECTIONS, idHints: ['identified_number', 'idnumber', 'idcard'], valueType: 'manual', manualNote: '证件号由本人填写', sensitivity: 'high' },
  { key: 'basic.nationality', scope: 'single', synonyms: ['国籍', 'Nationality'], sections: BASIC_SECTIONS, idHints: ['country', 'nationality'], valueType: 'enum', dict: 'nationality', sensitivity: 'low' },
  { key: 'basic.ethnicity', scope: 'single', synonyms: ['民族'], sections: BASIC_SECTIONS, idHints: ['nation', 'ethnicity', 'ethnic'], valueType: 'enum', dict: 'ethnicity', sensitivity: 'medium' },
  { key: 'basic.politicalStatus', scope: 'single', synonyms: ['政治面貌'], sections: BASIC_SECTIONS, idHints: ['political', 'politics'], valueType: 'enum', dict: 'politicalStatus', sensitivity: 'high' },
  { key: 'basic.partyJoinDate', scope: 'single', synonyms: ['入党时间', '入党日期'], sections: BASIC_SECTIONS, valueType: 'date', sensitivity: 'high' },
  { key: 'basic.maritalStatus', scope: 'single', synonyms: ['婚姻状况', '婚姻状态', '婚否'], sections: BASIC_SECTIONS, idHints: ['marriage', 'marital'], valueType: 'enum', dict: 'marital', sensitivity: 'high' },
  { key: 'basic.healthStatus', scope: 'single', synonyms: ['健康状况', '身体状况'], sections: BASIC_SECTIONS, idHints: ['health'], valueType: 'text', sensitivity: 'high' },
  { key: 'basic.heightCm', scope: 'single', synonyms: ['身高', '身高(cm)', '身高(厘米)'], sections: BASIC_SECTIONS, idHints: ['height'], valueType: 'number', sensitivity: 'medium' },
  { key: 'basic.nativePlace', scope: 'single', synonyms: ['籍贯'], keywords: ['籍贯'], sections: BASIC_SECTIONS, idHints: ['family_home', 'nativeplace', 'native_place', 'jiguan'], valueType: 'region', sensitivity: 'medium' },
  { key: 'basic.studentOrigin', scope: 'single', synonyms: ['生源地', '生源所在地'], keywords: ['生源'], sections: BASIC_SECTIONS, idHints: ['student_origin', 'origin'], valueType: 'region', sensitivity: 'medium' },
  { key: 'basic.hukou', scope: 'single', synonyms: ['户口所在地', '户籍所在地', '户籍地', '户口所在城市', '户籍'], keywords: ['户口', '户籍'], exclude: ['性质', '现'], sections: BASIC_SECTIONS, idHints: ['hukou', 'household', 'domicile'], valueType: 'region', sensitivity: 'high' },
  { key: 'basic.hukouType', scope: 'single', synonyms: ['户口性质', '户籍性质', '户口类型'], sections: BASIC_SECTIONS, valueType: 'enum', sensitivity: 'high' },
  { key: 'basic.currentResidence', scope: 'single', synonyms: ['现居住地', '现居地', '现住址', '现居住城市', '目前所在地', '现居住地址', '现所在地', '所在城市'], keywords: ['现居', '现住'], exclude: ['户口', '户籍'], sections: BASIC_SECTIONS, idHints: ['location', 'residence', 'current_city'], valueType: 'region', sensitivity: 'medium' },
  { key: 'basic.photo', scope: 'single', synonyms: ['上传照片', '照片', '证件照', '个人照片', '头像'], sections: BASIC_SECTIONS, idHints: ['avatar', 'photo'], valueType: 'manual', manualNote: '照片需本人选择文件上传', sensitivity: 'medium' },

  // ---------- 联系方式 ----------
  { key: 'contact.mobile', scope: 'single', synonyms: ['手机号', '手机号码', '手机', '联系电话', '移动电话'], exclude: ['紧急', '父', '母'], sections: CONTACT_SECTIONS, idHints: ['telephone', 'mobile', 'phone'], valueType: 'text', sensitivity: 'high' },
  { key: 'contact.email', scope: 'single', synonyms: ['邮箱', '电子邮箱', '邮箱地址', '电子邮件', '联系邮箱', '电子信箱', '个人邮箱', 'Email', 'E-mail'], sections: CONTACT_SECTIONS, idHints: ['email', 'mail'], valueType: 'text', sensitivity: 'medium' },
  { key: 'contact.address', scope: 'single', synonyms: ['通讯地址', '详细地址', '联系地址', '家庭住址', '家庭地址'], sections: CONTACT_SECTIONS, idHints: ['address'], valueType: 'text', sensitivity: 'high' },
  { key: 'contact.postalCode', scope: 'single', synonyms: ['邮编', '邮政编码'], sections: CONTACT_SECTIONS, idHints: ['postcode', 'zipcode', 'postal'], valueType: 'text', sensitivity: 'medium' },
  { key: 'contact.emergencyContact.name', scope: 'single', synonyms: ['紧急联系人', '紧急联系人姓名'], sections: CONTACT_SECTIONS, idHints: ['contact_name', 'emergency_name'], valueType: 'text', sensitivity: 'high' },
  { key: 'contact.emergencyContact.relation', scope: 'single', synonyms: ['紧急联系人关系', '与紧急联系人关系', '与本人关系'], sections: CONTACT_SECTIONS, valueType: 'text', sensitivity: 'high' },
  { key: 'contact.emergencyContact.mobile', scope: 'single', synonyms: ['紧急联系人电话', '紧急联系人手机', '紧急联系电话', '紧急联系人手机号'], sections: CONTACT_SECTIONS, idHints: ['contact_telephone', 'emergency_phone'], valueType: 'text', sensitivity: 'high' },

  // ---------- 求职意向 ----------
  { key: 'intention.salaryMin', scope: 'single', synonyms: ['最低薪资', '最低薪资(元/月)', '期望薪资下限', '最低期望薪资'], sections: INTENTION_SECTIONS, idHints: ['salary_min', 'minsalary'], valueType: 'number', sensitivity: 'low' },
  { key: 'intention.salaryMax', scope: 'single', synonyms: ['最高薪资', '最高薪资(元/月)', '期望薪资上限', '最高期望薪资'], sections: INTENTION_SECTIONS, idHints: ['salary_max', 'maxsalary'], valueType: 'number', sensitivity: 'low' },
  { key: 'intention.acceptJobAdjustment', scope: 'single', synonyms: ['是否接受岗位调剂', '是否服从岗位调剂', '服从岗位调剂', '接受岗位调剂'], sections: INTENTION_SECTIONS, valueType: 'enum', dict: 'triState', sensitivity: 'low' },
  { key: 'intention.acceptEmployerAdjustment', scope: 'single', synonyms: ['是否接受单位调剂', '是否服从单位调剂', '服从单位调剂', '接受单位调剂'], sections: INTENTION_SECTIONS, valueType: 'enum', dict: 'triState', sensitivity: 'low' },
  { key: 'intention.earliestStartDate', scope: 'single', synonyms: ['最早到岗时间', '最早可参加实习时间', '可到岗时间', '最早到岗日期', '到岗时间'], sections: [...INTENTION_SECTIONS, ...BASIC_SECTIONS], valueType: 'date', sensitivity: 'low' },
  { key: 'intention.cities', scope: 'single', synonyms: ['期望工作城市', '意向城市', '期望城市', '意向工作城市'], sections: INTENTION_SECTIONS, valueType: 'regions', manualNote: '期望城市弹窗暂不支持，请手动选择', sensitivity: 'low' },

  // ---------- 派生值 ----------
  { key: 'derived.highestLevel', scope: 'single', synonyms: ['最高学历', '全日制最高学历', '最高学历(全日制)'], sections: BASIC_SECTIONS, valueType: 'derived-highest-level', dict: 'educationLevel', sensitivity: 'low' },
  { key: 'derived.highestSchoolRegion', scope: 'single', synonyms: ['最高学历毕业院校所属地区', '毕业院校所在地', '毕业院校所在地区'], sections: BASIC_SECTIONS, valueType: 'derived-highest-region', sensitivity: 'low' },

  // ---------- 教育经历 ----------
  { key: 'education.level', scope: 'education', synonyms: ['学历', '学历层次', '学历类别'], keywords: ['学历'], exclude: ['最高', '是否涉及'], sections: EDU_SECTIONS, idHints: ['education', 'edu_level', 'degree_level'], valueType: 'enum', dict: 'educationLevel', sensitivity: 'low', dependency: true },
  { key: 'education.degree', scope: 'education', synonyms: ['学位'], keywords: ['学位'], exclude: ['双学位'], sections: EDU_SECTIONS, idHints: ['degree'], valueType: 'enum', dict: 'degree', sensitivity: 'low' },
  { key: 'education.hasLevel', scope: 'education', synonyms: ['是否涉及该段学历'], sections: EDU_SECTIONS, idHints: ['skip_edu'], valueType: 'has-level', sensitivity: 'low', dependency: true },
  { key: 'education.school', scope: 'education', synonyms: ['学校名称', '学校', '毕业院校', '院校名称', '就读院校', '院校', 'School'], exclude: ['本科院校', '高中', '所属地区', '所在地'], sections: EDU_SECTIONS, idHints: ['school', 'school_cn', 'college_name'], valueType: 'school', sensitivity: 'low' },
  { key: 'education.college', scope: 'education', synonyms: ['院系', '学院', '所在院系', '所在学院'], sections: EDU_SECTIONS, idHints: ['department', 'faculty'], valueType: 'text', sensitivity: 'low' },
  { key: 'education.majorCategory', scope: 'education', synonyms: ['专业分类', '专业类别', '学科门类', '专业类'], sections: EDU_SECTIONS, idHints: ['major_category'], valueType: 'major-category', sensitivity: 'low' },
  { key: 'education.major', scope: 'education', synonyms: ['专业名称', '专业', '所学专业'], exclude: ['分类', '类别', '排名', '门类'], sections: EDU_SECTIONS, idHints: ['major', 'major_cn'], valueType: 'text', sensitivity: 'low' },
  { key: 'education.researchDirection', scope: 'education', synonyms: ['研究方向'], sections: EDU_SECTIONS, idHints: ['research'], valueType: 'text', sensitivity: 'low' },
  { key: 'education.period', scope: 'education', synonyms: ['就读年月', '就读时间', '在校时间', '起止时间', '学习时间'], sections: EDU_SECTIONS, idHints: ['period'], valueType: 'period', sensitivity: 'low' },
  { key: 'education.start', scope: 'education', synonyms: ['入学时间', '入学日期', '入学年月', '开始时间'], keywords: ['入学'], sections: EDU_SECTIONS, idHints: ['start', 'begin'], valueType: 'date', sensitivity: 'low' },
  { key: 'education.end', scope: 'education', synonyms: ['毕业时间', '毕业日期', '毕业年月', '结束时间'], keywords: ['毕业时间', '毕业日期', '毕业年月'], sections: EDU_SECTIONS, idHints: ['end', 'graduate'], valueType: 'date-or-present', sensitivity: 'low' },
  { key: 'education.studyMode', scope: 'education', synonyms: ['全日制', '学习形式', '学习方式', '是否全日制'], sections: EDU_SECTIONS, idHints: ['is_fulltime', 'fulltime'], valueType: 'enum', dict: 'studyMode', sensitivity: 'low' },
  { key: 'education.admissionType', scope: 'education', synonyms: ['统招', '是否统招', '招生类型', '招生方式'], sections: EDU_SECTIONS, valueType: 'enum', dict: 'admission', sensitivity: 'low' },
  { key: 'education.durationYears', scope: 'education', synonyms: ['学制'], sections: EDU_SECTIONS, idHints: ['school_system'], valueType: 'years', sensitivity: 'low' },
  { key: 'education.isTransferFromJuniorCollege', scope: 'education', synonyms: ['是否专升本'], sections: EDU_SECTIONS, valueType: 'enum', dict: 'triState', sensitivity: 'low' },
  { key: 'education.hasDoubleDegree', scope: 'education', synonyms: ['是否有双学位', '是否双学位'], sections: EDU_SECTIONS, valueType: 'enum', dict: 'triState', sensitivity: 'low' },
  { key: 'education.gpa', scope: 'education', synonyms: ['成绩(GPA)', 'GPA', '绩点', '平均学分绩点', '平均绩点'], sections: EDU_SECTIONS, idHints: ['gpa', 'gpa_score'], valueType: 'text', sensitivity: 'low' },
  { key: 'education.rank', scope: 'education', synonyms: ['专业排名', '成绩排名', '排名'], sections: EDU_SECTIONS, idHints: ['rank'], valueType: 'text', sensitivity: 'low' },
  { key: 'education.isOverseas', scope: 'education', synonyms: ['是否有海外学习经历', '是否海外学习经历', '是否有海外留学经历', '海外学习经历'], sections: EDU_SECTIONS, idHints: ['is_oversea'], valueType: 'enum', dict: 'triState', sensitivity: 'low' },
  { key: 'education.overseasYears', scope: 'education', synonyms: ['海外学习经历年限', '海外学习年限', '留学年限'], sections: EDU_SECTIONS, idHints: ['oversea_experience'], valueType: 'years', sensitivity: 'low' },
  { key: 'education.isStudentCadre', scope: 'education', synonyms: ['是否是学生干部', '是否学生干部', '是否担任学生干部'], sections: EDU_SECTIONS, valueType: 'enum', dict: 'triState', sensitivity: 'low' },
  { key: 'education.trainingMode', scope: 'education', synonyms: ['培养方式'], sections: EDU_SECTIONS, valueType: 'text', sensitivity: 'low' },
  { key: 'education.schoolExperience', scope: 'education', synonyms: ['在校经历', '在校情况'], sections: EDU_SECTIONS, idHints: ['experience'], valueType: 'longtext', sensitivity: 'low' },

  // ---------- 工作/实习 ----------
  { key: 'work.company', scope: 'work', synonyms: ['单位名称', '公司名称', '工作单位', '实习单位', '企业名称'], exclude: ['性质'], sections: WORK_SECTIONS, idHints: ['company_name', 'company'], valueType: 'text', sensitivity: 'low' },
  { key: 'work.companyNature', scope: 'work', synonyms: ['单位性质', '公司性质', '企业性质'], sections: WORK_SECTIONS, idHints: ['company_nature'], valueType: 'enum', sensitivity: 'low' },
  { key: 'work.department', scope: 'work', synonyms: ['部门', '所在部门'], sections: WORK_SECTIONS, idHints: ['department'], valueType: 'text', sensitivity: 'low' },
  { key: 'work.title', scope: 'work', synonyms: ['职位名称', '职位', '岗位', '岗位名称', '职务'], sections: WORK_SECTIONS, idHints: ['job_name', 'position', 'title'], valueType: 'text', sensitivity: 'low' },
  { key: 'work.kind', scope: 'work', synonyms: ['工作性质', '工作类型', '经历类型'], sections: WORK_SECTIONS, idHints: ['employee_type'], valueType: 'enum', dict: 'workKind', sensitivity: 'low' },
  { key: 'work.period', scope: 'work', synonyms: ['在职时间', '工作时间', '起止时间', '实习时间'], sections: WORK_SECTIONS, valueType: 'period', sensitivity: 'low' },
  { key: 'work.start', scope: 'work', synonyms: ['开始时间', '入职时间', '起始时间'], keywords: ['入职'], sections: WORK_SECTIONS, idHints: ['period_start', 'start'], valueType: 'date', sensitivity: 'low' },
  { key: 'work.end', scope: 'work', synonyms: ['结束时间', '离职时间', '截止时间'], keywords: ['离职'], sections: WORK_SECTIONS, idHints: ['period_end', 'end'], valueType: 'date-or-present', sensitivity: 'low' },
  { key: 'work.description', scope: 'work', synonyms: ['工作内容', '工作描述', '职责描述', '工作职责'], sections: WORK_SECTIONS, idHints: ['introduction', 'description'], valueType: 'longtext', sensitivity: 'low' },
  { key: 'work.location', scope: 'work', synonyms: ['工作地区', '工作地点', '工作城市'], sections: WORK_SECTIONS, idHints: ['location'], valueType: 'region', sensitivity: 'low' },
  { key: 'work.salary', scope: 'work', synonyms: ['职位月薪(税前)', '职位月薪', '月薪(税前)', '税前月薪', '实习月薪'], sections: WORK_SECTIONS, idHints: ['salary'], valueType: 'number', sensitivity: 'medium' },
  { key: 'work.hasReferee', scope: 'work', synonyms: ['是否有证明人', '有无证明人', '是否有工作证明人'], sections: WORK_SECTIONS, idHints: ['is_references'], valueType: 'enum', dict: 'triState', sensitivity: 'low' },
  { key: 'work.note', scope: 'work', synonyms: ['补充说明', '备注'], sections: WORK_SECTIONS, idHints: ['other_description'], valueType: 'text', sensitivity: 'low' },

  // ---------- 语言 ----------
  { key: 'languages.certificate', scope: 'languages', synonyms: ['证书名称', '语言证书', '外语证书', '英语证书'], sections: LANG_SECTIONS, valueType: 'enum', dict: 'languageCert', sensitivity: 'low' },
  { key: 'languages.score', scope: 'languages', synonyms: ['成绩', '分数', '考试成绩'], sections: LANG_SECTIONS, valueType: 'text', sensitivity: 'low' },
  { key: 'languages.language', scope: 'languages', synonyms: ['语种', '语言'], sections: LANG_SECTIONS, valueType: 'text', sensitivity: 'low' },
  { key: 'languages.listenSpeak', scope: 'languages', synonyms: ['听说能力', '听说水平'], sections: LANG_SECTIONS, idHints: ['listen_say'], valueType: 'enum', dict: 'skillLevel', sensitivity: 'low' },
  { key: 'languages.readWrite', scope: 'languages', synonyms: ['读写能力', '读写水平'], sections: LANG_SECTIONS, idHints: ['read_write'], valueType: 'enum', dict: 'skillLevel', sensitivity: 'low' },
  { key: 'languages.date', scope: 'languages', synonyms: ['获得时间', '考试时间', '获证时间'], sections: LANG_SECTIONS, valueType: 'date', sensitivity: 'low' },

  // ---------- 专业技能 ----------
  { key: 'skills.name', scope: 'skills', synonyms: ['技能类型', '技能名称', '技能'], sections: SKILL_SECTIONS, idHints: ['skill_type', 'skill_name'], valueType: 'skill', sensitivity: 'low' },
  { key: 'skills.level', scope: 'skills', synonyms: ['技能掌握程度', '掌握程度', '熟练程度'], sections: SKILL_SECTIONS, idHints: ['skill_level'], valueType: 'enum', dict: 'skillLevel', sensitivity: 'low' },

  // ---------- 项目、荣誉（国聘为 P1，通用扫描仍可识别） ----------
  { key: 'projects.name', scope: 'projects', synonyms: ['项目名称'], sections: PROJECT_SECTIONS, valueType: 'text', sensitivity: 'low' },
  { key: 'projects.role', scope: 'projects', synonyms: ['项目角色', '担任角色', '项目职务'], sections: PROJECT_SECTIONS, valueType: 'text', sensitivity: 'low' },
  { key: 'projects.organization', scope: 'projects', synonyms: ['所在单位', '项目单位'], sections: PROJECT_SECTIONS, valueType: 'text', sensitivity: 'low' },
  { key: 'projects.start', scope: 'projects', synonyms: ['开始时间', '项目开始时间'], sections: PROJECT_SECTIONS, valueType: 'date', sensitivity: 'low' },
  { key: 'projects.end', scope: 'projects', synonyms: ['结束时间', '项目结束时间'], sections: PROJECT_SECTIONS, valueType: 'date-or-present', sensitivity: 'low' },
  { key: 'projects.period', scope: 'projects', synonyms: ['起止时间', '项目时间'], sections: PROJECT_SECTIONS, valueType: 'period', sensitivity: 'low' },
  { key: 'projects.introduction', scope: 'projects', synonyms: ['项目介绍', '项目描述'], sections: PROJECT_SECTIONS, valueType: 'longtext', sensitivity: 'low' },
  { key: 'projects.duty', scope: 'projects', synonyms: ['项目职责', '本人职责'], sections: PROJECT_SECTIONS, valueType: 'longtext', sensitivity: 'low' },
  { key: 'projects.achievement', scope: 'projects', synonyms: ['项目成果', '项目业绩'], sections: PROJECT_SECTIONS, valueType: 'longtext', sensitivity: 'low' },
  { key: 'honors.name', scope: 'honors', synonyms: ['奖励名称', '荣誉名称', '奖项名称'], sections: HONOR_SECTIONS, valueType: 'text', sensitivity: 'low' },
  { key: 'honors.date', scope: 'honors', synonyms: ['获得时间', '获奖时间'], sections: HONOR_SECTIONS, idHints: ['issued_on'], valueType: 'date', sensitivity: 'low' },
  { key: 'honors.level', scope: 'honors', synonyms: ['奖励级别', '获奖级别'], sections: HONOR_SECTIONS, valueType: 'enum', dict: 'honorLevel', sensitivity: 'low' },
  { key: 'honors.grade', scope: 'honors', synonyms: ['获奖等级', '奖励等级'], sections: HONOR_SECTIONS, valueType: 'enum', dict: 'honorGrade', sensitivity: 'low' },
  { key: 'honors.issuer', scope: 'honors', synonyms: ['颁发机构', '颁奖单位'], sections: HONOR_SECTIONS, idHints: ['authority'], valueType: 'text', sensitivity: 'low' },
  { key: 'honors.description', scope: 'honors', synonyms: ['描述', '奖励描述', '获奖描述', '荣誉描述'], sections: HONOR_SECTIONS, idHints: ['description'], valueType: 'longtext', sensitivity: 'low' },
  { key: 'certificates.name', scope: 'certificates', synonyms: ['证书名称', '证书', '资格证书名称'], sections: CERT_SECTIONS, valueType: 'certificate', sensitivity: 'low' },

  // ---------- 文字模板（只原样插入本人写好的文字，不生成） ----------
  { key: 'textTemplates.selfAssessment', scope: 'single', synonyms: ['自我评价', '自我描述', '个人评价', '自我介绍', '个人简介'], sections: SELF_SECTIONS, idHints: ['assessment', 'self_evaluation', 'selfassessment'], valueType: 'longtext', sensitivity: 'low' },
];

export const RULES_BY_KEY: Record<string, PathRule> = Object.fromEntries(PATH_RULES.map((r) => [r.key, r]));

/** 通用区块识别：区块标题 → 集合。 */
/** 区块标题 → 作用域。需本人完成的区块（家庭成员等）按单项处理，由适配器的 manual 模式拦住。 */
export function guessCollection(sectionTitle: string | undefined): PathRule['scope'] {
  const g = guessSection(sectionTitle).collection;
  return g === 'manual' ? 'single' : g;
}
