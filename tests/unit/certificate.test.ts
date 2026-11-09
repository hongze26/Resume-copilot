import { describe, expect, it } from 'vitest';
import { iguopinRules } from '../../src/adapters/iguopin/rules';
import { certAliases, certCategoryHints, matchCertLeaves } from '../../src/core/normalize/cert';
import { buildPlan } from '../../src/core/plan/plan';
import { RULES_BY_KEY } from '../../src/core/matcher/semantic';
import { fromPageText, proposeWriteback, type PageFieldValue } from '../../src/core/profile/writeback';
import { fd, sampleProfile } from './helpers';

const leaves = (category: string, names: string[]) => names.map((name) => ({ category, name }));
const ENGLISH = leaves('英语类', ['雅思IELTS', '托福TOEFL', 'GRE', 'GMAT', 'CATTI英语翻译资格证书']);
const ACCOUNTING = leaves('会计类', ['初级会计职称', '中级会计职称', '注册会计师（CPA）', 'ACCA特许公认会计师']);

describe('证书名称匹配', () => {
  it('别名与中英混写：名称一致才算 exact', () => {
    expect(matchCertLeaves(ACCOUNTING, certAliases('初级会计专业技术资格')).exact.map((l) => l.name)).toEqual(['初级会计职称']);
    expect(matchCertLeaves(ACCOUNTING, certAliases('CPA')).exact.map((l) => l.name)).toEqual(['注册会计师（CPA）']);
    expect(matchCertLeaves(ENGLISH, certAliases('IELTS')).exact.map((l) => l.name)).toEqual(['雅思IELTS']);
    expect(matchCertLeaves(ENGLISH, certAliases('GRE')).exact.map((l) => l.name)).toEqual(['GRE']);
    // 去掉“证书/资格证”后缀后相等
    expect(matchCertLeaves(leaves('教育类', ['教师资格证']), certAliases('教师资格证书')).exact).toHaveLength(1);
  });
  it('不同证书不会被当成同一个：中级不等于初级', () => {
    const r = matchCertLeaves(ACCOUNTING, certAliases('中级会计职称'));
    expect(r.exact.map((l) => l.name)).toEqual(['中级会计职称']);
  });
  it('只是包含关系的只作为相近候选', () => {
    const r = matchCertLeaves(ENGLISH, ['CATTI英语翻译']);
    expect(r.exact.map((l) => l.name)).toEqual(['CATTI英语翻译资格证书']); // 去“资格证书”后缀后相等
    const near = matchCertLeaves(leaves('金融类', ['证券从业资格证', '基金从业资格证']), ['证券']);
    expect(near.exact).toEqual([]);
    expect(near.loose.map((l) => l.name)).toEqual(['证券从业资格证']);
    const near2 = matchCertLeaves(leaves('IT类', ['全国计算机等级考试三级']), ['全国计算机等级']);
    expect(near2.exact).toEqual([]);
    expect(near2.loose.map((l) => l.name)).toEqual(['全国计算机等级考试三级']);
  });
  it('优先分类：档案分类在前，其次是常见分类', () => {
    expect(certCategoryHints('CPA')).toEqual(['会计类', '审计类']);
    expect(certCategoryHints('初级会计专业技术资格', '会计类')).toEqual(['会计类']);
    expect(certCategoryHints('某个没见过的证书')).toEqual([]);
  });
});

describe('证书计划（国聘）', () => {
  const field = () => fd({ label: '证书名称', id: 'name', sectionKey: 'certificates', section: '证书信息', kind: 'cascader' });

  it('已取得：生成分类弹窗选择值，含别名与优先分类', () => {
    const p = sampleProfile();
    const rec = p.certificates![0];
    const plan = buildPlan([field()], { profile: p, adapter: iguopinRules, collection: 'certificates', record: rec as never });
    expect(plan[0].level).toBe('high');
    expect(plan[0].value).toMatchObject({ t: 'popup-pick', categories: ['会计类'] });
    expect((plan[0].value as { names: string[] }).names).toContain('初级会计职称');
  });

  it('部分通过/在考：默认不填，说明原因', () => {
    const p = sampleProfile();
    p.certificates = [{ id: 'c2', name: 'CPA', status: 'partial', detail: '会计、税法' }];
    const plan = buildPlan([field()], { profile: p, adapter: iguopinRules, collection: 'certificates', record: p.certificates[0] as never });
    expect(plan[0].level).toBe('skip');
    expect(plan[0].skipReason).toBe('manual');
    expect(plan[0].reasons.join('')).toContain('部分通过');
  });

  it('记录顺序：已取得的在前', () => {
    const recs = [
      { id: 'a', name: 'CPA', status: 'partial' },
      { id: 'b', name: '证券从业资格', status: 'obtained' },
    ];
    expect(iguopinRules.orderRecords!('certificates', recs).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('证书存回档案', () => {
  const v = (text: string): PageFieldValue => ({ ...fd({ label: '证书名称', id: 'name', sectionKey: 'certificates', section: '证书信息', kind: 'cascader' }), text });

  it('页面显示“分类 / 证书”时只取证书名', () => {
    expect(fromPageText(RULES_BY_KEY['certificates.name'], '会计类 / 初级会计职称')?.value).toBe('初级会计职称');
  });
  it('网站名称是档案证书的别名：不提示替换', () => {
    const p = sampleProfile();
    const rec = p.certificates![0];
    expect(proposeWriteback(p, [v('初级会计职称')], { adapter: iguopinRules, collection: 'certificates', record: rec as never })).toEqual([]);
  });
  it('档案没有的证书：新建记录，状态为已取得', () => {
    const p = sampleProfile();
    const items = proposeWriteback(p, [v('金融类 / 证券从业资格证')], { adapter: iguopinRules, collection: 'certificates' });
    expect(items[0]).toMatchObject({ kind: 'new-record', record: { name: '证券从业资格证', status: 'obtained' } });
    expect(items[0].error).toBeUndefined();
  });
});
