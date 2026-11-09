import { describe, expect, it, vi } from 'vitest';
import { apiUrl, parseAiResult } from '../../src/core/resume/ai';
import { recognizeWithAi } from '../../src/pages/profile/ai-client';
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
  it('拒绝未知字段、错误枚举、缺失依据和伪造依据', () => {
    expect(() => parseAiResult(JSON.stringify({ ...data, profile: { projects: [{ ...data.profile.projects[0], unsupported: true }] } }), source)).toThrow('格式');
    expect(() => parseAiResult(JSON.stringify({ profile: { basic: { gender: 'other' } }, sources: {} }), source)).toThrow('格式');
    expect(() => parseAiResult(JSON.stringify({ ...data, sources: {} }), source)).toThrow('依据');
    expect(() => parseAiResult(JSON.stringify(data), '没有这些经历')).toThrow('依据');
    expect(() => parseAiResult('{invalid', source)).toThrow('JSON');
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
  it('本地规则分别抽取项目介绍、职责和成果', () => {
    const r = parseResumeText(source);
    expect(r.records[0].record).toMatchObject({ name: '数据看板', introduction: '为运营人员提供数据看板。', duty: '编写 SQL 并核对报表。', achievement: '交付 3 张看板。' });
  });
  it('明确教育字段可抽取，课程不吞掉下一行', () => {
    const r = parseResumeText('教育经历\n2020.09-2024.06 北京大学 | 计算机科学与技术 | 本科\n学制：4年 | 是否专升本：否 | 是否有双学位：否 | 是否是学生干部：是\n主修课程：数据结构、数据库\n在校经历：担任班长。');
    expect(r.records[0].record).toMatchObject({ durationYears: 4, isTransferFromJuniorCollege: 'no', hasDoubleDegree: 'no', isStudentCadre: 'yes', mainCourses: ['数据结构', '数据库'], schoolExperience: '担任班长。' });
  });
});
