// 国聘证书信息：分类弹窗里按名称选择证书；找不到名称一致的项时给出相近候选，由本人改选。
import type { Page } from '@playwright/test';
import { expect, FIXTURE, fixtureState, openWithPanel, sampleProfile, setProfile, test } from './fixtures';

const GP = `${FIXTURE}/gp-like/`;

async function scan(panel: Page) {
  await panel.locator('#scan').click();
  await expect(panel.locator('#scan')).toHaveText('重新扫描本页', { timeout: 60_000 });
}

async function prepareAndFill(page: Page, panel: Page, n: number) {
  const cert = panel.locator('[data-section="certificates"]');
  await cert.getByRole('button', { name: new RegExp(`添加并准备第 ${n} 条`) }).click();
  await expect(cert.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
  await page.bringToFront();
  await cert.getByRole('button', { name: /填写选中的/ }).click();
  await expect(cert.locator('.results')).toBeVisible({ timeout: 90_000 });
  return cert;
}

test('证书：档案写“初级会计专业技术资格”，在会计类中选中网站上的“初级会计职称”', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { page, panel } = await openWithPanel(context, extensionId, GP);
  await scan(panel);
  const cert = panel.locator('[data-section="certificates"]');
  await expect(cert).not.toContainText('需本人完成');
  await prepareAndFill(page, panel, 1);
  expect((await fixtureState(page)).values.certificate_more).toMatchObject({ name: ['会计类', '初级会计职称'] });
  await expect(page.locator('#certificate .ant-select-selection-item')).toHaveText('初级会计职称');
  await expect(page.locator('.cascader-modal')).toBeHidden();
  expect((await fixtureState(page)).saveClicks).toBe(0);
});

test('证书：无分类提示时逐个分类查找；只有相近项时列出候选，改选后填写；部分通过的默认不填', async ({ context, extensionId }) => {
  const p = sampleProfile();
  p.certificates = [
    { id: 'c-partial', name: 'CPA', status: 'partial', detail: '会计、税法' },
    { id: 'c-audit', name: '审计师', status: 'obtained' },
    { id: 'c-sec', name: '证券', status: 'obtained' },
  ];
  await setProfile(context, extensionId, p);
  const { page, panel } = await openWithPanel(context, extensionId, GP);
  await scan(panel);
  const cert = panel.locator('[data-section="certificates"]');
  // 已取得的排在前面；部分通过的标注“默认不填”
  await expect(cert.locator('.record').nth(0)).toContainText('审计师');
  await expect(cert.locator('.record').nth(2)).toContainText('CPA（部分通过，默认不填）');

  // 第 1 条“审计师”：没有分类提示，翻遍分类后只选名称一致的一项（不选“国际注册内部审计师CIA”）
  await prepareAndFill(page, panel, 1);
  expect((await fixtureState(page)).values.certificate_more).toMatchObject({ name: ['审计类', '审计师'] });
  await page.locator('#certificate .submit-btn').click();
  await expect(page.locator('#certificate form')).toHaveCount(0);

  // 第 2 条“证券”：没有名称一致的项，列出相近候选，不自动选择
  await scan(panel);
  await prepareAndFill(page, panel, 2);
  await expect(page.locator('.cascader-modal')).toBeHidden();
  expect((await fixtureState(page)).values.certificate_more?.name).toBeFalsy();
  const retry = cert.getByRole('button', { name: '改选“金融类 / 证券从业资格证”' });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect.poll(async () => (await fixtureState(page)).values.certificate_more?.name, { timeout: 30_000 }).toEqual(['金融类', '证券从业资格证']);
  expect((await fixtureState(page)).saveClicks).toBe(1);
});
