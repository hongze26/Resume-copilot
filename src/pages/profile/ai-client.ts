import { AI_PROMPT, apiUrl, parseAiResult, type AiConfig } from '../../core/resume/ai';

/** 唯一外发入口：档案页明确确认发送后调用，不接受网页消息。 */
export async function recognizeWithAi(text: string, config: AiConfig, signal: AbortSignal) {
  const url = apiUrl(config.endpoint);
  if (!config.model.trim()) throw new Error('请填写模型名称');
  if (!text.trim()) throw new Error('请先选择简历文件');
  const response = await fetch(url.href, {
    method: 'POST', credentials: 'omit', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({ model: config.model.trim(), stream: false, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: AI_PROMPT }, { role: 'user', content: text }] }),
  });
  if (!response.ok) throw new Error(`API 请求失败（HTTP ${response.status}）。请检查地址、密钥、模型权限及额度。`);
  const body = await response.json();
  const choice = body.choices?.[0];
  if (choice?.finish_reason === 'length') throw new Error('模型输出被截断，请使用输出额度更大的模型或缩短简历');
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('API 返回空内容或不兼容的格式');
  return parseAiResult(content, text);
}
