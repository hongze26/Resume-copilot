// 为安装说明与使用手册截图（只用虚构示例档案与本地夹具）。
// 前置：npm run build:test && npm run build:fixtures
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = 'docs/images';
mkdirSync(OUT, { recursive: true });
const ext = path.resolve('dist-test');
const server = spawn(process.execPath, ['scripts/serve-fixtures.mjs'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 860 },
  locale: 'zh-CN',
  deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--lang=zh-CN'],
});
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;

  // 1. 扩展管理页：开发者模式（用发布构建 dist/，名称不带“测试构建”）
  {
    const rel = path.resolve('dist');
    const c2 = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 }, locale: 'zh-CN', args: [`--disable-extensions-except=${rel}`, `--load-extension=${rel}`, '--lang=zh-CN'] });
    const ep = await c2.newPage();
    await ep.goto('chrome://extensions/');
    await ep.waitForTimeout(800);
    const toggle = ep.locator('extensions-manager >> extensions-toolbar >> #devMode');
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    await ep.waitForTimeout(600);
    await ep.screenshot({ path: `${OUT}/01-extensions-devmode.png` });
    await c2.close();
  }

  // 2. 档案管理页（载入虚构示例）
  const prof = await ctx.newPage();
  await prof.goto(`chrome-extension://${id}/profile.html`);
  await prof.getByRole('button', { name: '载入示例档案' }).click();
  await prof.locator('dialog').getByRole('button', { name: '替换' }).click();
  await prof.waitForTimeout(400);
  await prof.screenshot({ path: `${OUT}/02-profile.png` });
  await prof.close();

  // 3. 侧边栏：扫描与预览
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 900, height: 860 });
  await page.goto('http://127.0.0.1:4173/gp-like/');
  const helper = await ctx.newPage();
  await helper.goto(`chrome-extension://${id}/panel.html?tabId=-1`);
  const tabId = await helper.evaluate(async () => (await chrome.tabs.query({})).find((t) => t.url?.includes('/gp-like/'))?.id);
  await helper.close();
  const panel = await ctx.newPage();
  await panel.setViewportSize({ width: 420, height: 1100 });
  await panel.goto(`chrome-extension://${id}/panel.html?tabId=${tabId}`);
  await panel.screenshot({ path: `${OUT}/03-panel-start.png` });
  await page.bringToFront();
  await panel.click('#scan');
  await panel.locator('#scan', { hasText: '重新扫描' }).waitFor({ timeout: 60000 });
  await panel.locator('[data-section="education"]').getByRole('button', { name: /添加并准备第 1 条/ }).click();
  await panel.locator('[data-section="education"] .form-plan').waitFor({ timeout: 60000 });
  await panel.locator('[data-section="education"]').scrollIntoViewIfNeeded();
  await panel.locator('[data-section="education"]').screenshot({ path: `${OUT}/04-panel-preview.png` });
  await page.bringToFront();
  await panel.locator('[data-section="education"]').getByRole('button', { name: /填写选中/ }).click();
  await panel.locator('[data-section="education"] .results').waitFor({ timeout: 90000 });
  await panel.locator('[data-section="education"] .exec-bar').last().screenshot({ path: `${OUT}/05-panel-results.png` });
  await page.locator('div.item-section#education').screenshot({ path: `${OUT}/06-page-filled.png` });
  console.log('screenshots saved to', OUT);
} finally {
  await ctx.close();
  server.kill();
}
