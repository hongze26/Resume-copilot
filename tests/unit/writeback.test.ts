import { describe, expect, it } from 'vitest';
import { iguopinRules } from '../../src/adapters/iguopin/rules';
import { applyWriteback, fromPageText, parseRegion, proposeWriteback, type PageFieldValue } from '../../src/core/profile/writeback';
import { RULES_BY_KEY } from '../../src/core/matcher/semantic';
import { buildPlan } from '../../src/core/plan/plan';
import type { Profile } from '../../src/core/profile/types';
import { fd, sampleProfile } from './helpers';

const v = (o: Partial<PageFieldValue> & { label: string; text: string }): PageFieldValue => ({ ...fd(o), text: o.text });

describe('页面文字 → 档案值', () => {
  it('枚举、日期、地区、学制', () => {
    expect(fromPageText(RULES_BY_KEY['work.kind'], '实习')?.value).toBe('internship');
    expect(fromPageText(RULES_BY_KEY['languages.certificate'], '大学英语六级CET6')?.value).toBe('CET6');
    expect(fromPageText(RULES_BY_KEY['work.end'], '至今')?.value).toBe('present');
    expect(fromPageText(RULES_BY_KEY['work.start'], '2023-07')?.value).toBe('2023-07');
    expect(fromPageText(RULES_BY_KEY['education.durationYears'], '3.5年')?.value).toBe(3.5);
    expect(fromPageText(RULES_BY_KEY['work.companyNature'], '国企')?.value).toBe('国企');
    expect(fromPageText(RULES_BY_KEY['work.companyNature'], '请选择单位性质')).toBeUndefined();
    expect(parseRegion('中国 / 内蒙古 / 巴彦淖尔 / 五原县')).toEqual({ province: '内蒙古', city: '巴彦淖尔', district: '五原县' });
  });
});

describe('写回建议', () => {
  it('绑定的工作记录：档案缺少的项默认勾选，与档案不同的项默认不勾选', () => {
    const p = sampleProfile();
    const rec = p.work![0];
    delete rec.companyNature;
    delete rec.note;
    const items = proposeWriteback(
      p,
      [
        v({ label: '单位名称', id: 'company_name', sectionKey: 'work', section: '工作/实习经历', text: rec.company }),
        v({ label: '单位性质', id: 'company_nature', sectionKey: 'work', section: '工作/实习经历', kind: 'select', text: '国企' }),
        v({ label: '职位名称', id: 'job_name', sectionKey: 'work', section: '工作/实习经历', text: '另一个职位' }),
        v({ label: '补充说明', id: 'other_description', sectionKey: 'work', section: '工作/实习经历', text: '远程实习' }),
      ],
      { adapter: iguopinRules, collection: 'work', record: rec as never },
    );
    expect(items.find((i) => i.field === 'companyNature')).toMatchObject({ kind: 'set', checked: true, value: '国企', recordId: rec.id });
    expect(items.find((i) => i.field === 'note')).toMatchObject({ kind: 'set', checked: true, value: '远程实习' });
    expect(items.find((i) => i.field === 'title')).toMatchObject({ kind: 'replace', checked: false, after: '另一个职位' });
    expect(items.find((i) => i.field === 'company')).toBeUndefined();
    const next = applyWriteback(p, items);
    expect(next.work![0].companyNature).toBe('国企');
    expect(next.work![0].note).toBe('远程实习');
    expect(next.work![0].title).toBe(rec.title); // 未勾选不改
  });

  it('档案中没有的记录：新建一条（缺必填项时不能新建）', () => {
    const p = sampleProfile();
    const before = p.work!.length;
    const vals = [
      v({ label: '单位名称', id: 'company_name', sectionKey: 'work', section: '工作/实习经历', text: '新的示例公司' }),
      v({ label: '职位名称', id: 'job_name', sectionKey: 'work', section: '工作/实习经历', text: '数据分析实习生' }),
      v({ label: '工作性质', id: 'employee_type', sectionKey: 'work', section: '工作/实习经历', kind: 'select', text: '实习' }),
      v({ label: '在职时间-开始时间', id: 'period_start', sectionKey: 'work', section: '工作/实习经历', kind: 'date', text: '2023-07' }),
      v({ label: '在职时间-结束时间', id: 'period_end_input', sectionKey: 'work', section: '工作/实习经历', kind: 'date', text: '2023-10' }),
      v({ label: '工作地区', id: 'location', sectionKey: 'work', section: '工作/实习经历', kind: 'cascader', text: '北京市 / 海淀区' }),
    ];
    const items = proposeWriteback(p, vals, { adapter: iguopinRules, collection: 'work' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'new-record', checked: true });
    const next = applyWriteback(p, items);
    expect(next.work).toHaveLength(before + 1);
    expect(next.work![before]).toMatchObject({ company: '新的示例公司', title: '数据分析实习生', kind: 'internship', start: '2023-07', end: '2023-10', location: { province: '北京市', city: '海淀区' } });

    const partial = proposeWriteback(p, vals.slice(0, 1), { adapter: iguopinRules, collection: 'work' });
    expect(partial[0].error).toMatch(/缺少必填项/);
    expect(applyWriteback(p, partial).work).toHaveLength(before);
  });

  it('单表单：空项补上，不认识的字段新建自定义字段，自我评价存为文字模板', () => {
    const p: Profile = sampleProfile();
    delete p.basic.ethnicity;
    p.textTemplates = [];
    const items = proposeWriteback(
      p,
      [
        v({ label: '民族', id: 'nation', sectionKey: 'basic', section: '基本信息', kind: 'select', text: '汉族' }),
        v({ label: '微信号', sectionKey: 'basic', section: '基本信息', text: 'demo_wx' }),
        v({ label: '姓名', id: 'full_name', sectionKey: 'basic', section: '基本信息', text: '某某', disabled: true }),
      ],
      { adapter: iguopinRules, collection: 'single' },
    );
    expect(items.find((i) => i.path === 'basic.ethnicity')).toMatchObject({ kind: 'set', value: '汉族', checked: true });
    expect(items.find((i) => i.kind === 'custom')).toMatchObject({ label: '微信号', value: 'demo_wx' });
    expect(items.some((i) => i.label === '姓名')).toBe(false);
    const self = proposeWriteback(p, [v({ label: '自我评价', id: 'assessment', sectionKey: 'selfAssessment', section: '自我评价', kind: 'textarea', text: '踏实认真。' })], { adapter: iguopinRules, collection: 'single' });
    expect(self[0]).toMatchObject({ kind: 'template', checked: true });
    const next = applyWriteback(p, [...items, ...self]);
    expect(next.basic.ethnicity).toBe('汉族');
    expect(next.custom?.find((c) => c.label === '微信号')?.value).toBe('demo_wx');
    expect(next.textTemplates?.[0]).toMatchObject({ kind: 'self-assessment', body: '踏实认真。' });
  });
});

