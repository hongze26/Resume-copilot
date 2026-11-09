// 定制适配器：读当前页面结构 → （模拟）大模型生成对应关系 → 复核命名保存 → 用它扫描并填写。
import { expect, FIXTURE, fixtureState, openWithPanel, sampleProfile, setProfile, test } from './fixtures';

const MAP: Record<string, string | null> = {
  姓名: 'basic.name',
  电子邮箱: 'contact.email',
  民族: 'basic.ethnicity',
  政治面貌: 'basic.politicalStatus',
  婚姻状况: 'basic.maritalStatus',
  籍贯: 'basic.nativePlace',
  学历: 'education.level',
  毕业院校: 'education.school',
  工作年限: 'work.start', // 栏目不一致，应被丢弃
  自我评价: 'textTemplates.selfAssessment',
};

test('定制适配器：确认前不发送；只发页面结构；复核命名后可扫描并填写', async ({ context, extensionId }) => {
  const profile = sampleProfile() as { basic: { name: string }; contact: { email: string } };
  await setProfile(context, extensionId, profile);
  let calls = 0;
  let sent = '';
  await context.route(`${FIXTURE}/v1/chat/completions`, async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    sent = body.messages[1].content as string;
    const s = JSON.parse(sent) as { sections: string[]; fields: Array<{ i: number; label: string }> };
    const reply = {
      sections: s.sections.map((t) => ({ title: t, collection: t === '教育经历' ? 'education' : 'single' })),
      fields: s.fields.map((f) => (/证件/.test(f.label) ? { i: f.i, path: null, manual: '证件号由本人填写' } : { i: f.i, path: MAP[f.label.replace(/[（(].*$/, '')] ?? null })),
    };
    await route.fulfill({ json: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(reply) } }] } });
  });

  const { page, panel } = await openWithPanel(context, extensionId, `${FIXTURE}/native/`);
  const bar = panel.getByTestId('adapter-bar');
  await expect(bar).toContainText('通用识别');
  await bar.getByRole('button', { name: /生成定制适配器/ }).click();
  const consent = panel.getByTestId('custom-consent');
  await expect(consent).toBeVisible({ timeout: 30_000 });
  await consent.getByRole('textbox', { name: 'API 地址' }).fill(`${FIXTURE}/v1`);
  await consent.getByRole('textbox', { name: '模型名称' }).fill('fixture-model');
  await consent.getByLabel('API Key').fill('fixture-secret');
  expect(calls).toBe(0);
  await consent.getByRole('button', { name: '确认发送并生成' }).click();

  const review = panel.getByTestId('custom-review');
  await expect(review).toBeVisible({ timeout: 30_000 });
  expect(calls).toBe(1);
  // 只发送页面结构：不含档案内容、不含页面上已有的值
  expect(sent).toContain('电子邮箱');
  expect(sent).not.toContain(profile.basic.name);
  expect(sent).not.toContain(profile.contact.email);
  expect(sent).not.toContain('已有内容');
  await expect(review).toContainText('work.start');
  await expect(review.getByRole('combobox', { name: '个人信息·电子邮箱' })).toHaveValue('contact.email');
  await review.getByRole('textbox', { name: '适配器名称' }).fill('本地测试站');
  await review.getByRole('button', { name: '保存适配器' }).click();

  await expect(bar.getByRole('button', { name: '本地测试站' })).toHaveClass(/chip-active/);
  await panel.locator('#scan').click();
  await expect(panel.locator('#scan')).toHaveText('重新扫描本页', { timeout: 60_000 });
  const basic = panel.locator('.section-card').filter({ hasText: '个人信息' });
  await expect(basic.locator('.form-plan')).toBeVisible();
  await page.bringToFront();
  await basic.getByRole('button', { name: /填写选中的/ }).click();
  await expect(basic.locator('.results')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#mail')).toHaveValue(profile.contact.email);
  await expect(page.locator('#name')).toHaveValue(profile.basic.name);
  await expect(page.locator('#idn')).toHaveValue('');
  expect(await page.evaluate(() => (window as unknown as { __submits?: number }).__submits ?? 0)).toBe(0);

  // 密钥不进本地存储；定义保存在本机
  const local = await panel.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)));
  expect(local).not.toContain('fixture-secret');
  expect(local).toContain('本地测试站');

  // 重命名与删除
  await bar.getByRole('button', { name: '重命名' }).click();
  await panel.getByRole('textbox', { name: '新名称' }).fill('改名后的站');
  await panel.getByRole('button', { name: '确定' }).click();
  await expect(bar.getByRole('button', { name: '改名后的站' })).toBeVisible();
  await bar.getByRole('button', { name: '删除' }).click();
  await panel.locator('dialog').getByRole('button', { name: '删除' }).click();
  await expect(bar.getByRole('button', { name: '改名后的站' })).toHaveCount(0);
  await expect(bar).toContainText('通用识别');
});

