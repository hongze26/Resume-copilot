// 档案管理页的表单定义（中文标签）。与 Schema 字段一一对应。
import { ETHNIC_GROUPS } from '../../core/normalize/dicts';

export type FieldType = 'text' | 'textarea' | 'date' | 'dateOrPresent' | 'enum' | 'number' | 'region' | 'list' | 'regionList' | 'tri';

export interface FieldSpec {
  key: string; // 相对路径（点分）
  label: string;
  type: FieldType;
  options?: Array<[string, string]>; // [值, 中文]
  hint?: string;
  required?: boolean;
  sensitive?: boolean;
  step?: number;
  datalist?: string[];
}

export interface SectionSpec {
  key: string; // 顶层路径
  title: string;
  kind: 'object' | 'array';
  idPrefix?: string;
  itemTitle?: (r: Record<string, unknown>) => string;
  fields: FieldSpec[];
  hint?: string;
}

const TRI: Array<[string, string]> = [
  ['yes', '是'],
  ['no', '否'],
  ['unset', '未填写'],
];

export const EDU_LEVELS: Array<[string, string]> = [
  ['doctor', '博士'],
  ['master', '硕士'],
  ['bachelor', '本科'],
  ['junior-college', '专科'],
  ['high-school', '高中'],
  ['secondary-vocational', '中专/中技'],
  ['junior-high-or-below', '初中及以下'],
];

const POLITICAL: Array<[string, string]> = [
  ['cpc-member', '中共党员'],
  ['cpc-probationary', '中共预备党员'],
  ['cyl-member', '共青团员'],
  ['democratic-party', '民主党派'],
  ['non-party', '无党派人士'],
  ['masses', '群众'],
  ['other', '其他'],
];

const DATE_HINT = '建议写到哪一天，如 2024-09-01；只记得月份也可以写 2024-09，网页要求到日时按 1 日填，填完请核对';

