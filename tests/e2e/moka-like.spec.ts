// 自研组件申请表（区块 > 记录 > 表单项，自绘下拉、年 + 月、至今、带候选的搜索框）。
// 默认类名带平台特征，走平台提示；?plain=1 换成中性类名，走没有提示的通用路径。
import { externalRequests, FIXTURE, expect, openWithPanel, sampleProfile, setProfile, test } from './fixtures';
import type { Page } from '@playwright/test';

const MOKA = `${FIXTURE}/moka-like/`;
const PLAIN = `${FIXTURE}/moka-like/?plain=1`;

const row = (panel: Page, section: string, label: string) =>
  panel.locator(`.section-card:has(h2:text-is("${section}"))`).locator('.row').filter({ has: panel.locator('.row-label', { hasText: new RegExp(`^${label}$`) }) }).first();
const level = async (panel: Page, section: string, label: string) => (await row(panel, section, label).locator('.badge').textContent())?.trim();
const values = (page: Page) => page.evaluate(() => (window as unknown as { __fixture: { values: Record<string, unknown>; submits: number } }).__fixture);

async function scan(panel: Page) {
  await panel.click('#scan');
  await expect(panel.getByTestId('generic-result')).toBeVisible({ timeout: 60_000 });
}

async function fillAll(panel: Page) {
  // 逐个点“填写选中的 N 项”（N 为 0 的按钮是禁用的，不点）；每点一个，等它执行完、按钮消失
  const enabled = panel.locator('button:not([disabled])', { hasText: /填写选中的 [1-9]\d* 项/ });
  for (let guard = 0; guard < 30; guard++) {
    const n = await enabled.count();
    if (n === 0) break;
    await enabled.first().click();
    // 执行期间其余“填写”按钮都禁用；执行完这一份的按钮换成结果，其余恢复
    await expect(panel.locator('[data-progress]')).toHaveCount(0, { timeout: 120_000 });
    await expect(enabled).toHaveCount(n - 1, { timeout: 30_000 });
  }
}

interface Diag {
  sections: Array<{ key: string; title: string }>;
  fields: Array<{ section?: string; label: string; kind: string; empty: boolean; hasPresentOption?: boolean }>;
}

async function diagReport(page: Page, panel: Page): Promise<Diag> {
  await panel.locator('details.diag summary').click();
  await page.bringToFront();
  await panel.getByRole('button', { name: '生成诊断报告' }).click();
  const ta = panel.locator('details.diag textarea');
  await expect(ta).toBeVisible({ timeout: 60_000 });
  return JSON.parse(await ta.inputValue()) as Diag;
}

for (const [name, url] of [['平台提示', `${MOKA}?preset=1`], ['没有平台提示', `${PLAIN}&preset=1`]] as const) {
  test(`${name}：网站已勾“至今”、结束年月被拿掉时，仍认成带“至今”的起止时间，不覆盖`, async ({ context, extensionId }) => {
    await setProfile(context, extensionId, sampleProfile());
    const { page, panel } = await openWithPanel(context, extensionId, url);
    expect((await values(page)).values['实习经历#0.起止时间']).toBe('2025-1~至今');
    const report = await diagReport(page, panel);
    const range = report.fields.find((f) => f.section === '实习经历' && f.label === '起止时间');
    expect(range).toMatchObject({ kind: 'date-range', hasPresentOption: true, empty: false });
    await scan(panel);
    await fillAll(panel);
    expect((await values(page)).values['实习经历#0.起止时间']).toBe('2025-1~至今');
  });
}

test('平台提示：页头的搜索框不会变出一个整页区块', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { page, panel } = await openWithPanel(context, extensionId, MOKA);
  const report = await diagReport(page, panel);
  expect(report.sections.map((s) => s.key).filter((k) => k.startsWith('page:'))).toEqual([]);
  expect(report.sections.map((s) => s.title)).toContain('个人信息');
});

test('没有平台提示：同页并排的两份表单按结构分成两条记录，第二份对应档案第二条', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { page, panel } = await openWithPanel(context, extensionId, PLAIN);
  // 本人先在网页上各点一次“添加”
  for (const title of ['教育背景', '实习经历']) await page.locator('.fm-block', { hasText: title }).locator('.add-btn').click();
  await expect(page.locator('.fm-block', { hasText: '教育背景' }).locator('.fm-group')).toHaveCount(2);
  await scan(panel);
  const edu = panel.locator('.section-card:has(h2:text-is("教育背景"))');
  await expect(edu).toContainText('网页上第 N 份表单对应档案第 N 条');
  const rows = edu.locator('.row').filter({ has: panel.locator('.row-label', { hasText: /^学校名称$/ }) });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('.row-value')).toContainText('示例财经大学');
  await expect(rows.nth(1).locator('.row-value')).toContainText('示例商学院大学');
  await fillAll(panel);
  const v = (await values(page)).values;
  expect(v['教育背景#0.学历']).toBe('本科');
  expect(v['教育背景#1.学历']).toBe('硕士研究生');
  expect(v['教育背景#1.学校名称']).toBe('示例商学院大学');
  expect(v['实习经历#0.起止时间']).toBe('2024-7~2024-9');
  expect(v['实习经历#1.起止时间']).toBe('2026-1~至今');
});

