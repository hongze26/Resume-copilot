import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adapterFor } from '../../src/adapters/registry';
import { isZhilianUrl, zhilianRules } from '../../src/adapters/zhilian/rules';
import { moneyAliases } from '../../src/core/normalize/dicts';
import { buildPlan, rankPercent } from '../../src/core/plan/plan';
import type { Profile } from '../../src/core/profile/types';
import { fd, sampleProfile } from './helpers';

describe('智联校园适配器', () => {
  it('只认 xiaoyuan.zhaopin.com 的简历页', () => {
    expect(isZhilianUrl('https://xiaoyuan.zhaopin.com/scrd/resume2?cid=1&pid=2')).toBe(true);
    expect(isZhilianUrl('https://xiaoyuan.zhaopin.com/')).toBe(false);
    expect(isZhilianUrl('https://zhaopin.sdhsg.com/#/resume/baseinfo')).toBe(false);
    expect(adapterFor('https://xiaoyuan.zhaopin.com/scrd/resume2').id).toBe('zhilian');
  });

  it('按 label[for] 字段名对应：政治面貌“中共党员（含预备党员）”同时接受党员与预备党员', () => {
    const opts = ['团员', '中共党员（含预备党员）', '民主党派', '无党派人士', '群众'];
    for (const status of ['cpc-member', 'cpc-probationary'] as const) {
      const p = sampleProfile();
      p.basic.politicalStatus = status;
      const [it0] = buildPlan([fd({ label: '政治面貌', id: 'politics_bg', sectionKey: 'basic', section: '个人信息', kind: 'select', options: opts })], { profile: p, adapter: zhilianRules });
      expect(it0.level).toBe('high');
      expect(it0.display).toBe('中共党员（含预备党员）');
    }
  });

  it('受教育类型：统招 → 全日制统分统招，境外院校 → 海外留学', () => {
    const opts = ['全日制统分统招', '海外留学', '成人教育', '其他'];
    const p = sampleProfile();
    const f = () => fd({ label: '受教育类型', id: 'edu_type', sectionKey: 'education', section: '教育经历', kind: 'select', options: opts });
    expect(buildPlan([f()], { profile: p, adapter: zhilianRules, collection: 'education', record: p.education[0] as never })[0].display).toBe('全日制统分统招');
    const overseas = { ...p.education[1], admissionType: 'non-mainland' };
    expect(buildPlan([f()], { profile: p, adapter: zhilianRules, collection: 'education', record: overseas as never })[0].display).toBe('海外留学');
  });

  it('城市弹窗按 省/市/区 点选；证件类型只选“身份证”；体重没有自定义字段时说明原因', () => {
    const p = sampleProfile();
    const plan = buildPlan(
      [
        fd({ label: '现居住城市', id: 'nowlocated_city', sectionKey: 'basic', section: '个人信息', readonly: true }),
        fd({ label: '证件号码类型', id: 'id_card_type', sectionKey: 'basic', section: '个人信息', kind: 'select' }),
        fd({ label: '体重(kg)', id: 'avoirdupois', sectionKey: 'basic', section: '个人信息' }),
      ],
      { profile: p, adapter: zhilianRules },
    );
    expect(plan.map((x) => x.level)).toEqual(['high', 'high', 'skip']);
    expect(plan[0].value).toEqual({ t: 'cascade', path: ['北京市', '海淀区'] });
    expect(plan[1].display).toBe('身份证');
    expect(plan[2].reasons.join()).toContain('自定义字段');
    p.custom = [{ id: 'w', label: '体重', value: '50' }];
    const [w] = buildPlan([fd({ label: '体重(kg)', id: 'avoirdupois', sectionKey: 'basic', section: '个人信息' })], { profile: p, adapter: zhilianRules });
    expect(w.level).toBe('high');
    expect(w.value).toEqual({ t: 'text', text: '50' });
  });

  it('期望城市多选；技能、语言证书在弹窗里按名称查找；听说读写、月薪、证明人、海外经历', () => {
    const p = JSON.parse(readFileSync(new URL('../resumes/profile-realistic.json', import.meta.url), 'utf8')) as Profile;
    const [city] = buildPlan([fd({ label: '期望工作城市', id: 'desired_city', sectionKey: 'intention', section: '求职意向', readonly: true })], { profile: p, adapter: zhilianRules });
    expect(city.value).toEqual({ t: 'cascade-multi', paths: [['湖南省', '长沙市'], ['上海市'], ['广东省', '深圳市']] });

    const [skill, lv] = buildPlan(
      [
        fd({ label: '技能类型', id: 'skill_type', sectionKey: 'skills', section: '专业技能' }),
        fd({ label: '技能掌握程度', id: 'skill_level', sectionKey: 'skills', section: '专业技能', kind: 'select' }),
      ],
      { profile: p, adapter: zhilianRules, collection: 'skills', record: p.skills![0] as never },
    );
    expect(skill.value).toEqual({ t: 'popup-pick', names: ['Excel'] });
    expect(lv.display).toBe('精通');

    const lang = buildPlan(
      [
        fd({ label: '证书', id: 'certificate', sectionKey: 'languages', section: '语言能力' }),
        fd({ label: '听说能力', id: 'language_skill_listen_say', sectionKey: 'languages', section: '语言能力', kind: 'select' }),
        fd({ label: '读写能力', id: 'language_skill_read_write', sectionKey: 'languages', section: '语言能力', kind: 'select' }),
      ],
      { profile: p, adapter: zhilianRules, collection: 'languages', record: p.languages![0] as never },
    );
    expect(lang[0].value?.t).toBe('popup-pick');
    expect((lang[0].value as { names: string[] }).names).toContain('大学英语六级');
    expect(lang.slice(1).map((x) => x.display)).toEqual(['熟练', '精通']);

    const work = buildPlan(
      [
        fd({ label: '职位月薪(税前)', id: 'salary', sectionKey: 'work', section: '实习/工作经历' }),
        fd({ label: '是否有证明人', id: 'is_references', sectionKey: 'work', section: '实习/工作经历', kind: 'select' }),
      ],
      { profile: p, adapter: zhilianRules, collection: 'work', record: p.work![0] as never },
    );
    expect(work.map((x) => [x.level, x.display])).toEqual([
      ['high', '4000'],
      ['high', '是'],
    ]);

    const ov = (rec: unknown) =>
      buildPlan(
        [
          fd({ label: '是否有海外学习经历', id: 'is_oversea', sectionKey: 'education', section: '教育经历', kind: 'select' }),
          fd({ label: '海外学习经历年限', id: 'oversea_experience', sectionKey: 'education', section: '教育经历' }),
        ],
        { profile: p, adapter: zhilianRules, collection: 'education', record: rec as never },
      );
    expect(ov(p.education[1]).map((x) => [x.level, x.display])).toEqual([
      ['high', '有'],
      ['high', '1年'],
    ]);
    expect(ov(p.education[0])[0].display).toBe('无');
  });

  it('语言能力按语种一条：同一语种多张证书只取一次', () => {
    const recs = [
      { id: 'a', language: '英语', certificate: 'CET4' },
      { id: 'b', language: '英语', certificate: 'CET6' },
      { id: 'c', language: '日语', certificate: 'JLPT N2' },
    ];
    expect(zhilianRules.orderRecords!('languages', recs).map((r) => r.id)).toEqual(['a', 'c']);
  });
});

