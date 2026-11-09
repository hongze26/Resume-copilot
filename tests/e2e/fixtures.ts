// Playwright：加载未打包的测试构建（dist-test），记录全部网络请求。
import { test as base, chromium, expect, type BrowserContext, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const FIXTURE = 'http://127.0.0.1:4173';

type Fixtures = {
  context: BrowserContext;
  extensionId: string;
  requests: Request[];
};

export const test = base.extend<Fixtures>({
  requests: async ({}, use) => {
    await use([]);
  },
  context: async ({ requests }, use) => {
    const ext = path.resolve('dist-test');
    const context = await chromium.launchPersistentContext('', {
      // E2E_BROWSER=msedge 用本机 Edge 跑同一套测试；默认 Playwright 自带的 Chromium
      channel: process.env.E2E_BROWSER ?? 'chromium',
      headless: true,
      viewport: { width: 1280, height: 900 },
      locale: 'zh-CN',
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    });
    context.on('request', (r) => requests.push(r));
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await use(new URL(sw.url()).host);
  },
});

export { expect };

export function sampleProfile(): Record<string, unknown> {
  return JSON.parse(readFileSync('schema/sample-profile.json', 'utf8'));
}

/** 在扩展页面里写入档案（等同于在档案管理页导入）。 */
export async function setProfile(context: BrowserContext, extensionId: string, profile: unknown): Promise<void> {
  const p = await context.newPage();
  await p.goto(`chrome-extension://${extensionId}/panel.html?tabId=-1`);
  await p.evaluate(async (prof) => {
    await chrome.storage.local.set({ profile: prof });
  }, profile);
  await p.close();
}

/** 打开夹具页和对应的侧边栏页（侧边栏以普通标签页打开，通过 tabId 绑定目标页）。 */
export async function openWithPanel(context: BrowserContext, extensionId: string, url: string): Promise<{ page: Page; panel: Page; tabId: number }> {
  const page = await context.newPage();
  await page.goto(url);
  const helper = await context.newPage();
  await helper.goto(`chrome-extension://${extensionId}/panel.html?tabId=-1`);
  const tabId = await helper.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url === u)?.id ?? -1;
  }, url);
  await helper.close();
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/panel.html?tabId=${tabId}`);
  await page.bringToFront();
  return { page, panel, tabId };
}

export async function fixtureState(page: Page): Promise<{ saveClicks: number; cancelClicks: number; submitEvents: number; schoolPicks?: number; values: Record<string, Record<string, unknown>>; records: Record<string, Array<Record<string, unknown>>> }> {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __fixture: unknown }).__fixture)));
}

/** 扩展上下文是否向外部发出过请求（只允许扩展自身与本地夹具）。 */
export function externalRequests(requests: Request[]): string[] {
  // 只统计真正的网络请求（http/https/ws）；chrome:// edge:// 等是浏览器自身界面（如 Edge 的下载面板）
  return requests.map((r) => r.url()).filter((u) => /^(https?|wss?):/i.test(u) && !u.startsWith(FIXTURE));
}