test('平台提示：字段名、控件类型、需本人完成的项都读对', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { page, panel } = await openWithPanel(context, extensionId, MOKA);
  await scan(panel);
  await expect(panel.getByTestId('platform-note')).toContainText('Moka');
  await expect(panel.getByTestId('platform-note')).toContainText('先上传简历');
  // 下拉的名称不再是“请选择”，年月不再是“年”“月”
  await expect(panel.locator('.row-label', { hasText: /^(请选择|年|月|\+86)$/ })).toHaveCount(0);
  expect(await level(panel, '个人信息', '姓名')).toBe('高');
  expect(await level(panel, '个人信息', '性别')).toBe('高');
  await expect(row(panel, '个人信息', '性别').locator('.row-value')).toHaveText('女');
  expect(await level(panel, '个人信息', '手机号码')).toBe('高');
  // 日历和省市县面板：需本人完成
  for (const label of ['出生日期 \\(年龄\\)', '籍贯']) {
    expect(await level(panel, '个人信息', label)).toBe('跳过');
    await expect(row(panel, '个人信息', label)).toContainText('需要你自己填');
  }
  // 证件号码永远留给本人；高敏感的政治面貌只在选项完全相等时填
  expect(await level(panel, '个人信息', '证件号码')).toBe('跳过');
  expect(await level(panel, '个人信息', '政治面貌')).toBe('高');
  // 年 + 月合成一个日期；起止 + 至今合成一个时间段
  await expect(row(panel, '教育背景', '就读时间').locator('.row-value')).toContainText('2021');
  await expect(row(panel, '实习经历', '起止时间').locator('.row-value')).toContainText('2024');
  // 亲属区块整块不填；“其他”里的姓名不按本人的填
  await expect(panel.locator('.section-card:has(h2:text-is("直系亲属信息"))')).toContainText('需本人完成');
  expect(await level(panel, '其他', '姓名')).toBe('低');
  // 扫描（含展开下拉读选项）不写入任何值、不留下弹层
  const fx = await values(page);
  expect(Object.values(fx.values).filter((v) => v !== '' && v !== false)).toEqual([]);
  await expect(page.locator('[class*="sd-Dropdown-dropdown"]')).toHaveCount(0);
  // 必填下拉被点开又关上后，网站在控件里显示“必填项未填写”：这句话不能被当成已选的值
  await expect(page.locator('[class*="sd-Input-message"]', { hasText: '必填项未填写' })).toHaveCount(2);
  await expect(row(panel, '个人信息', '性别').locator('.row-value')).toHaveText('女');
});

test('平台提示：下拉、年月、起止、至今、搜索框都能填上；不触发提交', async ({ context, extensionId, requests }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { page, panel } = await openWithPanel(context, extensionId, MOKA);
  await scan(panel);
  await fillAll(panel);
  const fx = await values(page);
  const v = fx.values;
  expect(v['个人信息#0.姓名']).toBe('林示例');
  expect(v['个人信息#0.手机号码']).toBe('13900000000');
  expect(v['个人信息#0.性别']).toBe('女');
  expect(v['个人信息#0.民族']).toBe('汉族');
  expect(v['个人信息#0.政治面貌']).toBe('共青团员');
  // 第一份教育表单对应档案第一条（本科）
  expect(v['教育背景#0.学历']).toBe('本科');
  expect(v['教育背景#0.就读时间']).toBe('2021-9~2025-6');
  // 学校：候选里没有一字不差的，选了最接近的；专业完全相等
  expect(v['教育背景#0.学校名称']).toBe('示例财经大学（主校区）');
  expect(v['教育背景#0.专业名称']).toBe('会计学');
  // 排名 15/180 → 前10%
  expect(v['教育背景#0.专业排名']).toBe('前10%');
  expect(v['实习经历#0.起止时间']).toBe('2024-7~2024-9');
  expect(v['实习经历#0.公司名称']).toContain('示例会计师事务所');
  expect(v['语言能力#0.语言证书']).toBe('CET-6');
  // 需本人完成的项没有动
  for (const k of ['个人信息#0.出生日期 (年龄)', '个人信息#0.籍贯', '个人信息#0.证件号码', '本人承诺#0.本人承诺', '直系亲属信息#0.姓名', '其他#0.姓名']) expect(v[k] ?? '').toBe('');
  // 没有留下搜索文字和弹层；没有触发提交；没有对外请求
  expect(await page.evaluate(() => Array.from(document.querySelectorAll('label[class*="Select-container"] input')).filter((i) => (i as HTMLInputElement).value !== '').length)).toBe(0);
  await expect(page.locator('[class*="sd-Dropdown-dropdown"]')).toHaveCount(0);
  expect(fx.submits).toBe(0);
  expect(externalRequests(requests)).toEqual([]);
  // 学校那一项在结果里提示核对
  await expect(panel.locator('.section-card:has(h2:text-is("教育背景"))')).toContainText('选了最接近的');
});

