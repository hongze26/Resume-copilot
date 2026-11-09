// 与页面里的 Content Script 通信：注入、发送请求、页面刷新后拒绝旧结果。
import { MSG_VERSION, type Request, type Response } from '../../core/messages';
import { state } from './state';

// ---------------- 通信 ----------------

export async function send<T extends Response>(req: Request): Promise<T> {
  if (state.tabId === undefined) throw new Error('没有找到当前标签页');
  const owner = state;
  const revision = owner.pageRevision;
  const r = (await chrome.tabs.sendMessage(state.tabId, req, { frameId: 0 })) as Response | undefined;
  if (owner !== state || revision !== owner.pageRevision) throw new Error('页面已刷新或跳转，请重新扫描');
  if (!r) throw new Error('页面没有响应，请刷新页面后重试');
  if (!r.ok) throw new Error(r.error);
  return r as T;
}

export async function ensureContent(): Promise<void> {
  const adapter = state.adapter!;
  const origins = adapter.origins(state.url);
  // 必须在用户手势内调用；已授权时直接返回 true，不弹窗
  const granted = await chrome.permissions.request({ origins });
  if (!granted) throw new Error('需要允许扩展访问这个网站后才能扫描（只在你点击时读取页面）');
  try {
    await send({ type: 'rc/ping', version: MSG_VERSION });
    return;
  } catch {
    /* 尚未注入 */
  }
  await chrome.scripting.executeScript({ target: { tabId: state.tabId!, frameIds: [0] }, files: ['content.js'] });
  await send({ type: 'rc/ping', version: MSG_VERSION });
}

