// 标签页跟踪：侧边栏绑定哪个标签页、切换标签页时保存/恢复各自的状态、页面跳转后重置。
import { toast } from '../shared/ui';
import { state, setState, pickAdapter, tabStates, scrollPositions, working, resetPageState, initialState, fixedTabId } from './state';
import { render } from './render';

let pendingActivation = false;
let panelWindowId: number | undefined;

export function setPanelWindow(id: number | undefined): void {
  panelWindowId = id;
}

/** 填写进行中切换了标签页：等填写结束、下一次重绘时再切换。 */
export function resumePendingActivation(): void {
  if (pendingActivation && !working()) void activateTab();
}

export async function resolveTab(): Promise<void> {
  let t: chrome.tabs.Tab | undefined;
  try {
    t = fixedTabId !== undefined ? await chrome.tabs.get(fixedTabId) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  } catch {
    t = undefined;
  }
  state.tabId = t?.id;
  // 没有“读取标签页网址”的权限时 url 为空（浏览器的限制）：此时不能当成“没有适配器的网站”处理
  state.url = t?.url ?? t?.pendingUrl ?? '';
  state.urlBlocked = !!t && !state.url;
  state.adapter = pickAdapter(state.url, state.tabId);
}

/** 在用户点击中申请“读取标签页网址”（可选权限，只申请一次）。 */
export async function requestTabAccess(): Promise<void> {
  try {
    const ok = await chrome.permissions.request({ permissions: ['tabs'] });
    if (!ok) {
      toast('没有授权。也可以在这个网页上点一下浏览器工具栏里的“网申助手”图标，临时允许读取当前网页。', 'warn', 7000);
      return;
    }
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error');
    return;
  }
  await resolveTab();
  resetPageState('');
  render();
}

chrome.permissions.onAdded.addListener(() => {
  if (!working()) void resolveTab().then(render);
});

export async function activateTab() {
  if (working()) { pendingActivation = true; return; }
  pendingActivation = false;
  const [tab] = await chrome.tabs.query({ active: true, windowId: panelWindowId });
  if (working()) { pendingActivation = true; return; }
  if (!tab?.id || tab.id === state.tabId) return;
  if (state.tabId !== undefined) {
    tabStates.set(state.tabId, state);
    scrollPositions.set(state.tabId, window.scrollY);
  }
  const previous = state;
  setState(tabStates.get(tab.id) ?? initialState());
  state.profile = previous.profile;
  state.settings = previous.settings;
  state.tabId = tab.id;
  state.url = tab.url ?? tab.pendingUrl ?? '';
  state.urlBlocked = !state.url;
  state.adapter = pickAdapter(state.url, state.tabId);
  render();
  window.scrollTo(0, scrollPositions.get(tab.id) ?? 0);
}

if (fixedTabId === undefined) {
  chrome.tabs.onActivated.addListener((info) => {
    if (info.windowId === panelWindowId) void activateTab();
  });
}
chrome.tabs.onRemoved.addListener((id) => { tabStates.delete(id); scrollPositions.delete(id); });
chrome.tabs.onUpdated.addListener(async (id, info) => {
  if (info.status !== 'loading' && !info.url) return;
  tabStates.delete(id);
  scrollPositions.delete(id);
  if (id !== state.tabId) return;
  {
    const wasScanned = state.scanned;
    const tab = await chrome.tabs.get(id).catch(() => undefined);
    if (state.tabId !== id) return;
    state.url = tab?.url ?? '';
    state.adapter = pickAdapter(state.url, state.tabId);
    resetPageState(wasScanned ? '页面已刷新或跳转：之前的撤销记录已失效，请重新扫描。' : '');
    render();
  }
});

