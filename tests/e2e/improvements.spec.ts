import { expect, FIXTURE, externalRequests, fixtureState, openWithPanel, sampleProfile, setProfile, test } from './fixtures';
import path from 'node:path';
import type { Profile } from '../../src/core/profile/types';
import { makeDocx, writeTemp } from './files';

test('标准测试 PDF：教育信息及两段项目完整进入档案，保持本地处理', async ({ context, extensionId, requests }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/profile.html`);
  await page.locator('#resume-file').setInputFiles(path.resolve('tests/resumes/resume-complete.pdf'));
  const preview = page.getByTestId('parse-dialog');
  await expect(preview).toContainText('校园服务数据看板');
  await expect(preview).toContainText('图书借阅分析');
  await page.getByTestId('parse-apply').click();
  await expect(page.locator('#education-0-durationYears')).toHaveValue('4');
  await expect(page.locator('#projects-0-duty')).toHaveValue(/SQL/);
  await expect(page.locator('#projects-1-achievement')).toHaveValue(/分析报告/);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const profile = await page.evaluate(async () => (await chrome.storage.local.get('profile')).profile) as Profile;
  expect(profile.projects).toHaveLength(2);
  expect(profile.education[0].school).toBe('北京大学');
  expect(externalRequests(requests)).toEqual([]);
});

test('API 识别：确认前不发送，结果预览后合并，密钥不进本地档案', async ({ context, extensionId }) => {
  const source = '姓名：周测试\n项目经历\n2024.01-2024.06 数据看板 | 核心成员\n项目职责：编写 SQL 并核对报表。';
  const result = { profile: { basic: { name: '周测试' }, projects: [{ name: '数据看板', start: '2024-01', role: '核心成员', duty: '编写 SQL 并核对报表。' }] }, sources: { 'basic.name': '姓名：周测试', 'projects.0': source.split('\n').slice(2).join('\n') } };
  let calls = 0;
  await context.route(`${FIXTURE}/v1/chat/completions`, async (route) => {
    calls++;
    expect(route.request().postDataJSON().messages[1].content).toContain('周测试');
    await route.fulfill({ json: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] } });
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/profile.html`);
  await page.locator('#resume-file').setInputFiles(writeTemp('ai-input.docx', makeDocx(source.split('\n'))));
  await page.getByTestId('parse-dialog').getByRole('button', { name: '取消', exact: true }).click();
  await page.locator('#ai-settings summary').click();
  await page.getByRole('textbox', { name: 'API 地址', exact: true }).fill(`${FIXTURE}/v1`);
  await page.getByRole('textbox', { name: '模型名称', exact: true }).fill('fixture-model');
  await page.getByLabel('API Key', { exact: true }).fill('fixture-secret');
  await page.getByRole('button', { name: '大模型识别', exact: true }).click();
  await expect(page.getByTestId('ai-consent')).toContainText('127.0.0.1');
  expect(calls).toBe(0);
  await page.getByRole('button', { name: '确认发送并识别' }).click();
  await expect(page.getByTestId('parse-dialog')).toContainText('编写 SQL');
  expect(calls).toBe(1);
  expect(await page.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)))).not.toContain('fixture-secret');
  await page.getByTestId('parse-apply').click();
  await expect(page.locator('#basic-name')).toHaveValue('周测试');
  await expect(page.locator('#projects-0-duty')).toHaveValue('编写 SQL 并核对报表。');
});