test('平台提示：多条经历排在同一页，添加一条后第二份表单对应档案第二条', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { page, panel } = await openWithPanel(context, extensionId, MOKA);
  await scan(panel);
  const edu = panel.locator('.section-card:has(h2:text-is("教育背景"))');
  await expect(edu).toContainText('网页上第 N 份表单对应档案第 N 条');
  await edu.getByTestId('inline-add').click();
  await expect(panel.locator('#scan')).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator('[class*="apply-block-"]', { hasText: '教育背景' }).locator('[class*="apply-fields-"]')).toHaveCount(2);
  const rows = panel.locator('.section-card:has(h2:text-is("教育背景"))').locator('.row').filter({ has: panel.locator('.row-label', { hasText: /^学校名称$/ }) });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('.row-value')).toContainText('示例财经大学');
  await expect(rows.nth(1).locator('.row-value')).toContainText('示例商学院大学');
  // 实习第二条到“至今”
  const work = panel.locator('.section-card:has(h2:text-is("实习经历"))');
  await work.getByTestId('inline-add').click();
  await expect(panel.locator('#scan')).toBeEnabled({ timeout: 60_000 });
  await fillAll(panel);
  const v = (await values(page)).values;
  expect(v['教育背景#1.学校名称']).toBe('示例商学院大学');
  expect(v['教育背景#1.学历']).toBe('硕士研究生');
  expect(v['实习经历#1.起止时间']).toBe('2026-1~至今');
});

test('没有平台提示（中性类名、弹层预先渲染）：按结构读字段名，下拉和年月照样能填', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const { page, panel } = await openWithPanel(context, extensionId, PLAIN);
  await scan(panel);
  await expect(panel.getByTestId('platform-note')).toHaveCount(0);
  await expect(panel.locator('.row-label', { hasText: /^(请选择|年|月)$/ })).toHaveCount(0);
  expect(await level(panel, '个人信息', '性别')).toBe('高');
  expect(await level(panel, '个人信息', '出生日期 \\(年龄\\)')).toBe('跳过');
  await fillAll(panel);
  const fx = await values(page);
  const v = fx.values;
  expect(v['个人信息#0.姓名']).toBe('林示例');
  expect(v['个人信息#0.性别']).toBe('女');
  expect(v['个人信息#0.民族']).toBe('汉族');
  expect(v['个人信息#0.最高学历']).toBeTruthy();
  expect(v['个人信息#0.出生日期 (年龄)'] ?? '').toBe('');
  expect(fx.submits).toBe(0);
  expect(await page.evaluate(() => Array.from(document.querySelectorAll('.x-pop')).filter((p) => (p as HTMLElement).style.display !== 'none').length)).toBe(0);
});

