import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyProfile } from '../../src/core/profile/empty';
import { validateProfile } from '../../src/core/profile/validate';
import { applyParsed } from '../../src/core/resume/apply';
import { findGutter, pageText } from '../../src/core/resume/layout';
import { parseRegion, parseResumeText } from '../../src/core/resume/parse';
import { sampleProfile } from './helpers';

const read = (f: string) => readFileSync(new URL(`../resumes/${f}`, import.meta.url), 'utf8');
const field = (r: ReturnType<typeof parseResumeText>, path: string) => r.fields.find((f) => f.path === path)?.value;
const recs = (r: ReturnType<typeof parseResumeText>, col: string) => r.records.filter((x) => x.collection === col).map((x) => x.record);

it('PDF 同一词的碎片紧邻时不插空格，真实词间距仍保留', () => {
  expect(pageText([
    { str: '项目', x: 10, y: 30, w: 18 }, { str: '职责', x: 28, y: 30, w: 18 },
    { str: 'Spring', x: 10, y: 10, w: 30 }, { str: 'Boot', x: 43, y: 10, w: 20 },
  ], 600)).toBe('项目职责\nSpring Boot');
});

describe('简历解析：标准版（“键：值” + 竖线/空格分隔）', () => {
  const r = parseResumeText(read('resume-standard.txt'));

  it('基本信息与联系方式', () => {
    expect(field(r, 'basic.name')).toBe('林示例');
    expect(field(r, 'basic.gender')).toBe('female');
    expect(field(r, 'basic.birthDate')).toBe('2001-05');
    expect(field(r, 'basic.ethnicity')).toBe('汉族');
    expect(field(r, 'basic.politicalStatus')).toBe('cpc-member');
    expect(field(r, 'basic.nativePlace')).toEqual({ province: '湖南省', city: '长沙市' });
    expect(field(r, 'basic.currentResidence')).toEqual({ province: '北京市', city: '北京市', district: '海淀区' });
    expect(field(r, 'contact.mobile')).toBe('13900000000');
    expect(field(r, 'contact.email')).toBe('sample.applicant@example.com');
    expect(field(r, 'intention.jobTypes')).toEqual(['财务分析', '审计']);
  });

  it('手机号、政治面貌标为敏感（预览默认不勾选）', () => {
    expect(r.fields.find((f) => f.path === 'contact.mobile')?.sensitive).toBe(true);
    expect(r.fields.find((f) => f.path === 'basic.politicalStatus')?.sensitive).toBe(true);
    expect(r.fields.find((f) => f.path === 'basic.name')?.sensitive).toBeFalsy();
  });

  it('教育经历：两段，学校/学院/专业/学历/GPA/排名/课程', () => {
    const edu = recs(r, 'education');
    expect(edu).toHaveLength(2);
    expect(edu[0]).toMatchObject({ school: '示例财经大学', college: '会计学院', major: '会计学', level: 'bachelor', degree: 'bachelor', start: '2019-09', end: '2023-06', gpa: '3.62/4.0', rank: '前10%' });
    expect(edu[0].mainCourses).toEqual(['中级财务会计', '审计学', '财务管理', '税法']);
    expect(edu[1]).toMatchObject({ school: '示例理工大学', level: 'master', major: '工商管理', start: '2023-09', end: 'present' });
  });

  it('实习经历：单位/部门/职位/地点/性质/描述', () => {
    const w = recs(r, 'work');
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ company: '示例证券股份有限公司', department: '投资银行部', title: '实习生', kind: 'internship', start: '2024-06', end: '2024-09' });
    expect(w[0].location).toEqual({ province: '北京市', city: '北京市' });
    expect(String(w[0].description)).toContain('尽职调查');
    expect(w[1]).toMatchObject({ company: '示例会计师事务所(特殊普通合伙)', title: '审计助理', kind: 'internship' });
  });

  it('项目、校园经历、荣誉', () => {
    expect(recs(r, 'projects')[0]).toMatchObject({ name: '城市更新项目财务可行性研究', role: '核心成员', start: '2023-10' });
    expect(recs(r, 'studentLeadership')[0]).toMatchObject({ organization: '校学生会', role: '宣传部部长' });
    const h = recs(r, 'honors');
    expect(h.map((x) => x.name)).toEqual(['国家奖学金', '全国大学生数学建模竞赛省级一等奖', '校级优秀学生干部']);
    // 明确写出“省级”时不被“全国”带偏
    expect(h[1]).toMatchObject({ level: 'provincial', grade: 'first', date: '2021-11' });
  });

  it('证书与技能：语言成绩、计算机、括号内不切分、技能前缀', () => {
    expect(recs(r, 'languages')).toEqual([
      { language: '英语', certificate: 'CET6', score: '560' },
      { language: '英语', certificate: 'IELTS', score: '7.0' },
    ]);
    expect(recs(r, 'computerSkills')[0].name).toContain('全国计算机二级');
    const certs = recs(r, 'certificates');
    expect(certs[0]).toMatchObject({ name: 'CPA(已通过会计、税法)', status: 'partial' });
    expect(certs[1]).toMatchObject({ name: '初级会计职称', status: 'obtained' });
    expect(recs(r, 'skills').map((s) => [s.name, s.level])).toEqual([
      ['Excel', 'proficient'],
      ['Python', 'proficient'],
      ['SQL', 'proficient'],
    ]);
  });

  it('自我评价原样保存为长文本模板', () => {
    expect(recs(r, 'textTemplates')[0]).toMatchObject({ kind: 'self-assessment', body: '做事认真细致,有较强的数据分析能力和团队协作意识。' });
  });
});

