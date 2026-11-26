import { describe, expect, it, vi } from 'vitest';
import { apiUrl, parseAiImageResult, parseAiResult } from '../../src/core/resume/ai';
import { aiEnumLabels, recognizeImagesWithAi, recognizeWithAi } from '../../src/pages/profile/ai-client';
import { applyParsed } from '../../src/core/resume/apply';
import { emptyProfile } from '../../src/core/profile/empty';
import { parseResumeText } from '../../src/core/resume/parse';

const source = '项目经历\n2024.01-2024.06 数据看板 | 核心成员\n项目介绍：为运营人员提供数据看板。\n项目职责：编写 SQL 并核对报表。\n项目成果：交付 3 张看板。';
const data = { profile: { projects: [{ name: '数据看板', start: '2024-01', duty: '编写 SQL 并核对报表。' }] }, sources: { 'projects.0': source } };

describe('API 简历识别', () => {
  it('规范 Base URL，保留完整接口地址，允许本机 HTTP', () => {
    expect(apiUrl('https://api.example.com/v1/').href).toBe('https://api.example.com/v1/chat/completions');
    expect(apiUrl('http://127.0.0.1:8000/v1/chat/completions').pathname).toBe('/v1/chat/completions');
    expect(() => apiUrl('http://api.example.com')).toThrow('HTTPS');
  });
  it('缺项不编造，已有记录只补空缺，保留 ID 和原值', () => {
    const r = parseAiResult(JSON.stringify(data), source);
    const p = emptyProfile();
    p.projects = [{ id: 'proj-1', name: '数据看板', start: '2024-01', introduction: '本人原文' }];
    applyParsed(p, [], r.records);
    expect(p.projects).toEqual([{ id: 'proj-1', name: '数据看板', start: '2024-01', introduction: '本人原文', duty: '编写 SQL 并核对报表。' }]);
    expect(r.records[0].record).not.toHaveProperty('achievement');
  });
  it('全部内容都不合格时报错：错误枚举、缺失依据、伪造依据、无效 JSON', () => {
    expect(() => parseAiResult(JSON.stringify({ profile: { basic: { gender: 'other' } }, sources: {} }), source)).toThrow('格式');
    expect(() => parseAiResult(JSON.stringify({ ...data, sources: {} }), source)).toThrow('依据');
    expect(() => parseAiResult(JSON.stringify(data), '没有这些经历')).toThrow('依据');
    expect(() => parseAiResult('{invalid', source)).toThrow('JSON');
  });

  it('档案里没有的字段和栏目跳过，记录本身照常填入', () => {
    const r = parseAiResult(JSON.stringify({ ...data, profile: { projects: [{ ...data.profile.projects[0], unsupported: true }], meta: { x: 1 }, attachments: [] } }), source);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].record).not.toHaveProperty('unsupported');
    expect(r.dropped?.join('\n')).toContain('unsupported');
  });

  it('一项不合格只丢这一项，其余照常填入，并说明丢了什么', () => {
    const text = '姓名：张三\n性别：男\n教育经历\n2019.09-2023.06 湖南大学 会计学 本科\n2022.07-2022.09 普华永道 审计实习生';
    const out = {
      profile: { basic: { name: '张三', gender: 'unknown-x' }, education: [{ school: '湖南大学', level: 'bachelor', start: '2019-09' }], work: [{ company: '编造公司', title: '实习生', kind: 'internship', start: '2022-07' }] },
      sources: { 'basic.name': '姓名：张三', 'basic.gender': '性别：男', 'education.0': '2019.09-2023.06 湖南大学 会计学 本科', 'work.0': '编造的经历' },
    };
    const r = parseAiResult(JSON.stringify(out), text);
    expect(r.fields.map((f) => f.path)).toEqual(['basic.name']);
    expect(r.records.map((x) => x.collection)).toEqual(['education']);
    const why = r.dropped?.join('\n') ?? '';
    expect(why).toMatch(/gender.*格式|性别.*格式/);
    expect(why).toMatch(/依据/);
  });

  it('模型常见的写法偏差自动规整：日期写成 2019.09、中文枚举、至今', () => {
    const text = '性别：男\n政治面貌：共青团员\n2019.09-至今 湖南大学 会计学 本科\n2022.07-2022.09 普华永道 审计实习生';
    const out = {
      profile: {
        basic: { gender: '男', politicalStatus: '共青团员' },
        education: [{ school: '湖南大学', level: '本科', start: '2019.09', end: '至今', major: '会计学', isStudentCadre: '是' }],
        work: [{ company: '普华永道', title: '审计实习生', kind: '实习', start: '2022年7月', end: '2022/09' }],
      },
      sources: { 'basic.gender': '性别：男', 'basic.politicalStatus': '政治面貌：共青团员', 'education.0': '2019.09-至今 湖南大学 会计学 本科', 'work.0': '2022.07-2022.09 普华永道 审计实习生' },
    };
    const r = parseAiResult(JSON.stringify(out), text, aiEnumLabels());
    expect(r.fields.map((f) => [f.path, f.value])).toEqual([['basic.gender', 'male'], ['basic.politicalStatus', 'cyl-member']]);
    expect(r.records[0].record).toMatchObject({ level: 'bachelor', start: '2019-09', end: 'present', isStudentCadre: 'yes' });
    expect(r.records[1].record).toMatchObject({ kind: 'internship', start: '2022-07', end: '2022-09' });
    expect(r.dropped ?? []).toEqual([]);
  });

  it('依据和原文只差标点、空格、项目符号时照样认', () => {
    const text = '项目经历\n• 2024.01-2024.06｜数据看板｜核心成员\n项目职责：编写 SQL 并核对报表。';
    const out = { profile: { projects: [{ name: '数据看板', start: '2024-01', duty: '编写 SQL 并核对报表。' }] }, sources: { 'projects.0': '2024.01-2024.06 | 数据看板 | 核心成员 项目职责: 编写SQL并核对报表' } };
    expect(parseAiResult(JSON.stringify(out), text).records).toHaveLength(1);
  });

  it('基本信息的值本身就在原文里时，依据写得不准也认（姓名、邮箱）', () => {
    const text = '张三\nzhangsan@example.com';
    const out = { profile: { basic: { name: '张三' }, contact: { email: 'zhangsan@example.com' } }, sources: { 'basic.name': '姓名：张三', 'contact.email': '邮箱 zhangsan@example.com' } };
    expect(parseAiResult(JSON.stringify(out), text).fields.map((f) => f.path)).toEqual(['basic.name', 'contact.email']);
  });

  it('接口不支持 JSON 输出参数（HTTP 400）时去掉该参数重试一次', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const cfg = { endpoint: 'https://api.example.com/v1', apiKey: '', model: 'm' };
    try {
      fetcher.mockResolvedValueOnce(new Response('{"error":{"message":"response_format is not supported"}}', { status: 400 }));
      fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] })));
      expect((await recognizeWithAi(source, cfg, new AbortController().signal)).records).toHaveLength(1);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(JSON.parse(String(fetcher.mock.calls[1][1]!.body))).not.toHaveProperty('response_format');
    } finally { fetcher.mockRestore(); }
  });
  it('请求 JSON 输出并处理正常响应、截断和 HTTP 错误', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const cfg = { endpoint: 'https://api.example.com/v1', apiKey: 'fake-key', model: 'test-model' };
    try {
      fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] })));
      expect((await recognizeWithAi(source, cfg, new AbortController().signal)).records).toHaveLength(1);
      const request = fetcher.mock.calls[0][1]!;
      expect(JSON.parse(String(request.body))).toMatchObject({ response_format: { type: 'json_object' }, messages: [{ role: 'system' }, { role: 'user', content: source }] });
      expect(request.redirect).toBe('error');
      fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'length' }] })));
      await expect(recognizeWithAi(source, cfg, new AbortController().signal)).rejects.toThrow('截断');
      fetcher.mockResolvedValueOnce(new Response('private provider error', { status: 401 }));
      await expect(recognizeWithAi(source, cfg, new AbortController().signal)).rejects.toThrow('401');
    } finally { fetcher.mockRestore(); }
  });
  it('截图识别：依据在模型转写的文字或本人补充文字里核对，缺转写时拒绝', () => {
    const shot = { text: '姓名 林若溪\n民族 汉族', profile: { basic: { name: '林若溪', ethnicity: '汉族' }, contact: { email: 'lin@example.com' } }, sources: { 'basic.name': '姓名 林若溪', 'basic.ethnicity': '民族 汉族', 'contact.email': '邮箱 lin@example.com' } };
    const r = parseAiImageResult(JSON.stringify(shot), '邮箱 lin@example.com');
    expect(r.text).toBe('姓名 林若溪\n民族 汉族');
    expect(r.result.fields.map((f) => f.path)).toEqual(['basic.name', 'basic.ethnicity', 'contact.email']);
    // 邮箱只在补充文字里：没有补充文字时只丢邮箱这一项，其余照常
    const partial = parseAiImageResult(JSON.stringify(shot), '');
    expect(partial.result.fields.map((f) => f.path)).toEqual(['basic.name', 'basic.ethnicity']);
    expect(partial.result.dropped?.join('')).toContain('依据');
    expect(() => parseAiImageResult(JSON.stringify({ ...shot, sources: {}, profile: { basic: { gender: '男' } } }), '', aiEnumLabels())).toThrow('依据');
    expect(() => parseAiImageResult(JSON.stringify({ ...shot, text: '' }), '邮箱 lin@example.com')).toThrow('转写');
  });
  it('截图识别：图片以 image_url 发送，补充文字一并发送', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const cfg = { endpoint: 'https://api.example.com/v1', apiKey: '', model: 'vision-model' };
    const shot = { text: '姓名 林若溪', profile: { basic: { name: '林若溪' } }, sources: { 'basic.name': '姓名 林若溪' } };
    try {
      fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(shot) } }] })));
      const r = await recognizeImagesWithAi(['data:image/png;base64,AAAA'], '身高 165', cfg, new AbortController().signal);
      expect(r.result.fields).toHaveLength(1);
      const body = JSON.parse(String(fetcher.mock.calls[0][1]!.body));
      expect(body.messages[1].content).toEqual([{ type: 'text', text: expect.stringContaining('身高 165') }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }]);
      await expect(recognizeImagesWithAi(['https://example.com/a.png'], '', cfg, new AbortController().signal)).rejects.toThrow('图片');
      await expect(recognizeImagesWithAi([], '', cfg, new AbortController().signal)).rejects.toThrow('截图');
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { fetcher.mockRestore(); }
  });
  it('本地规则分别抽取项目介绍、职责和成果', () => {
    const r = parseResumeText(source);
    expect(r.records[0].record).toMatchObject({ name: '数据看板', introduction: '为运营人员提供数据看板。', duty: '编写 SQL 并核对报表。', achievement: '交付 3 张看板。' });
  });
  it('明确教育字段可抽取，课程不吞掉下一行', () => {
    const r = parseResumeText('教育经历\n2020.09-2024.06 北京大学 | 计算机科学与技术 | 本科\n学制：4年 | 是否专升本：否 | 是否有双学位：否 | 是否是学生干部：是\n主修课程：数据结构、数据库\n在校经历：担任班长。');
    expect(r.records[0].record).toMatchObject({ durationYears: 4, isTransferFromJuniorCollege: 'no', hasDoubleDegree: 'no', isStudentCadre: 'yes', mainCourses: ['数据结构', '数据库'], schoolExperience: '担任班长。' });
  });
});
