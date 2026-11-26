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

export type ChatMessage = { role: 'system' | 'user'; content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> };

/** 服务商返回的错误说明（只取 JSON 里的 message，最多 80 字），帮助本人判断是密钥、模型名还是额度问题。 */
async function providerMessage(response: Response): Promise<string> {
  try {
    const j = JSON.parse(await response.text()) as { error?: { message?: unknown } | string; message?: unknown };
    const m = typeof j.error === 'string' ? j.error : typeof j.error?.message === 'string' ? j.error.message : typeof j.message === 'string' ? j.message : '';
    return m ? `：${m.slice(0, 80)}` : '';
  } catch {
    return '';
  }
}

/**
 * 发送一次对话请求，返回模型输出的文字（应为 JSON）。档案页（简历识别）和侧边栏（定制适配器）共用。
 * 有的兼容接口不支持 response_format（返回 400/422）：去掉这个参数再试一次，提示词里已要求只输出 JSON。
 */
export async function postChat(config: AiConfig, messages: ChatMessage[], signal: AbortSignal, truncatedHint = '请使用输出额度更大的模型'): Promise<string> {
  const url = apiUrl(config.endpoint);
  if (!config.model.trim()) throw new Error('请填写模型名称');
  const send = (json: boolean) =>
    fetch(url.href, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      signal,
      headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify({ model: config.model.trim(), stream: false, ...(json ? { response_format: { type: 'json_object' } } : {}), messages }),
    });
  let response = await send(true);
  if (response.status === 400 || response.status === 422) response = await send(false);
  if (!response.ok) throw new Error(`API 请求失败（HTTP ${response.status}${await providerMessage(response)}）。请检查地址、密钥、模型名称、权限及额度。`);
  const body = await response.json();
  const choice = body.choices?.[0];
  if (choice?.finish_reason === 'length') throw new Error(`模型输出被截断，${truncatedHint}`);
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('API 返回空内容或不兼容的格式');
  return content;
}

/** 发送一次请求，返回模型输出的文字（应为 JSON）。 */
export function chatJson(config: AiConfig, system: string, user: string, signal: AbortSignal): Promise<string> {
  return postChat(config, [{ role: 'system', content: system }, { role: 'user', content: user }], signal, '请换输出额度更大的模型，或先只展开部分区块再生成');
}