describe('不把工具自己填的值当成“不同”', () => {
  it('专业分类：页面带学历前缀、档案只存后缀 → 视为相同', () => {
    const p = sampleProfile();
    const rec = p.education[0];
    rec.majorCategory = '管理学/工商管理类';
    const items = proposeWriteback(p, [v({ label: '专业分类', id: 'major_category', sectionKey: 'education', section: '教育经历', kind: 'select', text: '本科（普通教育）/ 管理学 / 工商管理类' })], { adapter: iguopinRules, collection: 'education', record: rec as never });
    expect(items).toEqual([]);
  });
  it('日期：页面只到月、档案精确到日 → 视为相同', () => {
    const p = sampleProfile();
    const rec = p.work![0];
    rec.start = '2024-07-15';
    const items = proposeWriteback(p, [v({ label: '在职时间-开始时间', id: 'period_start', sectionKey: 'work', section: '工作/实习经历', kind: 'date', text: '2024-07' })], { adapter: iguopinRules, collection: 'work', record: rec as never });
    expect(items).toEqual([]);
  });
});

describe('自我评价与荣誉（国聘）', () => {
  it('自我评价只用档案文字模板；多段时给出全部候选', () => {
    const p = sampleProfile();
    p.textTemplates = [
      { id: 't1', title: 'A', kind: 'self-assessment', body: '第一段。' },
      { id: 't2', title: 'B', kind: 'self-assessment', body: '第二段。' },
      { id: 't3', title: 'C', kind: 'motivation', body: '动机。' },
    ];
    const f = () => fd({ label: '自我评价', id: 'assessment', sectionKey: 'selfAssessment', section: '自我评价', kind: 'textarea' });
    const plan = buildPlan([f()], { profile: p, adapter: iguopinRules, collection: 'single' });
    expect(plan[0].level).toBe('medium');
    expect(plan[0].candidates?.map((c) => c.value)).toEqual([{ t: 'text', text: '第一段。' }, { t: 'text', text: '第二段。' }]);
    p.textTemplates = [];
    const none = buildPlan([f()], { profile: p, adapter: iguopinRules, collection: 'single' });
    expect(none[0].skipReason).toBe('no-profile-value');
  });
  it('荣誉奖励：级别与等级按选项精确对应', () => {
    const p = sampleProfile();
    const rec = p.honors![0];
    const plan = buildPlan(
      [
        fd({ label: '奖励级别', id: 'level', sectionKey: 'honors', section: '荣誉奖励', kind: 'select' }),
        fd({ label: '获奖等级', id: 'grade', sectionKey: 'honors', section: '荣誉奖励', kind: 'select' }),
      ],
      { profile: p, adapter: iguopinRules, collection: 'honors', record: rec as never },
    );
    expect(plan.map((i) => i.display)).toEqual(['学校级', '二等奖']);
    expect(plan.every((i) => i.level === 'high')).toBe(true);
  });
});
