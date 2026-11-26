// 常见真实版式的简历导入（scripts/make-layout-resumes.mjs 生成，全部虚构）：
// 模板式 PDF（标题带英文副标题、字间空格标题、标题与内容同一行、分栏对齐），表格式 PDF 与 Word。
// 这些版式以前识别不出经历（区块标题认不出）或姓名被认成“姓名”，填不进档案。
import path from 'node:path';
import { expect, externalRequests, test } from './fixtures';

test('模板式 PDF：英文副标题、字间空格标题、左侧标题栏都能识别并填入档案', async ({ context, extensionId, requests }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/profile.html`);
  await page.locator('#resume-file').setInputFiles(path.resolve('tests/resumes/resume-template.pdf'));
  const dlg = page.getByTestId('parse-dialog');
  await expect(dlg).toBeVisible({ timeout: 30_000 });
  for (const t of ['教育经历（1 条）', '工作/实习经历（1 条）', '项目经历（1 条）', '荣誉奖励（1 条）', '长文本模板（1 条）']) await expect(dlg).toContainText(t);
  await dlg.getByTestId('parse-apply').click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('#basic-name')).toHaveValue('张晓雨');
  await expect(page.locator('#education-0-school')).toHaveValue('湖南大学');
  await expect(page.locator('#education-0-major')).toHaveValue('会计学');
  await expect(page.locator('#education-0-level')).toHaveValue('bachelor');
  await expect(page.locator('#work-0-company')).toHaveValue('普华永道中天会计师事务所');
  await expect(page.locator('#work-0-title')).toHaveValue('审计实习生');
  await expect(page.locator('#projects-0-name')).toHaveValue('校园二手交易平台');
  await expect(page.locator('#honors-0-name')).toHaveValue('国家奖学金');
  // 长文本原样保存：中文逗号不被改成英文逗号
  await expect(page.locator('#textTemplates-0-body')).toHaveValue('认真负责，学习能力强，具备良好的沟通能力。');
  expect(externalRequests(requests)).toEqual([]);
});

for (const ext of ['pdf', 'docx'] as const) {
  test(`表格式简历（${ext.toUpperCase()}）：“姓 名 | 王 五”这类表格行识别为个人信息，教育与实习经历不丢`, async ({ context, extensionId, requests }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/profile.html`);
    await page.locator('#resume-file').setInputFiles(path.resolve(`tests/resumes/resume-table.${ext}`));
    const dlg = page.getByTestId('parse-dialog');
    await expect(dlg).toBeVisible({ timeout: 30_000 });
    await expect(dlg).toContainText('教育经历（1 条）');
    await expect(dlg).toContainText('工作/实习经历（1 条）');
    await dlg.getByTestId('parse-apply').click();
    await expect(dlg).toHaveCount(0);
    await expect(page.locator('#basic-name')).toHaveValue('王五');
    await expect(page.locator('#basic-gender')).toHaveValue('male');
    await expect(page.locator('#basic-birthDate')).toHaveValue('1999-05');
    await expect(page.locator('#basic-ethnicity')).toHaveValue('汉族');
    await expect(page.locator('#basic-nativePlace')).toHaveValue('湖南省');
    await expect(page.locator('#basic-nativePlace-city')).toHaveValue('长沙市');
    await expect(page.locator('#sec-education .record')).toHaveCount(1);
    await expect(page.locator('#education-0-school')).toHaveValue('湖南大学');
    await expect(page.locator('#education-0-major')).toHaveValue('会计学');
    await expect(page.locator('#work-0-company')).toHaveValue('普华永道');
    await expect(page.locator('#work-0-title')).toHaveValue('审计实习生');
    await expect(page.locator('#work-0-start')).toHaveValue('2022-07');
    await expect(page.locator('#work-0-end')).toHaveValue('2022-09');
    await expect(page.locator('#work-0-description')).toHaveValue('负责凭证核对；\n协助编制审计底稿。');
    expect(externalRequests(requests)).toEqual([]);
  });
}