test('项目经历：分字段填写，长文本需选择，不自动保存', async ({ context, extensionId }) => {
  const p = sampleProfile();
  p.projects = [{ id: 'proj-demo', name: '数据看板', role: '核心成员', organization: '示例科技', start: '2024-01', end: '2024-06', introduction: '为运营人员提供数据看板。', duty: '编写 SQL 并核对报表。', achievement: '交付 3 张看板。' }];
  await setProfile(context, extensionId, p);
  const { page, panel } = await openWithPanel(context, extensionId, `${FIXTURE}/gp-like/`);
  await panel.locator('#scan').click();
  await expect(panel.locator('#scan')).toHaveText('重新扫描本页', { timeout: 60_000 });
  const section = panel.locator('[data-section="projects"]');
  await section.getByRole('button', { name: /添加并准备/ }).click();
  await expect(section.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
  for (const label of ['项目介绍', '项目职责', '项目成果']) {
    const row = section.locator('.row').filter({ has: panel.locator('.row-label', { hasText: label }) });
    // 档案里只有一段文字时默认选上并勾选
    await expect(row.locator('input[type=checkbox]')).toBeChecked();
    await row.locator('select').selectOption('0');
  }
  await page.bringToFront();
  await section.getByRole('button', { name: /填写选中的/ }).click();
  await expect(section.locator('.results')).toBeVisible({ timeout: 60_000 });
  expect((await fixtureState(page)).values.projects).toMatchObject({ project_name: '数据看板', role: '核心成员', introduction: '为运营人员提供数据看板。', duty: '编写 SQL 并核对报表。', achievement: '交付 3 张看板。' });
  // 结束时间：国聘的“显示框 + 隐藏面板”组合控件
  await expect(page.locator('#period_start')).toHaveValue('2024-01');
  await expect(page.locator('#period_end_input-fe-1601-customization')).toHaveValue('2024-06');
  await expect(section.locator('.results')).not.toContainText('结束时间：');
  expect((await fixtureState(page)).saveClicks).toBe(0);
});

test('结束时间：显示框点不开面板时改用面板输入框，按显示框核验', async ({ context, extensionId }) => {
  const p = sampleProfile();
  p.projects = [{ id: 'proj-demo', name: '数据看板', role: '核心成员', start: '2023-07', end: '2023-10', introduction: '介绍。', duty: '职责。' }];
  await setProfile(context, extensionId, p);
  const { page, panel } = await openWithPanel(context, extensionId, `${FIXTURE}/gp-like/?variant=endfallback`);
  await panel.locator('#scan').click();
  await expect(panel.locator('#scan')).toHaveText('重新扫描本页', { timeout: 60_000 });
  const section = panel.locator('[data-section="projects"]');
  await section.getByRole('button', { name: /添加并准备/ }).click();
  await expect(section.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
  // 同一字段的另一个输入框：说明是合并，而不是“不支持”
  await expect(section.locator('.form-plan')).toContainText('和上一栏是同一项');
  await page.bringToFront();
  await section.getByRole('button', { name: /填写选中的/ }).click();
  await expect(section.locator('.results')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#period_end_input-fe-1601-customization')).toHaveValue('2023-10');
  await expect(page.locator('#period_start')).toHaveValue('2023-07');
});

test('切换标签页保留扫描与选择，后台页面刷新使缓存失效', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const a = await context.newPage();
  await a.goto(`${FIXTURE}/gp-like/?tab=a`);
  const b = await context.newPage();
  await b.goto(`${FIXTURE}/native/?tab=b`);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/panel.html`);
  await a.bringToFront();
  await expect(panel.locator('.site-name')).toContainText('国聘');
  await panel.locator('#scan').evaluate((el: HTMLButtonElement) => el.click());
  await expect(panel.locator('#scan')).toHaveText('重新扫描本页', { timeout: 60_000 });
  const education = panel.locator('[data-section="education"]');
  await education.getByRole('button', { name: /添加并准备/ }).evaluate((el: HTMLButtonElement) => el.click());
  await expect(education.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
  const checkbox = education.locator('.row input[type=checkbox]:checked').first();
  const id = await checkbox.getAttribute('id');
  await checkbox.evaluate((el: HTMLInputElement) => el.click());
  const count = await education.locator('.row input[type=checkbox]:checked').count();
  await b.bringToFront();
  await expect(panel.locator('.site-name')).not.toContainText('国聘');
  await expect(panel.locator('#scan')).toHaveText('扫描本页');
  await a.bringToFront();
  await expect(panel.locator('#scan')).toHaveText('重新扫描本页');
  await expect(education.locator('.form-plan')).toBeVisible();
  expect(await education.locator('.row input[type=checkbox]:checked').count()).toBe(count);
  if (id) await expect(panel.locator(`[id="${id}"]`)).not.toBeChecked();
  await b.bringToFront();
  await a.reload();
  await a.bringToFront();
  await expect(panel.locator('.site-name')).toContainText('国聘');
  await expect(panel.locator('#scan')).toHaveText('扫描本页');
});

test('学校远程搜索：无 loading 的防抖请求返回前，不把空列表当成无匹配', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { page, panel } = await openWithPanel(context, extensionId, `${FIXTURE}/gp-like/?variant=debounced-search`);
  await panel.locator('#scan').click();
  await expect(panel.locator('#scan')).toHaveText('重新扫描本页', { timeout: 60_000 });
  const section = panel.locator('[data-section="education"]');
  await section.getByRole('button', { name: /添加并准备/ }).click();
  await expect(section.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
  await section.getByRole('button', { name: /填写选中的/ }).click();
  await expect(section.locator('.results')).toBeVisible({ timeout: 60_000 });
  expect((await fixtureState(page)).values.education.school).toBe('示例财经大学');
});
test('档案读取较慢时，页面一打开就选的简历文件也会被识别', async ({ context, extensionId }) => {
  await context.addInitScript(() => {
    const local = (globalThis as any).chrome?.storage?.local;
    if (!local) return;
    const get = local.get.bind(local);
    local.get = (...a: unknown[]) => new Promise((r) => setTimeout(() => r(get(...a)), 1500));
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/profile.html`);
  await page.locator('#resume-file').setInputFiles(path.resolve('tests/resumes/resume-complete.pdf'));
  await expect(page.getByTestId('parse-dialog')).toContainText('校园服务数据看板');
});