describe('简历解析：两栏版（无“姓名：”、日期单独成行、【】标题）', () => {
  const r = parseResumeText(read('resume-twocolumn.txt'));

  it('首行姓名与竖线分隔的个人信息', () => {
    expect(field(r, 'basic.name')).toBe('陈测试');
    expect(field(r, 'basic.gender')).toBe('male');
    expect(field(r, 'basic.birthDate')).toBe('2000-08');
    expect(field(r, 'basic.politicalStatus')).toBe('cyl-member');
    expect(field(r, 'contact.mobile')).toBe('13800000000');
  });

  it('日期在标题下一行时与上一行合并；学校与学院连写时拆开', () => {
    const edu = recs(r, 'education');
    expect(edu).toHaveLength(2);
    expect(edu[0]).toMatchObject({ school: '示例师范大学', major: '数学与应用数学', level: 'bachelor', start: '2018-09', end: '2022-06' });
    expect(edu[1]).toMatchObject({ school: '示例大学', college: '经济学院', major: '金融学', level: 'master', gpa: '3.8/4.0' });
  });

  it('日期在标题上一行时与下一行合并；未写“实习”的工作经历标注推断', () => {
    const w = r.records.filter((x) => x.collection === 'work');
    expect(w[0].record).toMatchObject({ company: '示例银行股份有限公司', department: '总行信息科技部', title: '数据分析岗', kind: 'full-time', end: 'present' });
    expect(w[0].notes.join()).toContain('推断');
    expect(w[1].record).toMatchObject({ company: '示例科技有限公司', title: '产品运营实习生', kind: 'internship' });
  });

  it('一行多个奖项、只有年份', () => {
    expect(recs(r, 'honors')).toEqual([
      { name: '研究生学业奖学金一等奖', date: '2023', grade: 'first' },
      { name: '校级三好学生', date: '2020', level: 'school' },
    ]);
  });

  it('社会实践与证书', () => {
    expect(recs(r, 'socialPractice')[0]).toMatchObject({ organization: '示例县支教团', role: '志愿者' });
    expect(recs(r, 'certificates').map((c) => c.name)).toEqual(['普通话二级甲等', '教师资格证(高中数学)']);
  });
});

describe('简历解析：边界', () => {
  it('身份证号不会被当作手机号', () => {
    const r = parseResumeText('张三\n身份证号：110101200001011234\n');
    expect(field(r, 'contact.mobile')).toBeUndefined();
  });
  it('紧急联系人电话不被当作本人手机', () => {
    const r = parseResumeText('姓名：张三\n紧急联系人电话：13900000009\n');
    expect(field(r, 'contact.mobile')).toBeUndefined();
  });
  it('空文本', () => {
    expect(parseResumeText('')).toEqual({ fields: [], records: [], sections: [], unparsed: [] });
  });
  it('地区解析', () => {
    expect(parseRegion('湖南长沙')).toEqual({ province: '湖南省', city: '长沙市' });
    expect(parseRegion('上海市浦东新区')).toEqual({ province: '上海市', city: '上海市', district: '浦东新区' });
    expect(parseRegion('广东省深圳市南山区')).toEqual({ province: '广东省', city: '深圳市', district: '南山区' });
    expect(parseRegion('火星')).toBeUndefined();
  });
});

