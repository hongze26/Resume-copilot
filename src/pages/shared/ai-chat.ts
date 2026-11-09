// 扩展页面里调用用户配置的大模型接口（Chat Completions / JSON 输出兼容）。
// 只在用户点击确认后调用；地址与模型保存在本机，密钥只保存在浏览器会话中。
import { apiUrl, type AiConfig } from '../../core/resume/ai';

export async function loadAiConfig(): Promise<AiConfig> {
  const config = (await chrome.storage.local.get('aiConfig')).aiConfig as Partial<AiConfig> | undefined;
  const key = (await chrome.storage.session.get('aiKey')).aiKey as string | undefined;
  return { endpoint: config?.endpoint ?? '', model: config?.model ?? '', apiKey: key ?? '' };
}

export async function saveAiConfig(c: AiConfig): Promise<void> {
  await chrome.storage.local.set({ aiConfig: { endpoint: c.endpoint, model: c.model } });
  await chrome.storage.session.set({ aiKey: c.apiKey });
}

/** 发送一次请求，返回模型输出的文字（应为 JSON）。 */
export async function chatJson(config: AiConfig, system: string, user: string, signal: AbortSignal): Promise<string> {
  const url = apiUrl(config.endpoint);
  if (!config.model.trim()) throw new Error('请填写模型名称');
  const response = await fetch(url.href, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    signal,
    headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({
      model: config.model.trim(),
      stream: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!response.ok) throw new Error(`API 请求失败（HTTP ${response.status}）。请检查地址、密钥、模型权限及额度。`);
  const body = await response.json();
  const choice = body.choices?.[0];
  if (choice?.finish_reason === 'length') throw new Error('模型输出被截断，请换输出额度更大的模型，或先只展开部分区块再生成');
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('API 返回空内容或不兼容的格式');
  return content;
}
