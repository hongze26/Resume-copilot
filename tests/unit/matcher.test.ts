import { describe, expect, it } from 'vitest';
import { bestMatch } from '../../src/core/matcher/score';
import { buildPlan } from '../../src/core/plan/plan';
import { fd, sampleProfile } from './helpers';

const BASIC = '基本信息';

describe('冲突对', () => {
  it('籍贯与生源地分开', () => {
    expect(bestMatch(fd({ label: '籍贯', section: BASIC, kind: 'cascader' }), 'single').evidence?.rule.key).toBe('basic.nativePlace');
    expect(bestMatch(fd({ label: '生源地', section: BASIC, kind: 'cascader' }), 'single').evidence?.rule.key).toBe('basic.studentOrigin');
  });
  it('“籍贯/生源地”无法区分 → 低置信', () => {
    const plan = buildPlan([fd({ label: '籍贯/生源地', section: BASIC, kind: 'cascader' })], { profile: sampleProfile() });
    expect(plan[0].level).toBe('low');
  });
  it('户籍地址与现居地址', () => {
    expect(bestMatch(fd({ label: '户口所在地', section: BASIC, kind: 'cascader' }), 'single').evidence?.rule.key).toBe('basic.hukou');
    expect(bestMatch(fd({ label: '现居住地', section: BASIC, kind: 'cascader' }), 'single').evidence?.rule.key).toBe('basic.currentResidence');
    // “现户籍所在地”含“现”，户口规则冲突；现居规则也只有包含关系 → 不会高置信
    const plan = buildPlan([fd({ label: '现户籍所在地', section: BASIC, kind: 'cascader' })], { profile: sampleProfile() });
    expect(plan[0].level === 'high').toBe(false);
  });
  it('学历与学位', () => {
    expect(bestMatch(fd({ label: '学历', section: '教育经历', kind: 'select' }), 'education').evidence?.rule.key).toBe('education.level');
    expect(bestMatch(fd({ label: '学位', section: '教育经历', kind: 'select' }), 'education').evidence?.rule.key).toBe('education.degree');
    const plan = buildPlan([fd({ label: '学历学位', section: '教育经历', kind: 'select' })], { profile: sampleProfile(), collection: 'education', record: sampleProfile().education[0] as never });
    expect(plan[0].level).toBe('low');
  });
  it('入学与毕业日期', () => {
    expect(bestMatch(fd({ label: '入学时间', section: '教育经历', kind: 'date' }), 'education').evidence?.rule.key).toBe('education.start');
    expect(bestMatch(fd({ label: '毕业时间', section: '教育经历', kind: 'date' }), 'education').evidence?.rule.key).toBe('education.end');
    const plan = buildPlan([fd({ label: '入学/毕业时间', section: '教育经历', kind: 'date' })], { profile: sampleProfile(), collection: 'education', record: sampleProfile().education[0] as never });
    expect(plan[0].level).toBe('low');
  });
  it('工作年限 / 实习时长：档案中没有对应字段 → 未识别', () => {
    const plan = buildPlan([fd({ label: '工作年限', section: BASIC }), fd({ label: '实习时长', section: BASIC })], { profile: sampleProfile() });
    expect(plan.every((p) => p.level === 'low')).toBe(true);
  });
  it('最高学历 与 某一段学历', () => {
    // 基本信息里的“最高学历”是派生值（中置信）
    const p1 = buildPlan([fd({ label: '最高学历', section: BASIC, kind: 'select', options: ['博士', '硕士', '本科'] })], { profile: sampleProfile() });
    expect(p1[0].path).toBe('derived.highestLevel');
    expect(p1[0].level).toBe('medium');
    // 教育区块内的“最高学历”不能当成这一段的学历
    const p2 = buildPlan([fd({ label: '最高学历', section: '教育经历', kind: 'select', options: ['博士', '硕士', '本科'] })], { profile: sampleProfile(), collection: 'education', record: sampleProfile().education[0] as never });
    expect(p2[0].level === 'high').toBe(false);
  });
  it('毕业院校 / 本科院校', () => {
    expect(bestMatch(fd({ label: '毕业院校', section: '教育经历' }), 'education').evidence?.rule.key).toBe('education.school');
    const plan = buildPlan([fd({ label: '本科院校', section: '教育经历' })], { profile: sampleProfile(), collection: 'education', record: sampleProfile().education[1] as never });
    expect(plan[0].level === 'high').toBe(false);
  });
});

