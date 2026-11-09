// 非国聘页面（通用识别）：预览确认后才填写；敏感近似标签不命中；冲突对降级。原生控件驱动单独验证。
// 真实 Element UI 上的完整填写流程见 element.spec.ts。
import { externalRequests, FIXTURE, expect, fixtureState, openWithPanel, sampleProfile, setProfile, test } from './fixtures';

const NATIVE = `${FIXTURE}/native/`;

test('通用页面：先预览，高置信默认勾选，确认后才填写', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { page, panel } = await openWithPanel(context, extensionId, NATIVE);
  await panel.click('#scan');
  await expect(panel.locator('.banner-info', { hasText: '通用识别' })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole('button', { name: /填写选中/ }).first()).toBeVisible();
  await expect(page.locator('#name')).toHaveValue(''); // 扫描本身不写入任何值
  const level = async (label: string) => (await panel.locator('.row').filter({ has: panel.locator('.row-label', { hasText: label }) }).first().locator('.badge').textContent())?.trim();
  expect(await level('证件号码（选填）')).not.toBe('高');
  expect(await level('入学/毕业时间')).toBe('低');
  expect(await level('工作年限')).toBe('低');
  expect(await level('籍贯')).toBe('跳过'); // 已有内容，默认不覆盖
  expect(await level('姓名')).toBe('高');
  expect(await page.evaluate(() => (window as unknown as { __submits?: number }).__submits ?? 0)).toBe(0);
});

test('原生控件驱动：文本、原生下拉、单选；不触发提交', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { page, panel, tabId } = await openWithPanel(context, extensionId, NATIVE);
  await panel.click('#scan'); // 注入 Content Script
  await expect(panel.getByTestId('generic-result')).toBeVisible({ timeout: 30_000 });
  const results = await panel.evaluate(async (tid) => {
    const scan = await chrome.tabs.sendMessage(tid, { type: 'rc/scan', version: 1, adapterId: 'generic' }, { frameId: 0 });
    const key = (label: string) => scan.fields.find((f: { label: string }) => f.label.startsWith(label)).key;
    const items = [
      { fieldKey: key('姓名'), label: '姓名', kind: 'text', value: { t: 'text', text: '测试姓名' } },
      { fieldKey: key('婚姻状况'), label: '婚姻状况', kind: 'native-select', value: { t: 'option', text: '未婚' } },
      { fieldKey: key('政治面貌'), label: '政治面貌', kind: 'radio', value: { t: 'radio', text: '共青团员' } },
      { fieldKey: key('学历'), label: '学历', kind: 'native-select', value: { t: 'option', text: '硕士', accept: ['硕士研究生'] } },
    ];
    const r = await chrome.tabs.sendMessage(tid, { type: 'rc/exec', version: 1, runId: 't1', items }, { frameId: 0 });
    return r.results.map((x: { label: string; status: string }) => `${x.label}:${x.status}`);
  }, tabId);
  expect(results).toEqual(['姓名:ok', '婚姻状况:ok', '政治面貌:ok', '学历:ok']);
  await expect(page.locator('#name')).toHaveValue('测试姓名');
  await expect(page.locator('select[name=mar]')).toHaveValue('未婚');
  await expect(page.locator('input[name=pol][value="2"]')).toBeChecked();
  await expect(page.locator('#lvl')).toHaveValue('硕士研究生');
  expect(await page.evaluate(() => (window as unknown as { __submits?: number }).__submits ?? 0)).toBe(0);

});

const EL_LIKE = `${FIXTURE}/el-like/`;

test('通用识别：Element UI 风格页面、文字标题区块、同源/跨域内嵌框架', async ({ context, extensionId, requests }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { panel } = await openWithPanel(context, extensionId, EL_LIKE);
  await panel.click('#scan');
  await expect(panel.getByTestId('generic-result')).toBeVisible({ timeout: 30_000 });
  // 区块标题是普通 div；侧边导航里的同名文字不算
  const secs = await panel.getByTestId('page-sections').textContent();
  for (const t of ['基本信息', '教育经历', '项目经历', '工作经历']) expect(secs).toContain(t);
  const row = (label: string) => panel.locator('.row').filter({ has: panel.locator('.row-label', { hasText: new RegExp(`^${label}$`) }) }).first();
  const level = async (label: string) => (await row(label).locator('.badge').textContent())?.trim();
  // 只有标签与区块吻合（无 id 线索）时为“中”（需确认）；有选项集合等额外证据时为“高”
  const recognized = ['高', '中'];
  expect(recognized).toContain(await level('姓名'));
  await expect(row('姓名').locator('.row-value')).toContainText('林示例');
  expect(recognized).toContain(await level('电子邮箱'));
  expect(await level('性别')).toBe('高'); // Element 单选组，选项“男/女”与性别取值一致
  await expect(row('性别').locator('.row-value')).toHaveText('女');
  expect(await level('民族')).toBe('跳过'); // 已有值（Element 下拉显示在只读输入框里）
  expect(await level('证件号码')).toBe('跳过'); // 禁用
  expect(recognized).toContain(await level('专业名称'));
  // 同源框架里的“工作经历”表单也被识别
  expect(recognized).toContain(await level('单位名称'));
  await expect(row('单位名称').locator('.row-value')).toContainText('示例');
  // 跨域框架只提示，不读取
  await expect(panel.locator('.banner-warn', { hasText: '1 个来自其他网站的内嵌框架' })).toBeVisible();
  expect(externalRequests(requests).filter((u) => !u.startsWith('http://localhost:4173'))).toEqual([]);
});

test('专用适配器在页面上找不到区块时，改用通用识别', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { panel } = await openWithPanel(context, extensionId, `${FIXTURE}/gp-like/other.html`);
  await expect(panel.locator('.site-name')).toContainText('国聘');
  await panel.click('#scan');
  await expect(panel.locator('.banner-info', { hasText: '适配器没有在这个页面上找到' })).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator('.row-label', { hasText: /^姓名$/ }).first()).toBeVisible();
});

test('通用识别：只读展示的区块点“编辑”后扫描填写；经历类记录旁的“编辑”不点，不点保存', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { page, panel } = await openWithPanel(context, extensionId, `${NATIVE}edit-mode.html`);
  await panel.click('#scan');
  await expect(panel.getByTestId('generic-result')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#f-name')).toBeHidden();
  const basic = panel.locator('.section-card', { hasText: '基本信息' });
  await basic.getByRole('button', { name: '点网页上的“编辑”并扫描' }).click();
  await expect(page.locator('#f-name')).toBeVisible();
  const row = (label: string) => panel.locator('.row').filter({ has: panel.locator('.row-label', { hasText: new RegExp(`^${label}$`) }) }).first();
  await expect(row('姓名').locator('.row-value')).toContainText('林示例', { timeout: 30_000 });
  const fill = panel.getByRole('button', { name: /^填写选中的 [1-9]\d* 项$/ }).first();
  await fill.click();
  await expect(panel.getByText(/正在填写/)).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('#f-name')).toHaveValue('林示例');
  const st = (await fixtureState(page)) as unknown as Record<string, number>;
  expect(st.saveClicks).toBe(0);
  expect(st.cancelClicks).toBe(0);
  expect(st.submitEvents).toBe(0);
  expect(st.eduEditClicks).toBe(0);
});
