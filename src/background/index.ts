declare const __TEST__: boolean;

// Service Worker：打开侧边栏、按需注入 Content Script。无业务状态（随时可能被浏览器停止）。

async function setupPanel() {
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  void setupPanel();
  if (details.reason === 'install' && !__TEST__) {
    // 首次安装：打开档案管理页，引导建档
    void chrome.runtime.openOptionsPage();
  }
});
chrome.runtime.onStartup.addListener(() => void setupPanel());

// 侧边栏不可用时（部分浏览器）：点击图标打开独立小窗口，功能相同
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel?.open && tab.windowId !== undefined) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    } catch {
      /* 落到小窗口 */
    }
  }
  const url = chrome.runtime.getURL(`panel.html?tabId=${tab.id ?? ''}&popup=1`);
  await chrome.windows.create({ url, type: 'popup', width: 440, height: 820 });
});

// 侧边栏请求注入 Content Script（权限已由侧边栏在用户手势中申请）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.tab) return false; // 只接受扩展页面
  if (msg && msg.type === 'bg/inject' && typeof msg.tabId === 'number') {
    chrome.scripting
      .executeScript({ target: { tabId: msg.tabId, frameIds: [0] }, files: ['content.js'] })
      .then(() => sendResponse({ ok: true }))
      .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  }
  if (msg && msg.type === 'bg/open-profile') {
    void chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

void setupPanel();
