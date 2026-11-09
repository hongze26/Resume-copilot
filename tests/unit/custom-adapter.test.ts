import { describe, expect, it } from 'vitest';
import { buildPrompt, customToRules, pageStructure, parseMapping, pathsForCollection, type CustomAdapterDef } from '../../src/adapters/custom';
import { composeRules } from '../../src/adapters/dynamic';
import { buildPlan } from '../../src/core/plan/plan';
import { fd, sampleProfile } from './helpers';

const page = () => [
  fd({ label: '姓名', section: '个人信息', id: 'name' }),
  fd({ label: '联系邮箱', section: '个人信息', id: 'mail', placeholder: 'a@b.com 13812345678' }),
  fd({ label: '证件号码', section: '个人信息' }),
  fd({ label: '学校', section: '教育背景', kind: 'select', options: ['北京大学', '清华大学'] }),
  fd({ label: '工作年限', section: '教育背景' }),
  fd({ label: '隐藏', section: '个人信息', visible: false }),
];

describe('定制适配器：页面结构', () => {
  it('只含结构，不含值；兜底脱敏；不可见字段不发送', () => {
    const s = pageStructure('https://jobs.example.com/apply?id=1', page());
    expect(s.host).toBe('jobs.example.com');
    expect(s.sections).toEqual(['个人信息', '教育背景']);
    expect(s.fields).toHaveLength(5);
    expect(JSON.stringify(s)).not.toContain('13812345678');
    expect(JSON.stringify(s)).not.toContain('a@b.com');
    expect(buildPrompt()).toContain('education.school');
  });
});

describe('定制适配器：校验模型回复', () => {
  it('白名单与栏目一致性；manual；无效输出被丢弃并说明', () => {
    const fields = page();
    const s = pageStructure('https://jobs.example.com/', fields);
    const reply = JSON.stringify({
      sections: [
        { title: '个人信息', collection: 'single' },
        { title: '教育背景', collection: 'education' },
      ],
      fields: [
        { i: 0, path: 'basic.name' },
        { i: 1, path: 'contact.email' },
        { i: 2, path: null, manual: '证件号由本人填写' },
        { i: 3, path: 'education.school' },
        { i: 4, path: 'work.start' }, // 栏目不一致
      ],
    });
    const m = parseMapping('```json\n' + reply + '\n```', s, fields);
    expect(m.sections.map((x) => x.collection)).toEqual(['single', 'education']);
    expect(m.fields.map((f) => f.path ?? f.manual ?? null)).toEqual(['basic.name', 'contact.email', '证件号由本人填写', 'education.school', null]);
    expect(m.dropped.join()).toContain('work.start');
    expect(() => parseMapping('{"sections":[{"title":"个人信息","collection":"single"}],"fields":[{"i":0,"path":"basic.password"}]}', s, fields).dropped).not.toThrow();
    expect(parseMapping('{"sections":[],"fields":[{"i":0,"path":"basic.password"}]}', s, fields).dropped.join()).toContain('白名单');
    expect(() => parseMapping('not json', s, fields)).toThrow(/JSON/);
  });

  it('保存后的定义用于计划：按区块与标签对应，manual 跳过', () => {
    const fields = page();
    const def: CustomAdapterDef = {
      id: 'custom-test',
      name: '测试站',
      hosts: ['jobs.example.com'],
      createdAt: '2026-11-08T00:00:00Z',
      updatedAt: '2026-11-08T00:00:00Z',
      sections: [
        { key: 's0', title: '个人信息', collection: 'single' },
        { key: 's1', title: '教育背景', collection: 'education' },
      ],
      fields: [
        { section: 's0', label: '联系邮箱', id: 'mail', path: 'contact.email' },
        { section: 's0', label: '证件号码', manual: '证件号由本人填写' },
      ],
    };
    const rules = customToRules(def);
    expect(rules.matches('https://jobs.example.com/x')).toBe(true);
    expect(rules.matches('https://other.example.com/x')).toBe(false);
    expect(rules.allowExecute).toBe(true);
    // 扫描时按区块标题对应到页面区块键（标题尾部的“（必填）”等说明忽略）
    const composed = composeRules(rules, [{ key: 't:个人信息', title: '个人信息（必填）' }, { key: 't:教育背景', title: '教育背景' }], def);
    expect(composed.sections.map((s) => [s.key, s.mode, s.collection])).toEqual([['t:个人信息', 'single', 'single'], ['t:教育背景', 'repeat', 'education']]);
    const fs = fields.slice(0, 3).map((f) => ({ ...f, sectionKey: 't:个人信息' }));
    const plan = buildPlan(fs, { profile: sampleProfile(), adapter: composed, collection: 'single' });
    const mail = plan.find((p) => p.label === '联系邮箱')!;
    expect(mail.path).toBe('contact.email');
    expect(mail.level).toBe('high');
    expect(plan.find((p) => p.label === '证件号码')!.skipReason).toBe('manual');
  });
});