export const SECTIONS: SectionSpec[] = [
  {
    key: 'basic',
    title: '基本信息',
    kind: 'object',
    fields: [
      { key: 'name', label: '姓名', type: 'text', required: true },
      { key: 'nameEn', label: '英文名', type: 'text' },
      { key: 'gender', label: '性别', type: 'enum', options: [['male', '男'], ['female', '女']] },
      { key: 'birthDate', label: '出生日期', type: 'date', hint: DATE_HINT },
      { key: 'idType', label: '证件类型', type: 'enum', sensitive: true, options: [['resident-id', '居民身份证'], ['passport', '护照'], ['hk-macau-pass', '港澳通行证'], ['taiwan-pass', '台湾通行证'], ['other', '其他']] },
      { key: 'idNumber', label: '证件号码', type: 'text', sensitive: true, hint: '只保存在本机。国聘的证件号由网站实名锁定，工具不会填写。' },
      { key: 'nationality', label: '国籍', type: 'text', datalist: ['中国'] },
      { key: 'ethnicity', label: '民族', type: 'text', datalist: ETHNIC_GROUPS },
      { key: 'politicalStatus', label: '政治面貌', type: 'enum', sensitive: true, options: POLITICAL },
      { key: 'partyJoinDate', label: '入党（团）时间', type: 'date', sensitive: true, hint: DATE_HINT },
      { key: 'maritalStatus', label: '婚姻状况', type: 'enum', sensitive: true, options: [['unmarried', '未婚'], ['married', '已婚'], ['divorced', '离异'], ['widowed', '丧偶']] },
      { key: 'healthStatus', label: '健康状况', type: 'text', sensitive: true },
      { key: 'heightCm', label: '身高（厘米）', type: 'number' },
      { key: 'nativePlace', label: '籍贯', type: 'region', hint: '祖籍，不等于生源地' },
      { key: 'studentOrigin', label: '生源地', type: 'region', hint: '高考所在地，不等于籍贯' },
      { key: 'hukou', label: '户口所在地', type: 'region', sensitive: true },
      { key: 'hukouType', label: '户口性质', type: 'enum', sensitive: true, options: [['urban', '城镇'], ['rural', '农村'], ['collective', '集体户'], ['unknown', '不清楚']] },
      { key: 'currentResidence', label: '现居住地', type: 'region', hint: '不等于户口所在地' },
    ],
  },
  {
    key: 'contact',
    title: '联系方式',
    kind: 'object',
    fields: [
      { key: 'mobile', label: '手机号', type: 'text', sensitive: true },
      { key: 'email', label: '邮箱', type: 'text' },
      { key: 'address', label: '通讯地址', type: 'text', sensitive: true },
      { key: 'postalCode', label: '邮编', type: 'text' },
      { key: 'emergencyContact.name', label: '紧急联系人姓名', type: 'text', sensitive: true },
      { key: 'emergencyContact.relation', label: '与紧急联系人关系', type: 'text', sensitive: true },
      { key: 'emergencyContact.mobile', label: '紧急联系人电话', type: 'text', sensitive: true },
    ],
  },
  {
    key: 'education',
    title: '教育经历',
    kind: 'array',
    idPrefix: 'edu',
    hint: '每段学历一条（本科、硕士分开）。填写顺序由网站决定，这里按时间录入即可。',
    itemTitle: (r) => `${EDU_LEVELS.find(([k]) => k === r.level)?.[1] ?? '学历未选'} · ${r.school || '学校未填'}`,
    fields: [
      { key: 'level', label: '学历', type: 'enum', required: true, options: EDU_LEVELS },
      { key: 'degree', label: '学位', type: 'enum', options: [['bachelor', '学士'], ['master', '硕士'], ['doctor', '博士'], ['none', '无学位'], ['other', '其他']] },
      { key: 'school', label: '学校名称（完整名称）', type: 'text', required: true },
      { key: 'schoolRegion', label: '学校所在地区', type: 'region' },
      { key: 'college', label: '院系', type: 'text' },
      { key: 'majorCategory', label: '专业分类', type: 'text', hint: '门类/专业类，如“管理学/工商管理类”' },
      { key: 'major', label: '专业名称', type: 'text' },
      { key: 'researchDirection', label: '研究方向（研究生）', type: 'text' },
      { key: 'start', label: '入学时间', type: 'date', required: true, hint: DATE_HINT },
      { key: 'end', label: '毕业时间', type: 'dateOrPresent', hint: DATE_HINT },
      { key: 'studyMode', label: '学习形式', type: 'enum', options: [['full-time', '全日制'], ['part-time', '非全日制']] },
      { key: 'admissionType', label: '统招', type: 'enum', options: [['unified', '统招'], ['non-unified', '非统招'], ['non-mainland', '非内地院校']] },
      { key: 'durationYears', label: '学制（年）', type: 'number', step: 0.5 },
      { key: 'overseasYears', label: '海外学习年限（年）', type: 'number', step: 0.5, hint: '只在境外就读时填写' },
      { key: 'isTransferFromJuniorCollege', label: '是否专升本', type: 'tri', options: TRI },
      { key: 'hasDoubleDegree', label: '是否有双学位', type: 'tri', options: TRI },
      { key: 'gpa', label: '成绩（GPA）', type: 'text', hint: '按原文，如 3.52/4.0' },
      { key: 'rank', label: '专业排名', type: 'text', hint: '如 15/180' },
      { key: 'isStudentCadre', label: '是否学生干部', type: 'tri', options: TRI },
      { key: 'mainCourses', label: '主修课程', type: 'list', hint: '用逗号或顿号分隔' },
      { key: 'trainingMode', label: '培养方式', type: 'text' },
      { key: 'schoolExperience', label: '在校经历（你自己写的原文）', type: 'textarea' },
    ],
  },
  {
    key: 'work',
    title: '工作/实习经历',
    kind: 'array',
    idPrefix: 'work',
    itemTitle: (r) => `${r.company || '单位未填'} · ${r.title || '职位未填'}`,
    fields: [
      { key: 'kind', label: '工作性质', type: 'enum', required: true, options: [['internship', '实习'], ['full-time', '全职'], ['part-time', '兼职']] },
      { key: 'company', label: '单位名称', type: 'text', required: true },
      { key: 'companyNature', label: '单位性质', type: 'text', datalist: ['国企', '民营企业', '事业单位', '上市公司', '中外合资', '外商独资', '民办非企业', '非营利组织'] },
      { key: 'department', label: '部门', type: 'text' },
      { key: 'title', label: '职位名称', type: 'text', required: true },
      { key: 'location', label: '工作地区', type: 'region' },
      { key: 'start', label: '开始时间', type: 'date', required: true, hint: DATE_HINT },
      { key: 'end', label: '结束时间', type: 'dateOrPresent', hint: DATE_HINT },
      { key: 'description', label: '工作内容（你自己写的原文）', type: 'textarea' },
      { key: 'salary', label: '税前月薪（元）', type: 'number' },
      { key: 'hasReferee', label: '是否有证明人', type: 'tri', options: TRI },
      { key: 'note', label: '补充说明', type: 'text' },
    ],
  },
  {
    key: 'projects',
    title: '项目经历',
    kind: 'array',
    idPrefix: 'proj',
    itemTitle: (r) => String(r.name || '项目名称未填'),
    fields: [
      { key: 'name', label: '项目名称', type: 'text', required: true },
      { key: 'role', label: '项目角色', type: 'text' },
      { key: 'organization', label: '所在单位', type: 'text' },
      { key: 'teamSize', label: '团队人数', type: 'number' },
      { key: 'start', label: '开始时间', type: 'date', required: true, hint: DATE_HINT },
      { key: 'end', label: '结束时间', type: 'dateOrPresent' },
      { key: 'introduction', label: '项目简介', type: 'textarea' },
      { key: 'duty', label: '本人职责', type: 'textarea' },
      { key: 'achievement', label: '项目成果', type: 'textarea' },
    ],
  },
  {
    key: 'studentLeadership',
    title: '学生干部经历',
    kind: 'array',
    idPrefix: 'lead',
    itemTitle: (r) => `${r.organization || ''} · ${r.role || ''}`,
    fields: [
      { key: 'organization', label: '组织', type: 'text', required: true },
      { key: 'role', label: '职务', type: 'text', required: true },
      { key: 'start', label: '开始时间', type: 'date' },
      { key: 'end', label: '结束时间', type: 'dateOrPresent' },
      { key: 'description', label: '说明', type: 'textarea' },
    ],
  },
  {
    key: 'socialPractice',
    title: '社会实践',
    kind: 'array',
    idPrefix: 'prac',
    itemTitle: (r) => `${r.organization || ''} · ${r.role || ''}`,
    fields: [
      { key: 'organization', label: '组织/单位', type: 'text', required: true },
      { key: 'role', label: '角色', type: 'text', required: true },
      { key: 'start', label: '开始时间', type: 'date' },
      { key: 'end', label: '结束时间', type: 'dateOrPresent' },
      { key: 'description', label: '说明', type: 'textarea' },
    ],
  },
  {
    key: 'languages',
    title: '语言能力',
    kind: 'array',
    idPrefix: 'lang',
    itemTitle: (r) => `${r.language || '英语'} · ${r.certificate || ''} ${r.score || ''}`,
    fields: [
      { key: 'language', label: '语种', type: 'text', required: true, datalist: ['英语', '日语', '法语', '德语', '韩语'] },
      { key: 'certificate', label: '证书', type: 'text', required: true, hint: '规范名：CET4、CET6、TEM4、TEM8、IELTS、TOEFL、GRE、GMAT、CATTI', datalist: ['CET4', 'CET6', 'TEM4', 'TEM8', 'IELTS', 'TOEFL', 'GRE', 'GMAT', 'CATTI'] },
      { key: 'score', label: '成绩', type: 'text' },
      { key: 'date', label: '取得时间', type: 'date' },
      { key: 'listenSpeak', label: '听说能力', type: 'enum', options: [['basic', '一般'], ['good', '良好'], ['proficient', '熟练'], ['expert', '精通'], ['unspecified', '不注明']] },
      { key: 'readWrite', label: '读写能力', type: 'enum', options: [['basic', '一般'], ['good', '良好'], ['proficient', '熟练'], ['expert', '精通'], ['unspecified', '不注明']] },
    ],
  },
  {
    key: 'computerSkills',
    title: '计算机能力',
    kind: 'array',
    idPrefix: 'comp',
    itemTitle: (r) => String(r.name || ''),
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'level', label: '等级/水平', type: 'text' },
      { key: 'date', label: '取得时间', type: 'date' },
    ],
  },
  {
    key: 'certificates',
    title: '证书与职业资格',
    kind: 'array',
    idPrefix: 'cert',
    hint: '只记录确实持有或在考的证书，工具不会补全或推测。',
    itemTitle: (r) => String(r.name || ''),
    fields: [
      { key: 'category', label: '分类', type: 'text', datalist: ['会计类', '审计类', '金融类', '英语类', 'IT类', '其他'] },
      { key: 'name', label: '证书名称', type: 'text', required: true },
      { key: 'status', label: '状态', type: 'enum', required: true, options: [['obtained', '已取得'], ['partial', '部分通过'], ['in-progress', '在考']] },
      { key: 'detail', label: '说明', type: 'text', hint: '如已通过的科目' },
      { key: 'date', label: '取得时间', type: 'date' },
    ],
  },
  {
    key: 'skills',
    title: '技能',
    kind: 'array',
    idPrefix: 'skill',
    itemTitle: (r) => String(r.name || ''),
    fields: [
      { key: 'name', label: '技能', type: 'text', required: true },
      { key: 'level', label: '熟练程度', type: 'enum', options: [['basic', '一般'], ['good', '良好'], ['proficient', '熟练'], ['expert', '精通'], ['unspecified', '不注明']] },
      { key: 'note', label: '说明', type: 'text' },
    ],
  },
  {
    key: 'honors',
    title: '荣誉奖励',
    kind: 'array',
    idPrefix: 'honor',
    itemTitle: (r) => String(r.name || ''),
    fields: [
      { key: 'name', label: '奖励名称', type: 'text', required: true },
      { key: 'date', label: '获得时间', type: 'date' },
      { key: 'level', label: '奖励级别', type: 'enum', options: [['international', '国际级'], ['national', '国家级'], ['provincial', '省部级'], ['city', '地市级'], ['enterprise', '企业级'], ['school', '学校级'], ['department', '院系级'], ['other', '其他']] },
      { key: 'grade', label: '获奖等级', type: 'enum', options: [['special', '特等奖'], ['first', '一等奖'], ['second', '二等奖'], ['third', '三等奖'], ['other', '其他']] },
      { key: 'issuer', label: '颁发机构', type: 'text' },
      { key: 'description', label: '描述', type: 'textarea' },
    ],
  },
  {
    key: 'family',
    title: '家庭成员',
    kind: 'array',
    idPrefix: 'fam',
    hint: '全部为高敏感信息，只在网站字段完全确定时才会使用。',
    itemTitle: (r) => `${r.relation || ''} · ${r.name || ''}`,
    fields: [
      { key: 'relation', label: '称谓', type: 'text', required: true, sensitive: true },
      { key: 'name', label: '姓名', type: 'text', required: true, sensitive: true },
      { key: 'birthDate', label: '出生日期', type: 'date', sensitive: true },
      { key: 'employer', label: '工作单位', type: 'text', sensitive: true },
      { key: 'position', label: '职务', type: 'text', sensitive: true },
      { key: 'politicalStatus', label: '政治面貌', type: 'enum', sensitive: true, options: POLITICAL },
      { key: 'mobile', label: '电话', type: 'text', sensitive: true },
    ],
  },
  {
    key: 'intention',
    title: '求职意向',
    kind: 'object',
    fields: [
      { key: 'jobTypes', label: '期望职位类别', type: 'list', hint: '用逗号分隔，如 财务会计，审计' },
      { key: 'cities', label: '期望城市', type: 'regionList', hint: '每行一个，如“北京市”或“湖南省 长沙市”' },
      { key: 'salaryMin', label: '最低薪资（元/月）', type: 'number' },
      { key: 'salaryMax', label: '最高薪资（元/月）', type: 'number' },
      { key: 'acceptJobAdjustment', label: '是否接受岗位调剂', type: 'tri', options: TRI },
      { key: 'acceptEmployerAdjustment', label: '是否接受单位调剂', type: 'tri', options: TRI },
      { key: 'earliestStartDate', label: '最早到岗/可实习时间', type: 'date', hint: DATE_HINT },
    ],
  },
  {
    key: 'declarations',
    title: '声明类问题',
    kind: 'object',
    hint: '只作为参考，工具不会自动回答声明类问题。',
    fields: [
      { key: 'hasDisciplinaryRecord', label: '是否受过处分', type: 'tri', sensitive: true, options: TRI },
      { key: 'disciplinaryDetail', label: '说明', type: 'textarea', sensitive: true },
    ],
  },
  {
    key: 'textTemplates',
    title: '长文本模板（自己写）',
    kind: 'array',
    idPrefix: 'tpl',
    hint: '自我评价、求职动机等由你自己写好；工具不生成、不改写文字。',
    itemTitle: (r) => String(r.title || ''),
    fields: [
      { key: 'title', label: '标题', type: 'text', required: true },
      { key: 'kind', label: '类型', type: 'enum', options: [['self-assessment', '自我评价'], ['motivation', '求职动机'], ['why-company', '为什么选择我们'], ['school-experience', '在校经历'], ['other', '其他']] },
      { key: 'body', label: '正文', type: 'textarea', required: true },
    ],
  },
  {
    key: 'custom',
    title: '自定义字段',
    kind: 'array',
    idPrefix: 'cus',
    hint: '网站上有、档案里没有的字段。只在网站标签与这里完全相同时使用。',
    itemTitle: (r) => String(r.label || ''),
    fields: [
      { key: 'label', label: '网站上的标签', type: 'text', required: true },
      { key: 'aliases', label: '其他写法', type: 'list' },
      { key: 'value', label: '值', type: 'text', required: true },
      { key: 'sensitivity', label: '敏感程度', type: 'enum', options: [['low', '低'], ['medium', '中'], ['high', '高']] },
    ],
  },
];
