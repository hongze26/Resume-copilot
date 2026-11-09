// 覆盖档案全部字段的测试简历（tests/resumes/resume-full.txt）与对应档案（profile-full.json），全部为虚构个人信息。
// 日期都写到日（2023.08.07），用来检查“精确到日”的识别和填写。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyProfile } from '../../src/core/profile/empty';
import { validateProfile } from '../../src/core/profile/validate';
import { applyParsed } from '../../src/core/resume/apply';
import { parseResumeText } from '../../src/core/resume/parse';

const read = (f: string) => readFileSync(new URL(`../resumes/${f}`, import.meta.url), 'utf8');
const r = parseResumeText(read('resume-full.txt'));
const field = (path: string) => r.fields.find((f) => f.path === path)?.value;
const recs = (col: string) => r.records.filter((x) => x.collection === col).map((x) => x.record);

describe('全字段测试简历', () => {
  it('配套档案通过校验', () => {
    expect(validateProfile(JSON.parse(read('profile-full.json')))).toEqual([]);
  });

  it('除标题外每一行都识别了', () => {
    expect(r.unparsed).toEqual(['个人简历']);
  });

  it('基本信息：入党时间、户口性质、邮编、紧急联系人、体重和微信进自定义字段', () => {
    expect(field('basic.partyJoinDate')).toBe('2022-06-28');
    expect(field('basic.hukouType')).toBe('urban');
    expect(field('basic.hukou')).toEqual({ province: '湖北省', city: '宜昌市', district: '西陵区' });
    expect(field('contact.postalCode')).toBe('200433');
    expect(field('contact.emergencyContact.name')).toBe('林建国');
    expect(field('contact.emergencyContact.mobile')).toBe('13900139000');
    expect(field('custom:体重(kg)')).toBe('52');
    expect(field('custom:微信号')).toBe('linruoxi_test');
  });

  it('求职意向：只写城市名也能补上省份，期望月薪拆成最低/最高', () => {
    expect(field('intention.cities')).toEqual([
      { province: '上海市', city: '上海市' },
      { province: '广东省', city: '深圳市' },
      { province: '浙江省', city: '杭州市' },
    ]);
    expect([field('intention.salaryMin'), field('intention.salaryMax')]).toEqual([15000, 25000]);
    expect(field('intention.earliestStartDate')).toBe('2025-07-01');
    expect(field('intention.acceptJobAdjustment')).toBe('yes');
  });

  it('经历的起止日期精确到日', () => {
    expect(recs('education').map((e) => [e.school, e.start, e.end])).toEqual([
      ['新加坡国立大学', '2023-08-07', '2024-12-20'],
      ['武汉大学', '2019-09-01', '2023-06-30'],
    ]);
    expect(recs('work').map((w) => [w.start, w.end])).toEqual([
      ['2025-01-06', 'present'],
      ['2022-07-04', '2022-09-30'],
      ['2020-10-10', '2021-06-20'],
    ]);
    expect(recs('honors').map((h) => [h.name, h.date, h.issuer])).toEqual([
      ['国家奖学金', '2021-10-15', '中华人民共和国教育部'],
      ['全国大学生数学建模竞赛湖北赛区一等奖', '2021-11-20', '中国工业与应用数学学会'],
      ['武汉大学优秀毕业生', '2023-06-10', '武汉大学'],
    ]);
  });

  it('教育：一个字的学院、研究方向、境外院校', () => {
    expect(recs('education')[0]).toMatchObject({ college: '商学院', major: '商业分析', researchDirection: '用户增长与因果推断', admissionType: 'non-mainland' });
  });

  it('工作：兼职、月薪；项目：团队人数、所在单位', () => {
    expect(recs('work').map((w) => [w.kind, w.salary, w.title])).toEqual([
      ['internship', 6000, '数据分析实习生'],
      ['internship', 3000, '数据分析实习生'],
      ['part-time', 2000, '数学兼职助教'],
    ]);
    expect(recs('projects')[0]).toMatchObject({ role: '组长', teamSize: 4, organization: '新加坡国立大学商学院' });
    expect(recs('socialPractice')[0]).toMatchObject({ role: '暑期调研队员' });
  });

  it('语言的听说/读写能力，技能的级别和括号说明，证书状态', () => {
    expect(recs('languages').map((l) => [l.certificate, l.listenSpeak, l.readWrite])).toEqual([
      ['CET6', 'proficient', 'expert'],
      ['IELTS', 'proficient', 'expert'],
      ['JLPT N2', 'basic', 'good'],
    ]);
    expect(recs('skills').map((s) => [s.name, s.level])).toEqual([
      ['Python', 'expert'],
      ['SQL', 'proficient'],
      ['Excel', 'proficient'],
      ['Spark', 'good'],
      ['Tableau', 'good'],
    ]);
    expect(recs('certificates').map((c) => [c.name, c.status])).toEqual([
      ['CDA 数据分析师二级', 'obtained'],
      ['证券从业资格', 'obtained'],
      ['CFA 一级', 'in-progress'],
    ]);
  });

  it('家庭成员', () => {
    expect(recs('family')).toEqual([
      { relation: '父亲', name: '林建国', employer: '宜昌市第一中学', position: '教师', politicalStatus: 'cpc-member' },
      { relation: '母亲', name: '周慧敏', employer: '宜昌市中心人民医院', position: '护士长', politicalStatus: 'masses' },
    ]);
  });

  it('填入空档案后通过校验，体重写进自定义字段', () => {
    const p = emptyProfile();
    applyParsed(p, r.fields, r.records);
    expect(validateProfile(p)).toEqual([]);
    expect(p.custom?.find((c) => c.label === '体重(kg)')?.value).toBe('52');
    expect(p.contact.emergencyContact).toEqual({ name: '林建国', relation: '父亲', mobile: '13900139000' });
  });

  it('只写到月的区间不会把下一年误当成“日”', () => {
    const x = parseResumeText('教育背景\n2019.09-2023.06  武汉大学  经济统计学  本科');
    expect(x.records[0].record).toMatchObject({ start: '2019-09', end: '2023-06' });
  });
});
