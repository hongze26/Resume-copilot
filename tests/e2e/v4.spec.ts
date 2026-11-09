// v0.4：荣誉奖励/自我评价填写、侧边栏不跳回顶部、点页面“保存”后存回档案。
import type { Page } from '@playwright/test';
import { expect, FIXTURE, fixtureState, openWithPanel, sampleProfile, setProfile, test } from './fixtures';

const GP = `${FIXTURE}/gp-like/`;

async function scan(panel: Page) {
  await panel.locator('#scan').click();
  await expect(panel.locator('#scan')).toHaveText('重新扫描本页', { timeout: 60_000 });
}

function rowOf(panel: Page, key: string, label: string) {
  return panel.locator(`[data-section="${key}"] .row`).filter({ has: panel.locator('.row-label', { hasText: label }) });
}

test('荣誉奖励与自我评价：按档案填写，自我评价只插入文字模板', async ({ context, extensionId }) => {
  const p = sampleProfile() as { honors: Array<Record<string, string>>; textTemplates: Array<Record<string, string>> };
  await setProfile(context, extensionId, p);
  const { page, panel } = await openWithPanel(context, extensionId, GP);
  await scan(panel);

  const honors = panel.locator('[data-section="honors"]');
  await expect(honors).not.toContainText('需本人完成');
  await honors.getByRole('button', { name: /添加并准备第 1 条/ }).click();
  await expect(honors.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
  await page.bringToFront();
  await honors.getByRole('button', { name: /填写选中的/ }).click();
  await expect(honors.locator('.results')).toBeVisible({ timeout: 60_000 });
  expect((await fixtureState(page)).values.honors).toMatchObject({ name: p.honors[0].name, level: '学校级', grade: '二等奖', authority: p.honors[0].issuer });
  await expect(page.locator('#issued_on')).toHaveValue('2023-10');

  const self = panel.locator('[data-section="selfAssessment"]');
  await self.getByRole('button', { name: /展开编辑表单/ }).click();
  await expect(self.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
  const row = rowOf(panel, 'selfAssessment', '自我评价');
  await expect(row.locator('.badge').first()).toHaveText('中');
  await row.locator('select').selectOption('0');
  await page.bringToFront();
  await self.getByRole('button', { name: /填写选中的/ }).click();
  await expect(self.locator('.results')).toBeVisible({ timeout: 60_000 });
  expect((await fixtureState(page)).values.assessment).toMatchObject({ assessment: p.textTemplates[0].body });
  expect((await fixtureState(page)).saveClicks).toBe(0);
});

test('点“添加并准备”后侧边栏停在该区块，不跳回顶部', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { panel } = await openWithPanel(context, extensionId, GP);
  await panel.setViewportSize({ width: 380, height: 640 });
  await scan(panel);
  const proj = panel.locator('[data-section="projects"]');
  await proj.scrollIntoViewIfNeeded();
  const before = await panel.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(200);
  const topBefore = (await proj.boundingBox())!.y;
  await proj.getByRole('button', { name: /添加并准备/ }).click();
  await expect(proj.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
  const topAfter = (await proj.boundingBox())!.y;
  expect(await panel.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  expect(Math.abs(topAfter - topBefore)).toBeLessThan(80);
});

test('点页面“保存”后询问存回档案：只写入勾选的项', async ({ context, extensionId }) => {
  const p = sampleProfile() as { work: Array<Record<string, unknown>> };
  // 侧边栏按“最近的在前”绑定第 1 条：开始时间最晚的那条
  const idx = p.work.reduce((best, w, i) => (String(w.start) > String(p.work[best].start) ? i : best), 0);
  delete p.work[idx].companyNature;
  await setProfile(context, extensionId, p);
  const { page, panel } = await openWithPanel(context, extensionId, GP);
  await scan(panel);
  const work = panel.locator('[data-section="work"]');
  await work.getByRole('button', { name: /添加并准备第 1 条/ }).click();
  await expect(work.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
  await rowOf(panel, 'work', '工作内容').locator('select').selectOption('0');
  await page.bringToFront();
  await work.getByRole('button', { name: /填写选中的/ }).click();
  await expect(work.locator('.results')).toBeVisible({ timeout: 90_000 });

  // 用户在页面上手动选“单位性质”，再点保存
  await page.locator('#work .select-company_nature .ant-select-selector').click();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { hasText: /^民营企业$/ }).click();
  await page.locator('#work .submit-btn').click();
  await expect(page.locator('#work form')).toHaveCount(0);

  const dlg = panel.getByTestId('writeback');
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  await expect(dlg).toContainText('单位性质');
  await expect(dlg).toContainText('民营企业');
  await dlg.getByRole('button', { name: '存入档案' }).click();
  await expect(dlg).toHaveCount(0);
  const saved = (await panel.evaluate(async () => (await chrome.storage.local.get('profile')).profile)) as { work: Array<Record<string, unknown>> };
  expect(saved.work[idx].companyNature).toBe('民营企业');
  expect(saved.work[idx].company).toBe(p.work[idx].company);
  expect(saved.work).toHaveLength(p.work.length);
  // 侧边栏自己写的档案不会清空当前扫描结果
  await expect(panel.locator('#scan')).toHaveText('重新扫描本页');
});
