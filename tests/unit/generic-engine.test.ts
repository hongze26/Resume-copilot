// 通用引擎的纯函数部分：相似度、平台提示校验、计划侧的防护、大模型挑选的组包与校验。
import { describe, expect, it } from 'vitest';
import { sanitizeCustomDefs } from '../../src/adapters/custom';
import { parsePicks, pickCandidates } from '../../src/core/ai-pick';
import { matchOptions } from '../../src/core/normalize/options';
import { closest, similarity } from '../../src/core/normalize/similar';
import { buildPlan } from '../../src/core/plan/plan';
import { sanitizeHints } from '../../src/core/platform-hints';
import { fd, sampleProfile } from './helpers';

describe('字面相似度', () => {
  it('多出一段括号说明仍然算接近', () => {
    expect(similarity('华东示例大学', '华东示例大学（闵行校区）')).toBeGreaterThanOrEqual(0.6);
    expect(similarity('示例财经大学', '示例财经大学')).toBe(1);
  });
  it('只差一个字的短词不算接近', () => {
    expect(similarity('未婚', '已婚')).toBe(0);
    expect(similarity('男', '女')).toBe(0);
  });
  it('没有达到阈值、或有并列时不挑', () => {
    expect(closest(['英语六级'], ['CET-4', 'CET-6'])).toBeUndefined();
    expect(closest(['示例大学'], ['示例大学东校区', '示例大学西校区'])).toBeUndefined();
    expect(closest(['示例财经大学'], ['示例财经大学（主校区）', '示例财经学院'])?.option).toBe('示例财经大学（主校区）');
  });
});

describe('选项匹配：相似度兜底', () => {
  it('选项完整、没有包含关系时取字面最接近的一项（中）', () => {
    const m = matchOptions(['大学英语六级考试'], ['大学英语四级', '大学英语六级（CET6）考试']);
    expect(m.status).toBe('contains');
    expect(m.status === 'contains' && m.candidates).toEqual(['大学英语六级（CET6）考试']);
  });
  it('高敏感字段（allowContains=false）不走相似度', () => {
    expect(matchOptions(['中共党员'], ['中共预备党员', '群众'], { allowContains: false }).status).toBe('none');
  });
  it('选项只读到一部分时不比相似度', () => {
    expect(matchOptions(['大学英语六级考试'], ['大学英语四级', '大学英语六级（CET6）考试'], { partial: true }).status).toBe('unknown');
  });
  it('明确属于别的取值的选项不参与', () => {
    expect(matchOptions(['示例选项甲乙丙'], ['示例选项甲乙丁'], { excludeAliases: ['示例选项甲乙丁'] }).status).toBe('none');
  });
});

describe('平台提示校验', () => {
  it('只保留已知的键和像选择器的字符串', () => {
    expect(sanitizeHints({ item: ' .a ', title: 5, x: 'y' })).toEqual({ item: '.a' });
    // “>”（子元素）和 :scope 是合法的选择器写法
    expect(sanitizeHints({ title: ':scope > [class*="title-"]' })).toEqual({ title: ':scope > [class*="title-"]' });
    expect(sanitizeHints({ item: '<script>' })).toBeUndefined();
    expect(sanitizeHints({ item: 'a{b}' })).toBeUndefined();
    expect(sanitizeHints({ item: 'x'.repeat(201) })).toBeUndefined();
    expect(sanitizeHints(null)).toBeUndefined();
    expect(sanitizeHints(['.a'])).toBeUndefined();
  });
  it('定制适配器从备份读回时，提示同样过一遍校验', () => {
    const base = { id: 'custom-a', name: '某企业', hosts: ['jobs.example.com'], sections: [{ key: 's0', title: '基本信息', collection: 'single' }], fields: [] };
    expect(sanitizeCustomDefs([{ ...base, hints: { item: '.fm-item', popup: '<b>' } }])[0].hints).toEqual({ item: '.fm-item' });
    expect('hints' in sanitizeCustomDefs([{ ...base, hints: 'x' }])[0]).toBe(false);
  });
});

