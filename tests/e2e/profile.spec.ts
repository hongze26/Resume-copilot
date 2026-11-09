// 档案管理页：示例导入、编辑后需重新核对、导出、v0 迁移导入、简历文本提取、删除全部。
import { readFileSync } from 'node:fs';
import { expect, externalRequests, test } from './fixtures';
import { makeDocx, makePdf, writeTemp } from './files';

test.describe('档案管理页', () => {
  test('示例档案、编辑、核对、导出、导入旧版本、删除全部', async ({ context, extensionId, requests }) => {
    const page = await context.newPage();
    page.on('dialog', (d) => void d.accept());
    await page.goto(`chrome-extension://${extensionId}/profile.html`);
    await expect(page.getByTestId('review-state')).toHaveText('未核对');

    // 载入示例
    await page.getByRole('button', { name: '载入示例档案' }).click();
    await page.locator('dialog').getByRole('button', { name: '替换' }).click();
    await expect(page.getByTestId('review-state')).toContainText('已核对');
    await expect(page.locator('#basic-name')).toHaveValue('林示例');
    await expect(page.locator('#sec-education .record')).toHaveCount(2);

    // 编辑后保存 → 需要重新核对
    await page.locator('#basic-name').fill('林示例二');
    await expect(page.locator('.status')).toContainText('有未保存的修改');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByTestId('review-state')).toHaveText('未核对');
    const stored = (await page.evaluate(async () => (await chrome.storage.local.get("profile")).profile)) as { basic: { name: string }; meta: { reviewedAt: string | null } };
    expect(stored.basic.name).toBe('林示例二');
    expect(stored.meta.reviewedAt).toBeNull();

    // 格式错误时拒绝保存并指出位置
    await page.locator('#education-0-start').fill('2021-9');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('#issues')).toContainText('教育经历 第 1 条 · 入学时间');
    await page.locator('#education-0-start').fill('2021-09');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('#issues')).toBeEmpty();

    // 核对
    await page.getByRole('button', { name: '我已核对' }).click();
    await page.locator('dialog').getByRole('button', { name: '我已核对' }).click();
    await expect(page.getByTestId('review-state')).toContainText('已核对');

    // 导出（提示含敏感信息）
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出备份' }).click();
    await page.locator('dialog').getByRole('button', { name: /导出/ }).click();
    const file = await (await dl).path();
    const exported = JSON.parse(readFileSync(file!, 'utf8'));
    expect(exported.basic.name).toBe('林示例二');
    expect(exported.schemaVersion).toBe(1);

    // 导入伪 v0 档案：迁移 + 校验 + 差异预览后替换，迁移后需要重新核对
    const v0 = writeTemp('v0.json', JSON.stringify({ basic: { name: '旧版档案' }, contact: {}, education: [{ id: 'edu-old-1', level: 'bachelor', schoolName: '旧版大学', start: '2019-09' }] }));
    await page.locator('#import-file').setInputFiles(v0);
    await expect(page.locator('dialog')).toContainText('已从旧版本 v0 升级');
    await page.locator('dialog').getByRole('button', { name: '替换' }).click();
    await expect(page.locator('#basic-name')).toHaveValue('旧版档案');
    await expect(page.locator('#education-0-school')).toHaveValue('旧版大学');
    await expect(page.getByTestId('review-state')).toHaveText('未核对');

    // 导入不符合 Schema 的文件被拒绝
    const bad = writeTemp('bad.json', JSON.stringify({ schemaVersion: 1, meta: { createdAt: 'x', updatedAt: 'y' }, basic: {}, contact: {}, education: 'no' }));
    await page.locator('#import-file').setInputFiles(bad);
    await expect(page.locator('#issues')).toContainText('需要修改');
    await expect(page.locator('#basic-name')).toHaveValue('旧版档案');

    // 删除全部（两次确认）
    await page.getByRole('button', { name: '删除全部本地数据' }).click();
    await page.locator('dialog').getByRole('button', { name: '继续' }).click();
    await page.locator('dialog').getByRole('button', { name: '删除全部' }).click();
    await expect(page.locator('#basic-name')).toHaveValue('');
    const after = await page.evaluate(async () => chrome.storage.local.get(null));
    expect(Object.keys(after)).toEqual([]);

    expect(externalRequests(requests)).toEqual([]);
  });

  test('备份包含定制适配器和设置：导出后删除全部，再导入能恢复', async ({ context, extensionId, requests }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/profile.html`);
    await page.getByRole('button', { name: '载入示例档案' }).click();
    await page.locator('dialog').getByRole('button', { name: '替换' }).click();
    await expect(page.getByTestId('review-state')).toContainText('已核对');
    const adapter = {
      id: 'custom-backup-test',
      name: '某企业招聘',
      hosts: ['jobs.example.com'],
      createdAt: '2026-11-09T00:00:00.000Z',
      updatedAt: '2026-11-09T00:00:00.000Z',
      sections: [{ key: 't:个人信息', title: '个人信息', collection: 'single' }],
      fields: [{ section: 't:个人信息', label: '姓名', path: 'basic.name' }],
    };
    await page.evaluate(async (a) => chrome.storage.local.set({ customAdapters: [a], settings: { followPage: false } }), adapter);

    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出备份' }).click();
    await expect(page.locator('dialog')).toContainText('定制适配器');
    await page.locator('dialog').getByRole('button', { name: /导出/ }).click();
    const file = await (await dl).path();
    const exported = JSON.parse(readFileSync(file!, 'utf8'));
    expect(exported.schemaVersion).toBe(1);
    expect(exported['x-backup'].customAdapters).toEqual([adapter]);
    expect(JSON.stringify(exported)).not.toContain('apiKey');

    await page.getByRole('button', { name: '删除全部本地数据' }).click();
    await page.locator('dialog').getByRole('button', { name: '继续' }).click();
    await page.locator('dialog').getByRole('button', { name: '删除全部' }).click();
    expect(Object.keys(await page.evaluate(async () => chrome.storage.local.get(null)))).toEqual([]);

    await page.locator('#import-file').setInputFiles(file!);
    await expect(page.locator('dialog')).toContainText('1 个定制适配器（某企业招聘）');
    await page.locator('dialog').getByRole('button', { name: '替换' }).click();
    await expect(page.locator('#basic-name')).not.toHaveValue('');
    const after = await page.evaluate(async () => chrome.storage.local.get(['customAdapters', 'settings']));
    expect(after.customAdapters).toEqual([adapter]);
    expect((after.settings as { followPage: boolean }).followPage).toBe(false);
    expect(externalRequests(requests)).toEqual([]);
  });

  test('简历原文对照：PDF 与 DOCX 本地提取，选中填入，敏感值高亮', async ({ context, extensionId, requests }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/profile.html`);
    const pdf = writeTemp('resume.pdf', makePdf(['Lin Example', 'Example University of Finance', 'Phone 13900000000', 'GPA 3.52/4.0']));
    await page.locator('#resume-file').setInputFiles(pdf);
    const pre = page.getByTestId('source-pre');
    await expect(pre).toContainText('Example University of Finance', { timeout: 30_000 });
    await expect(pre.locator('mark.sensitive')).toHaveText('13900000000');
    // 提取后自动弹出识别结果；手机号是敏感项，默认不勾选
    const dlg = page.getByTestId('parse-dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('checkbox', { name: '填入手机号' })).not.toBeChecked();
    await dlg.getByRole('button', { name: '取消' }).click();

    // 选中原文中的一段，填入“学校名称”
    await page.getByRole('button', { name: '＋ 添加一条教育经历' }).click();
    await page.locator('#source-search').fill('Example University of Finance');
    await page.locator('#source-search').press('Enter');
    await page.locator('#sec-education .fill-btn').first().click(); // 学历、学位是下拉，第一个“填入”是学校名称
    await expect(page.locator('#education-0-school')).toHaveValue('Example University of Finance');

    const docx = writeTemp('resume.docx', makeDocx(['林示例', '示例财经大学 会计学 本科', '2021.09 - 2025.06']));
    await page.locator('#resume-file').setInputFiles(docx);
    await expect(pre).toContainText('示例财经大学 会计学 本科', { timeout: 30_000 });
    await page.getByTestId('parse-dialog').getByRole('button', { name: '取消' }).click();
    expect(externalRequests(requests)).toEqual([]);
  });

  test('简历自动识别：预览勾选后填入右侧，高亮待核对，保存后可在“已保存内容”中看到', async ({ context, extensionId, requests }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/profile.html`);
    await expect(page.getByTestId('save-info')).toContainText('还没有保存过档案');
    const lines = readFileSync('tests/resumes/resume-standard.txt', 'utf8').split(/\r?\n/);
    await page.locator('#resume-file').setInputFiles(writeTemp('standard.docx', makeDocx(lines)));
    const dlg = page.getByTestId('parse-dialog');
    await expect(dlg).toBeVisible({ timeout: 30_000 });
    await expect(dlg).toContainText('教育经历（2 条）');
    await expect(dlg).toContainText('示例证券股份有限公司');
    // 敏感项默认不勾选，这里手动勾上手机号
    await dlg.getByRole('checkbox', { name: '填入手机号' }).check();
    await dlg.getByTestId('parse-apply').click();
    await expect(dlg).toHaveCount(0);

    await expect(page.locator('#basic-name')).toHaveValue('林示例');
    await expect(page.locator('#basic-gender')).toHaveValue('female');
    await expect(page.locator('#contact-mobile')).toHaveValue('13900000000');
    await expect(page.locator('#basic-name').locator('xpath=ancestor::div[contains(@class,"field")][1]')).toHaveClass(/autofilled/);
    await expect(page.locator('#sec-education .record')).toHaveCount(2);
    await expect(page.locator('#education-0-school')).toHaveValue('示例财经大学');
    await expect(page.locator('#education-1-end-present')).toBeChecked();
    await expect(page.locator('#sec-work .record.autofilled')).toHaveCount(2);
    await expect(page.getByTestId('save-state')).toHaveText('有未保存的修改');

    // 保存：读回核对，显示保存位置
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('#issues')).toBeEmpty();
    await expect(page.getByTestId('save-info')).toContainText('已保存到本机');
    await expect(page.getByTestId('save-info')).toContainText('chrome.storage.local');
    await expect(page.getByTestId('save-info')).toContainText('教育 2 条');
    await expect(page.locator('#sec-work .record.autofilled')).toHaveCount(0);
    const stored = (await page.evaluate(async () => (await chrome.storage.local.get('profile')).profile)) as { basic: { name: string }; meta: { source: string }; work: unknown[] };
    expect(stored.basic.name).toBe('林示例');
    expect(stored.work).toHaveLength(2);
    expect(stored.meta.source).toBe('resume-parse');

    await page.getByTestId('view-saved').click();
    await expect(page.getByTestId('saved-dialog').locator('textarea')).toHaveValue(/示例证券股份有限公司/);
    await page.getByTestId('saved-dialog').getByRole('button', { name: '关闭' }).click();

    // 刷新后仍在（证明存进了存储，不是只在页面上）
    await page.reload();
    await expect(page.locator('#basic-name')).toHaveValue('林示例');
    // 再次导入同一份简历：已有的不重复添加
    await page.locator('#resume-file').setInputFiles(writeTemp('standard.docx', makeDocx(lines)));
    await expect(dlg).toBeVisible({ timeout: 30_000 });
    const existing = dlg.locator('.parse-row', { hasText: '示例财经大学' }).getByRole('checkbox');
    await expect(existing).not.toBeChecked();
    await existing.check();
    await dlg.getByTestId('parse-apply').click();
    await expect(page.locator('#sec-education .record')).toHaveCount(2);
    expect(externalRequests(requests)).toEqual([]);
  });

  test('点“添加一条”不跳回页面顶部，新记录展开并获得焦点', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto(`chrome-extension://${extensionId}/profile.html`);
    const add = page.getByRole('button', { name: '＋ 添加一条工作/实习经历' });
    await add.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(300);
    await add.click();
    const card = page.locator('#sec-work details.record').first();
    await expect(card).toHaveAttribute('open', '');
    await expect(card).toBeInViewport();
    await expect(page.locator('#work-0-kind')).toBeFocused();
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThan(300);
    // 再加一条，前一条的展开状态保持
    await page.getByRole('button', { name: '＋ 添加一条工作/实习经历' }).click();
    await page.getByRole('button', { name: '＋ 添加一条工作/实习经历' }).click();
    await expect(page.locator('#sec-work details.record[open]')).toHaveCount(3);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  });
});
