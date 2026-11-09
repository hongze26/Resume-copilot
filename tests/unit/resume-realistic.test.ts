// 真实机构 + 虚构个人的测试简历（tests/resumes/resume-realistic.txt）与对应档案（profile-realistic.json）。
// 学校、单位、城市、证书都真实存在，便于在真实招聘网站（学校候选、城市弹窗、证书字典）上试填；姓名、手机、邮箱为编造。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateProfile } from '../../src/core/profile/validate';
import { parseResumeText } from '../../src/core/resume/parse';

const read = (f: string) => readFileSync(new URL(`../resumes/${f}`, import.meta.url), 'utf8');
const r = parseResumeText(read('resume-realistic.txt'));
const field = (path: string) => r.fields.find((f) => f.path === path)?.value;
const recs = (col: string) => r.records.filter((x) => x.collection === col).map((x) => x.record);

describe('真实数据测试简历', () => {
  it('配套档案通过校验', () => {
    expect(validateProfile(JSON.parse(read('profile-realistic.json')))).toEqual([]);
  });

  it('基本信息、现居住地（省/市/区）', () => {
    expect(field('basic.name')).toBe('陈思远');
    expect(field('basic.birthDate')).toBe('2002-03-18');
    expect(field('basic.politicalStatus')).toBe('cyl-member');
    expect(field('basic.currentResidence')).toEqual({ province: '湖南省', city: '长沙市', district: '岳麓区' });
  });

  it('教育：曼彻斯特大学（硕士）与湖南大学（本科）', () => {
    const edu = recs('education');
    expect(edu.map((e) => [e.school, e.level])).toEqual([
      ['曼彻斯特大学', 'master'],
      ['湖南大学', 'bachelor'],
    ]);
    expect(edu[1]).toMatchObject({ rank: '12/156', gpa: '3.71/4.0' });
  });

  it('实习：普华永道长沙分所（至今）、建设银行湖南省分行', () => {
    const work = recs('work');
    expect(work.map((w) => [w.company, w.end])).toEqual([
      ['普华永道中天会计师事务所(特殊普通合伙)长沙分所', 'present'],
      ['中国建设银行股份有限公司湖南省分行', '2023-09'],
    ]);
  });

  it('技能等级跟随最近的前缀：精通 Excel，熟练使用 SQL、Python', () => {
    expect(recs('skills').map((s) => [s.name, s.level])).toEqual([
      ['Excel', 'expert'],
      ['SQL', 'proficient'],
      ['Python', 'proficient'],
    ]);
  });
});