describe('计划：需本人完成、只读、亲属防护', () => {
  const profile = sampleProfile();
  it('扫描时标了 manualNote 的栏目不出填写计划', () => {
    const [it0] = buildPlan([fd({ label: '出生日期', section: '个人信息', manualNote: '这一栏是日历，请自己在网页上选' })], { profile });
    expect([it0.level, it0.skipReason]).toEqual(['skip', 'manual']);
    expect(it0.reasons).toEqual(['这一栏是日历，请自己在网页上选']);
  });
  it('只读的文字框不尝试写入', () => {
    const [it0] = buildPlan([fd({ label: '民族', section: '个人信息', readonly: true })], { profile });
    expect([it0.level, it0.skipReason]).toEqual(['skip', 'not-supported']);
  });
  it('同一组表单里有“与本人关系”、区块又不是本人信息时，姓名不按本人的填', () => {
    const fields = [fd({ label: '是否有亲属在本集团内工作？', section: '其他', kind: 'select' }), fd({ label: '姓名', section: '其他' }), fd({ label: '与本人关系', section: '其他' })];
    const name = buildPlan(fields, { profile }).find((x) => x.label === '姓名')!;
    expect(name.level).toBe('low');
    expect(name.reasons.join('')).toContain('亲属');
  });
  it('本人信息区块里的姓名不受影响；没有关系栏目时也不受影响', () => {
    const own = buildPlan([fd({ label: '姓名', section: '个人信息' }), fd({ label: '与本人关系', section: '个人信息' })], { profile }).find((x) => x.label === '姓名')!;
    expect(own.level).toBe('high');
    const other = buildPlan([fd({ label: '姓名', section: '其他' })], { profile })[0];
    expect(other.level).not.toBe('low');
  });
});

describe('大模型挑选', () => {
  const profile = sampleProfile();
  const cert = fd({ label: '语言证书', section: '语言能力', kind: 'select', options: ['四级', '专四', '雅思', '其他'], optionsPartial: false });
  const plan = buildPlan([cert], { profile, collection: 'languages', record: profile.languages![0] as never });

  it('选项里没有档案值的枚举字段可以请大模型挑', () => {
    expect([plan[0].level, plan[0].skipReason]).toEqual(['skip', 'no-option']);
    const reqs = pickCandidates(plan, [cert]);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ i: 0, label: '语言证书', options: ['四级', '专四', '雅思', '其他'] });
    expect(reqs[0].value).toBeTruthy();
  });
  it('高敏感字段、禁止名单里的路径、没读全选项的不进候选', () => {
    const item = { ...plan[0] };
    expect(pickCandidates([{ ...item, sensitivity: 'high' }], [cert])).toHaveLength(0);
    expect(pickCandidates([{ ...item, path: 'contact.mobile' }], [cert])).toHaveLength(0);
    expect(pickCandidates([{ ...item, path: 'basic.name' }], [cert])).toHaveLength(0);
    expect(pickCandidates([item], [{ ...cert, optionsPartial: true }])).toHaveLength(0);
    expect(pickCandidates([{ ...item, kind: 'text' }], [cert])).toHaveLength(0);
  });
  it('回复里选项之外的文字、未知序号一律丢弃', () => {
    const reqs = [
      { i: 0, label: '语言证书', value: 'CET6', options: ['CET-4', 'CET-6'] },
      { i: 1, label: '专业排名', value: '15/180', options: ['前10%', '前20%'] },
    ];
    const picks = parsePicks('```json\n{"picks":[{"i":0,"option":"cet-6"},{"i":1,"option":"前5%"},{"i":7,"option":"CET-4"},{"i":1,"option":null}]}\n```', reqs);
    expect([...picks]).toEqual([[0, 'CET-6']]);
    expect(() => parsePicks('不是 JSON', reqs)).toThrow();
    expect(() => parsePicks('{"x":1}', reqs)).toThrow();
  });
});