test('定制适配器：网站独有字段对应到档案自定义字段；复核时可新建并填写（Element 基本信息页）', async ({ context, extensionId }) => {
  const profile = { ...(sampleProfile() as Record<string, unknown>), custom: [{ id: 'cus-type', label: '应聘人员类型', value: '校园招聘', sensitivity: 'low' }] };
  await setProfile(context, extensionId, profile);
  let sentSystem = '';
  await context.route(`${FIXTURE}/v1/chat/completions`, async (route) => {
    const body = route.request().postDataJSON();
    sentSystem = body.messages[0].content as string;
    const s = JSON.parse(body.messages[1].content as string) as { sections: string[]; fields: Array<{ i: number; label: string }> };
    const reply = {
      sections: s.sections.map((t) => ({ title: t, collection: 'single' })),
      fields: s.fields.map((f) => ({ i: f.i, path: f.label === '应聘人员类型' ? 'custom.cus-type' : f.label === '民族' ? 'basic.ethnicity' : null })),
    };
    await route.fulfill({ json: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(reply) } }] } });
  });

  const { page, panel } = await openWithPanel(context, extensionId, `${FIXTURE}/el1/#/resume/baseinfo`);
  const bar = panel.getByTestId('adapter-bar');
  await bar.getByRole('button', { name: /生成定制适配器/ }).click();
  const consent = panel.getByTestId('custom-consent');
  await expect(consent).toBeVisible({ timeout: 30_000 });
  await expect(consent).toContainText('1 个自定义字段的名称');
  await consent.getByRole('textbox', { name: 'API 地址' }).fill(`${FIXTURE}/v1`);
  await consent.getByRole('textbox', { name: '模型名称' }).fill('fixture-model');
  await consent.getByLabel('API Key').fill('fixture-secret');
  await consent.getByRole('button', { name: '确认发送并生成' }).click();

  const review = panel.getByTestId('custom-review');
  await expect(review).toBeVisible({ timeout: 30_000 });
  // 白名单里有自定义字段的标签，没有它的值
  expect(sentSystem).toContain('custom.cus-type');
  expect(sentSystem).toContain('应聘人员类型');
  expect(sentSystem).not.toContain('校园招聘');
  await expect(review.getByRole('combobox', { name: '基本信息·应聘人员类型' })).toHaveValue('custom.cus-type');

  // 档案里没有“曾用名”：当场新建自定义字段；不填值不能保存
  await review.getByRole('combobox', { name: '基本信息·曾用名' }).selectOption({ label: '＋ 新建自定义字段（档案里没有这一项）' });
  await review.getByRole('textbox', { name: '适配器名称' }).fill('仿山东高速');
  await review.getByRole('button', { name: '保存适配器' }).click();
  await expect(review).toBeVisible();
  await review.getByRole('textbox', { name: '曾用名 的值' }).fill('林小示');
  await review.getByRole('button', { name: '保存适配器' }).click();
  await expect(review).toHaveCount(0);

  const stored = await panel.evaluate(async () => (await chrome.storage.local.get('profile')).profile as { custom: Array<{ label: string; value: string }> });
  expect(stored.custom.map((c) => [c.label, c.value])).toEqual([
    ['应聘人员类型', '校园招聘'],
    ['曾用名', '林小示'],
  ]);

  await panel.click('#scan');
  await expect(panel.locator('#scan')).toHaveText('重新扫描本页', { timeout: 60_000 });
  for (const label of ['应聘人员类型', '曾用名', '民族']) {
    const r = panel.locator('.row').filter({ has: panel.locator('.row-label', { hasText: new RegExp(`^${label}$`) }) }).first();
    await expect(r.locator('.badge').first()).toHaveText('高');
  }
  await page.bringToFront();
  const buttons = panel.getByRole('button', { name: /^填写选中的 [1-9]\d* 项$/ });
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    await buttons.first().click();
    await expect(panel.getByText(/正在填写/)).toHaveCount(0, { timeout: 60_000 });
  }
  const st = await fixtureState(page);
  const base = st.values.base as Record<string, unknown>;
  expect(base.usedName).toBe('林小示');
  expect(base.type).toBe('校园招聘');
  expect(st.saveClicks).toBe(0);
});