describe('定制适配器：对应到档案的自定义字段', () => {
  const custom = [
    { id: 'cus-a', label: '曾用名', value: '张小明', sensitivity: 'medium' as const },
    { id: 'cus-b', label: '档案是否转移', value: '否' },
  ];
  const sitePage = () => [
    fd({ label: '曾用名', section: '基本信息' }),
    fd({ label: '档案是否转移', section: '基本信息', kind: 'radio', options: ['是', '否'] }),
    fd({ label: '兴趣爱好', section: '基本信息', kind: 'textarea' }),
    fd({ label: '学校', section: '教育背景' }),
  ];

  it('发给模型的白名单含自定义字段的标签，不含值', () => {
    const p = buildPrompt(custom);
    expect(p).toContain('custom.cus-a');
    expect(p).toContain('曾用名');
    expect(p).not.toContain('张小明');
    expect(pathsForCollection('single', custom).map((x) => x.path)).toContain('custom.cus-b');
    expect(pathsForCollection('education', custom).map((x) => x.path)).not.toContain('custom.cus-b');
  });

  it('只接受档案中存在的自定义字段，且只用于单项区块', () => {
    const fields = sitePage();
    const s = pageStructure('https://zhaopin.example.com/', fields);
    const reply = JSON.stringify({
      sections: [
        { title: '基本信息', collection: 'single' },
        { title: '教育背景', collection: 'education' },
      ],
      fields: [
        { i: 0, path: 'custom.cus-a' },
        { i: 1, path: 'custom.cus-b' },
        { i: 2, path: 'custom.nope' },
        { i: 3, path: 'custom.cus-a' },
      ],
    });
    const m = parseMapping(reply, s, fields, custom);
    expect(m.fields.map((f) => f.path ?? null)).toEqual(['custom.cus-a', 'custom.cus-b', null, null]);
    expect(m.dropped.join()).toContain('custom.nope');
  });

  it('计划：自定义字段按适配器对应为高置信；档案重新导入后 id 变了按标签找回', () => {
    const def: CustomAdapterDef = {
      id: 'custom-site',
      name: '站点',
      hosts: ['zhaopin.example.com'],
      createdAt: '2026-11-09T00:00:00Z',
      updatedAt: '2026-11-09T00:00:00Z',
      sections: [{ key: 's0', title: '基本信息', collection: 'single' }],
      fields: [
        { section: 's0', label: '曾用名', path: 'custom.cus-a' },
        { section: 's0', label: '档案是否转移', path: 'custom.old-id' },
      ],
    };
    const composed = composeRules(customToRules(def), [{ key: 't:基本信息', title: '基本信息' }], def);
    const fs = sitePage()
      .slice(0, 3)
      .map((f) => ({ ...f, sectionKey: 't:基本信息' }));
    const profile = { ...sampleProfile(), custom };
    const plan = buildPlan(fs, { profile, adapter: composed, collection: 'single' });
    const used = plan.find((p) => p.label === '曾用名')!;
    expect(used.level).toBe('high');
    expect(used.value).toEqual({ t: 'text', text: '张小明' });
    const moved = plan.find((p) => p.label === '档案是否转移')!;
    expect(moved.level).toBe('high');
    expect(moved.value).toMatchObject({ t: 'radio', text: '否' });
    expect(plan.find((p) => p.label === '兴趣爱好')!.level).toBe('low');
  });
});