test('大模型挑选：默认不出现；打开开关后逐次确认，只发这一项的字段名、值和选项', async ({ context, extensionId }) => {
  const profile = sampleProfile() as { basic: { name: string }; contact: { mobile: string; email: string } };
  await setProfile(context, extensionId, profile);
  let calls = 0;
  let sent = '';
  await context.route(`${FIXTURE}/v1/chat/completions`, async (route) => {
    calls++;
    sent = route.request().postDataJSON().messages[1].content as string;
    const reqs = JSON.parse(sent) as Array<{ i: number; label: string; options: string[] }>;
    // 第一项按选项回答；另外塞一个选项之外的回答和一个不存在的序号，应被丢弃
    const picks = [...reqs.map((r) => ({ i: r.i, option: r.label === '是否全日制' ? '是' : '不在选项里的文字' })), { i: 99, option: '是' }];
    await route.fulfill({ json: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ picks }) } }] } });
  });
  const { page, panel } = await openWithPanel(context, extensionId, MOKA);
  await scan(panel);
  const edu = panel.locator('.section-card:has(h2:text-is("教育背景"))');
  expect(await level(panel, '教育背景', '是否全日制')).toBe('跳过');
  await expect(panel.getByTestId('ai-pick-offer')).toHaveCount(0); // 开关默认关
  await panel.locator('summary', { hasText: '设置' }).click();
  await panel.locator('input[data-setting="aiEnumPick"]').check();
  const offer = panel.getByTestId('ai-pick-offer');
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: '让大模型从选项里挑' }).click();
  const dlg = panel.getByTestId('ai-pick');
  await expect(dlg).toBeVisible();
  const payload = (await dlg.getByTestId('ai-pick-payload').textContent()) ?? '';
  expect(payload).toContain('是否全日制');
  for (const secret of [profile.basic.name, profile.contact.mobile, profile.contact.email]) expect(payload).not.toContain(secret);
  await dlg.getByRole('textbox', { name: 'API 地址' }).fill(`${FIXTURE}/v1`);
  await dlg.getByRole('textbox', { name: '模型名称' }).fill('fixture-model');
  await dlg.getByLabel('API Key').fill('fixture-secret');
  expect(calls).toBe(0); // 确认前不发送
  await dlg.getByRole('button', { name: '确认发送' }).click();
  await expect(dlg).toHaveCount(0, { timeout: 30_000 });
  expect(calls).toBe(1);
  expect(sent).toBe(JSON.stringify(JSON.parse(payload))); // 发出去的就是给用户看的那份
  expect(await level(panel, '教育背景', '是否全日制')).toBe('中');
  await expect(row(panel, '教育背景', '是否全日制')).toContainText('大模型从网页的选项里挑了');
  await edu.getByRole('button', { name: /填写选中/ }).click();
  await expect(panel.locator('[data-progress]')).toHaveCount(0, { timeout: 120_000 });
  expect((await values(page)).values['教育背景#0.是否全日制']).toBe('是');
});

test('定制适配器带页面结构提示：中性类名的页面按提示找区块、记录和字段名；提示可在复核窗口里修改', async ({ context, extensionId }) => {
  await setProfile(context, extensionId, sampleProfile());
  const helper = await context.newPage();
  await helper.goto(`chrome-extension://${extensionId}/panel.html?tabId=-1`);
  await helper.evaluate(async () => {
    const now = new Date().toISOString();
    const hints = { section: '.fm-block', sectionTitle: '.fm-head', group: '.fm-group', item: '.fm-item', title: ':scope > .fm-title', popup: '.x-pop', option: '.x-opt' };
    await chrome.storage.local.set({ customAdapters: [{ id: 'custom-fixture', name: '仿站提示', hosts: ['127.0.0.1:4173'], createdAt: now, updatedAt: now, sections: [], fields: [], hints }] });
  });
  await helper.close();
  const { page, panel } = await openWithPanel(context, extensionId, PLAIN);
  await expect(panel.getByTestId('adapter-bar').getByRole('button', { name: '仿站提示' })).toHaveClass(/chip-active/);
  await scan(panel);
  // 有了“一条记录的容器”提示：多条经历按第 N 份表单对应档案第 N 条
  const edu = panel.locator('.section-card:has(h2:text-is("教育背景"))');
  await expect(edu.getByTestId('inline-add')).toBeVisible();
  expect(await level(panel, '个人信息', '性别')).toBe('高');
  await fillAll(panel);
  const v = (await values(page)).values;
  expect(v['个人信息#0.性别']).toBe('女');
  expect(v['教育背景#0.就读时间']).toBe('2021-9~2025-6');
  // 复核窗口里能看到并修改提示；写错的选择器保存时被丢弃
  await panel.getByRole('button', { name: '编辑对应关系' }).click();
  const review = panel.getByTestId('custom-review');
  await review.getByTestId('custom-hints').locator('summary').click();
  await expect(review.locator('input[data-hint="item"]')).toHaveValue('.fm-item');
  await review.locator('input[data-hint="popup"]').fill('<bad>');
  await review.getByRole('button', { name: '保存适配器' }).click();
  await expect(review).toHaveCount(0);
  const saved = await panel.evaluate(async () => ((await chrome.storage.local.get("customAdapters")).customAdapters as Array<{ hints?: unknown }>)[0].hints);
  expect(saved).toEqual({ section: '.fm-block', sectionTitle: '.fm-head', group: '.fm-group', item: '.fm-item', title: ':scope > .fm-title', option: '.x-opt' });
});
