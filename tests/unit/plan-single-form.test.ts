// 没有分区块的单页报名表：个人信息和学校、专业混在一张表里（企业自建系统、事业单位报名表常见）。
import { describe, expect, it } from 'vitest';
import { buildPlan, highestEducation } from '../../src/core/plan/plan';
import { fd, sampleProfile } from './helpers';

describe('单页报名表', () => {
  const p = sampleProfile();
  const top = highestEducation(p)!;
  const fields = [
    fd({ label: '姓名', section: '报名信息' }),
    fd({ label: '毕业院校', section: '报名信息' }),
    fd({ label: '所学专业', section: '报名信息' }),
    fd({ label: '毕业时间', section: '报名信息' }),
    fd({ label: '备注', section: '报名信息' }),
  ];
  const plan = buildPlan(fields, { profile: p, collection: 'single' });
  const item = (l: string) => plan.find((x) => x.label === l)!;

  it('学校、专业、毕业时间按最高学历那一条给出，置信为“中”（默认勾选、需核对）', () => {
    expect(item('毕业院校').level).toBe('medium');
    expect(item('毕业院校').candidates?.[0].display).toBe(top.school);
    expect(item('毕业院校').recordId).toBe(top.id);
    expect(item('所学专业').candidates?.[0].display).toBe(top.major);
    expect(item('毕业时间').level).toBe('medium');
    expect(item('毕业院校').reasons.join('')).toContain('最高学历');
  });

  it('本人信息照常是“高”；对不上的仍然不填', () => {
    expect(item('姓名').level).toBe('high');
    expect(['low', 'skip']).toContain(item('备注').level);
  });

  it('页面有“教育经历”区块时不受影响（仍按区块和档案第几条对应）', () => {
    const edu = buildPlan([fd({ label: '毕业院校', section: '教育经历' })], { profile: p, collection: 'education', record: p.education[0] as never });
    expect(edu[0].recordId).toBe(p.education[0].id);
  });
});
