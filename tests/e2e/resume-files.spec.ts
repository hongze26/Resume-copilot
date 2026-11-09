// 真实数据测试简历（tests/resumes/resume-realistic.*）的 PDF 与 Word 版本：导入后识别结果与 txt 版一致，全程本地处理。
import path from 'node:path';
import { expect, externalRequests, test } from './fixtures';

for (const ext of ['pdf', 'docx'] as const) {
  test(`真实数据测试简历（${ext.toUpperCase()}）：导入识别出基本信息、两段教育、两段实习、技能`, async ({ context, extensionId, requests }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/profile.html`);
    await page.locator('#resume-file').setInputFiles(path.resolve(`tests/resumes/resume-realistic.${ext}`));
    const dlg = page.getByTestId('parse-dialog');
    await expect(dlg).toBeVisible({ timeout: 30_000 });
    await expect(dlg).toContainText('教育经历（2 条）');
    for (const t of ['曼彻斯特大学', '湖南大学', '普华永道', '中国建设银行', 'Excel']) await expect(dlg).toContainText(t);
    await dlg.getByTestId('parse-apply').click();
    await expect(dlg).toHaveCount(0);
    await expect(page.locator('#basic-name')).toHaveValue('陈思远');
    await expect(page.locator('#education-0-school')).toHaveValue('曼彻斯特大学');
    await expect(page.locator('#education-1-school')).toHaveValue('湖南大学');
    await expect(page.locator('#sec-work .record')).toHaveCount(2);
    await expect(page.locator('#work-0-company')).toHaveValue(/普华永道中天会计师事务所.*长沙分所/);
    await expect(page.locator('#work-0-end-present')).toBeChecked();
    await expect(page.locator('#sec-skills .record')).toHaveCount(3);
    expect(externalRequests(requests)).toEqual([]);
  });
}

// 全字段测试简历（tests/resumes/resume-full.*）：日期写到日、家庭成员、体重进自定义字段
for (const ext of ['pdf', 'docx'] as const) {
  test(`全字段测试简历（${ext.toUpperCase()}）：日期到日、家庭成员、自定义字段都识别`, async ({ context, extensionId, requests }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/profile.html`);
    await page.locator('#resume-file').setInputFiles(path.resolve(`tests/resumes/resume-full.${ext}`));
    const dlg = page.getByTestId('parse-dialog');
    await expect(dlg).toBeVisible({ timeout: 30_000 });
    await expect(dlg).toContainText('教育经历（2 条）');
    for (const t of ['新加坡国立大学', '武汉大学', '字节跳动', '招商银行', '新东方', '家庭成员', '自定义字段 · 体重(kg)', '林建国']) await expect(dlg).toContainText(t);
    await dlg.getByTestId('parse-apply').click();
    await expect(dlg).toHaveCount(0);
    await expect(page.locator('#basic-name')).toHaveValue('林若溪');
    await expect(page.locator('#education-0-start')).toHaveValue('2023-08-07');
    await expect(page.locator('#education-1-end')).toHaveValue('2023-06-30');
    await expect(page.locator('#sec-work .record')).toHaveCount(3);
    await expect(page.locator('#work-0-start')).toHaveValue('2025-01-06');
    await expect(page.locator('#sec-family .record')).toHaveCount(2);
    await expect(page.locator('#sec-skills .record')).toHaveCount(5);
    expect(externalRequests(requests)).toEqual([]);
  });
}