describe('写入档案草稿', () => {
  it('空档案：全部写入，补齐必填项后通过 Schema 校验', () => {
    const r = parseResumeText(read('resume-standard.txt'));
    const p = emptyProfile();
    const res = applyParsed(p, r.fields, r.records);
    expect(res.keptExisting).toEqual([]);
    expect(p.basic.name).toBe('林示例');
    expect(p.education).toHaveLength(2);
    expect(p.education[0].id).toMatch(/^edu-/);
    expect(p.meta.source).toBe('resume-parse');
    expect(validateProfile(p)).toEqual([]);
  });

  it('默认不覆盖已有值，重复经历不重复添加', () => {
    const r = parseResumeText(read('resume-standard.txt'));
    const p = sampleProfile();
    const before = p.education.length;
    p.education[0].school = '示例财经大学';
    p.education[0].start = '2019-09';
    const res = applyParsed(p, r.fields, r.records);
    expect(p.basic.name).toBe('林示例'); // 示例档案原值
    expect(res.keptExisting).toContain('basic.name');
    expect(res.duplicates.some((d) => d.includes('示例财经大学'))).toBe(true);
    expect(p.education.length).toBe(before + 1);
  });

  it('overwrite=true 覆盖已有值', () => {
    const r = parseResumeText('姓名：王覆盖\n');
    const p = sampleProfile();
    applyParsed(p, r.fields, [], { overwrite: true });
    expect(p.basic.name).toBe('王覆盖');
  });
});

describe('简历解析：两栏版（左侧信息栏，PDF 按栏重排后）', () => {
  const text = read('resume-sidebar.txt')
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('====='))
    .join('\n');
  const r = parseResumeText(text);
  it('左栏的个人信息、技能、证书', () => {
    expect(field(r, 'basic.name')).toBe('王样例');
    expect(field(r, 'basic.nativePlace')).toEqual({ province: '浙江省', city: '杭州市' });
    expect(field(r, 'intention.jobTypes')).toEqual(['软件开发工程师']);
    expect(recs(r, 'languages')).toEqual([{ language: '英语', certificate: 'CET4', score: '512' }]);
    expect(recs(r, 'computerSkills')[0].name).toBe('软件设计师(中级)');
  });
  it('右栏经历；项目角色只隔一个空格时也能拆开', () => {
    expect(recs(r, 'education')[0]).toMatchObject({ school: '示例工业大学', major: '计算机科学与技术', level: 'bachelor' });
    expect(recs(r, 'projects')[0]).toMatchObject({ name: '校园二手交易平台', role: '项目负责人' });
    expect(recs(r, 'work')[0]).toMatchObject({ company: '示例网络科技有限公司', title: '后端开发实习生', kind: 'internship' });
  });
});

describe('PDF 两栏重排', () => {
  const left = (y: number, str: string) => ({ str, x: 62, y, w: 100 });
  const right = (y: number, str: string) => ({ str, x: 235, y, w: 260 });
  const items = [
    left(757, '王样例'),
    left(676, '性别:男'),
    left(658, '出生年月:2002.03'),
    left(642, '政治面貌:共青团员'),
    left(625, '籍贯:浙江杭州'),
    left(607, '电话:13700000000'),
    right(766, '教育经历'),
    right(741, '2020.09 - 2024.06 示例工业大学'),
    right(694, '项目经历'),
    right(669, '2023.03 - 2023.06 平台 负责人'),
    right(652, '负责后端接口设计'),
    right(621, '实习经历'),
    right(597, '2023.07 - 2023.09 示例公司 实习生'),
  ];
  it('找到栏间距，先左栏后右栏，不再逐行交错', () => {
    expect(findGutter(items, 596)).toBeGreaterThan(162);
    expect(findGutter(items, 596)).toBeLessThan(235);
    const lines = pageText(items, 596).split('\n');
    expect(lines.slice(0, 6)).toEqual(['王样例', '性别:男', '出生年月:2002.03', '政治面貌:共青团员', '籍贯:浙江杭州', '电话:13700000000']);
    expect(lines[6]).toBe('教育经历');
  });
  it('单栏（同一行左右两段文字，如“2019.09 – 2023.06 … 本科”分两段排版）不误判为两栏', () => {
    const single = Array.from({ length: 14 }, (_, i) => [
      { str: `第${i}行左侧`, x: 60, y: 700 - i * 18, w: 120 },
      { str: '右', x: 400, y: 700 - i * 18, w: 20 },
      { str: `跨越栏间距的长句子${i}`, x: 60, y: 690 - i * 18, w: 420 },
    ]).flat();
    expect(findGutter(single, 596)).toBeUndefined();
  });
});