describe('敏感规则', () => {
  it('“证件号码（选填）”等近似标签不会通过打分命中，也不会填写', () => {
    const plan = buildPlan(
      [
        fd({ label: '证件号码（选填）', section: BASIC }),
        fd({ label: '身份证号码', section: BASIC }),
        fd({ label: '身份证号/护照号', section: BASIC }),
      ],
      { profile: sampleProfile() },
    );
    for (const it of plan) expect(it.value).toBeUndefined();
    expect(plan.some((p) => p.level === 'high')).toBe(false);
  });
  it('手机号：近似标签“手机号码（备用）”只有包含关系 → 不匹配', () => {
    const bm = bestMatch(fd({ label: '备用手机号码', section: BASIC }), 'single');
    expect(bm.evidence?.rule.key).not.toBe('contact.mobile');
  });
  it('政治面貌：标签完全相等且选项唯一 → 高置信', () => {
    const plan = buildPlan([fd({ label: '政治面貌', section: BASIC, kind: 'select', options: ['中共党员', '共青团员', '群众'] })], { profile: sampleProfile() });
    expect(plan[0]).toMatchObject({ level: 'high', value: { t: 'option', text: '共青团员' } });
  });
  it('政治面貌：选项只有“团员（含预备）”之类包含关系 → 跳过，不进入中置信', () => {
    const plan = buildPlan([fd({ label: '政治面貌', section: BASIC, kind: 'select', options: ['中共党员', '共青团员（含）', '群众'] })], { profile: sampleProfile() });
    expect(plan[0].level).toBe('skip');
    expect(plan[0].skipReason).toBe('no-option');
  });
  it('婚姻状况：标签“婚姻情况”不完全相等 → 不填', () => {
    const plan = buildPlan([fd({ label: '婚姻情况说明', section: BASIC, kind: 'select', options: ['未婚', '已婚'] })], { profile: sampleProfile() });
    expect(plan[0].value).toBeUndefined();
  });
});

describe('计划生成', () => {
  it('默认不覆盖非空值', () => {
    const plan = buildPlan([fd({ label: '邮箱', section: BASIC, isEmpty: false })], { profile: sampleProfile() });
    expect(plan[0]).toMatchObject({ level: 'skip', skipReason: 'has-value' });
  });
  it('锁定字段跳过', () => {
    const plan = buildPlan([fd({ label: '姓名', section: BASIC, disabled: true })], { profile: sampleProfile() });
    expect(plan[0]).toMatchObject({ level: 'skip', skipReason: 'locked' });
  });
  it('长文本默认中置信、不勾选', () => {
    const p = sampleProfile();
    const plan = buildPlan([fd({ label: '在校经历', section: '教育经历', kind: 'textarea' })], { profile: p, collection: 'education', record: p.education[0] as never });
    expect(plan[0]).toMatchObject({ level: 'medium', longtext: true });
  });
  it('网页要求到日、档案只到月 → 按 1 日补齐先填上（中，可改日）', () => {
    const p = sampleProfile();
    const plan = buildPlan([fd({ label: '最早到岗时间', section: '求职意向', kind: 'date', datePrecision: 'day' })], { profile: p });
    expect(plan[0]).toMatchObject({ level: 'medium', needsDetail: 'day' });
    const v = plan[0].candidates![0].value as { t: string; date: { y: number; m: number; d: number } };
    expect(v.t).toBe('date');
    expect(v.date.d).toBe(1);
  });
  it('档案到日、网页只要求到月 → 截到月，高', () => {
    const p = sampleProfile();
    (p.intention as Record<string, unknown>).earliestStartDate = '2025-07-15';
    const plan = buildPlan([fd({ label: '最早到岗时间', section: '求职意向', kind: 'date', datePrecision: 'month' })], { profile: p });
    expect(plan[0]).toMatchObject({ level: 'high', value: { t: 'date', date: { y: 2025, m: 7 } } });
  });
  it('结束时间为至今且有“至今”选项 → 高置信', () => {
    const p = sampleProfile();
    const rec = p.work![1];
    const plan = buildPlan([fd({ label: '结束时间', id: 'period_end', section: '工作/实习经历', kind: 'date', datePrecision: 'month', hasPresentOption: true })], { profile: p, collection: 'work', record: rec as never });
    expect(plan[0]).toMatchObject({ level: 'high', value: { t: 'date', date: 'present' } });
  });
  it('依赖字段排在前面', () => {
    const p = sampleProfile();
    const plan = buildPlan(
      [fd({ label: '学校名称', section: '教育经历', kind: 'remote-select' }), fd({ label: '学历', section: '教育经历', kind: 'select', options: ['博士', '硕士', '本科'] })],
      { profile: p, collection: 'education', record: p.education[0] as never },
    );
    expect(plan[0].label).toBe('学历');
    expect(plan[0].dependency).toBe(true);
  });
  it('防混填：所有字段取自同一条记录', () => {
    const p = sampleProfile();
    const rec = p.education[1];
    const plan = buildPlan(
      [fd({ label: '学校名称', id: 'school', section: '教育经历', kind: 'remote-select' }), fd({ label: '研究方向', section: '教育经历' })],
      { profile: p, collection: 'education', record: rec as never },
    );
    expect(plan.every((x) => x.recordId === rec.id)).toBe(true);
    expect(plan[0].value).toEqual({ t: 'remote-option', query: '示例商学院大学', accept: ['示例商学院大学'] });
  });
  it('“研究生”歧义选项进入中置信，不会默认写入', () => {
    const p = sampleProfile();
    const plan = buildPlan([fd({ label: '学历', section: '教育经历', kind: 'select', options: ['博士', '研究生', '本科'] })], { profile: p, collection: 'education', record: p.education[1] as never });
    expect(plan[0].level).toBe('medium');
    expect(plan[0].value).toBeUndefined();
    expect(plan[0].candidates?.map((c) => c.display)).toEqual(['研究生']);
  });
});