describe('薪资与排名的选项换算', () => {
  it('月薪写法', () => {
    expect(moneyAliases(8000)).toEqual(expect.arrayContaining(['8000', '8千', '8k']));
    expect(moneyAliases(12000)).toEqual(expect.arrayContaining(['12000', '1.2万', '12k']));
    expect(moneyAliases(0)).toEqual([]);
  });

  it('最低/最高薪资下拉按“千/万”选中', () => {
    const opts = ['1千以下', '7千', '8千', '9千', '1万', '1.1万', '1.2万', '1.3万'];
    const p = sampleProfile();
    const plan = buildPlan(
      [
        fd({ label: '最低薪资', id: 'desired_salary_minimum', sectionKey: 'intention', section: '求职意向', kind: 'select', options: opts }),
        fd({ label: '最高薪资', id: 'desired_salary_maximum', sectionKey: 'intention', section: '求职意向', kind: 'select', options: opts }),
      ],
      { profile: p, adapter: zhilianRules },
    );
    expect(plan.map((x) => [x.level, x.display])).toEqual([
      ['high', '8千'],
      ['high', '1.2万'],
    ]);
  });

  it('排名换算成“前 N%”档位，需本人确认', () => {
    expect(rankPercent('15/180')).toBeCloseTo(8.33, 1);
    expect(rankPercent('前 8%')).toBe(8);
    expect(rankPercent('优秀')).toBeUndefined();
    const opts = ['前5%', '前10%', '前20%', '前30%', '其他'];
    const p = sampleProfile();
    const f = () => fd({ label: '年级排名', id: 'grade_rank', sectionKey: 'education', section: '教育经历', kind: 'select', options: opts });
    const [r] = buildPlan([f()], { profile: p, adapter: zhilianRules, collection: 'education', record: p.education[0] as never });
    expect(r.level).toBe('medium');
    expect(r.candidates?.map((c) => c.display)).toEqual(['前10%']);
    const [r2] = buildPlan([f()], { profile: p, adapter: zhilianRules, collection: 'education', record: { ...p.education[0], rank: '90/100' } as never });
    expect(r2.candidates?.map((c) => c.display)).toEqual(['其他']);
    const [r3] = buildPlan([f()], { profile: p, adapter: zhilianRules, collection: 'education', record: { ...p.education[0], rank: '前10%' } as never });
    expect([r3.level, r3.display]).toEqual(['high', '前10%']);
  });
});
