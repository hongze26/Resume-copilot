// 国聘同结构夹具上的 MVP 验收（第二阶段方案 15.3 节）。
import type { Locator, Page } from '@playwright/test';
import { FIXTURE, expect, externalRequests, fixtureState, openWithPanel, sampleProfile, setProfile, test } from './fixtures';

const GP = `${FIXTURE}/gp-like/`;

function section(panel: Page, key: string): Locator {
  return panel.locator(`[data-section="${key}"]`);
}

function row(panel: Page, key: string, label: string | RegExp): Locator {
  return section(panel, key).locator('.row').filter({ has: panel.locator('.row-label', { hasText: label }) });
}

async function levelOf(panel: Page, key: string, label: string | RegExp): Promise<string> {
  return (await row(panel, key, label).first().locator('.badge').textContent())?.trim() ?? '';
}

async function scan(panel: Page) {
  await panel.click('#scan');
  await expect(panel.locator('#scan')).toHaveText(/重新扫描本页/, { timeout: 60_000 });
}

async function openAndPlan(panel: Page, key: string, buttonText: RegExp) {
  await section(panel, key).getByRole('button', { name: buttonText }).click();
  await expect(section(panel, key).locator('.form-plan')).toBeVisible({ timeout: 60_000 });
}

async function exec(page: Page, panel: Page, key: string) {
  await page.bringToFront();
  await section(panel, key).getByRole('button', { name: /填写选中的 \d+ 项/ }).click();
  await expect(section(panel, key).locator('.results')).toBeVisible({ timeout: 90_000 });
}

async function resultsText(panel: Page, key: string): Promise<string[]> {
  return section(panel, key).locator('.results .result').allTextContents();
}

async function pickCandidate(panel: Page, key: string, label: string | RegExp, index = 0) {
  await row(panel, key, label).first().locator('select').selectOption(String(index));
}

async function clickSave(page: Page, sectionId: string) {
  await page.locator(`#${sectionId} .submit-btn`).click();
}

test.describe('国聘同结构夹具', () => {
  test('基本信息：高置信全部写入并核验；中置信须选择；不点保存；无外部请求', async ({ context, extensionId, requests }) => {
    await setProfile(context, extensionId, sampleProfile());
    const { page, panel } = await openWithPanel(context, extensionId, GP);
    await scan(panel);
    await openAndPlan(panel, 'basic', /展开编辑表单/);

    // 锁定字段跳过
    for (const l of ['姓名', '性别', '出生日期', '手机号', '证件类型', '证件号']) expect(await levelOf(panel, 'basic', new RegExp(`^${l}$`))).toBe('跳过');
    // 敏感字段：完全确定才填写
    expect(await levelOf(panel, 'basic', '政治面貌')).toBe('高');
    expect(await levelOf(panel, 'basic', '婚姻状况')).toBe('高');
    // 派生值与日期精度不一致 → 中置信，默认不勾选
    expect(await levelOf(panel, 'basic', '最高学历毕业院校所属地区')).toBe('中');
    expect(await levelOf(panel, 'basic', '最早可参加实习时间')).toBe('中');

    await pickCandidate(panel, 'basic', '最高学历毕业院校所属地区');
    await row(panel, 'basic', '最早可参加实习时间').locator('input[type=date]').fill('2026-12-15');
    await exec(page, panel, 'basic');

    const res = await resultsText(panel, 'basic');
    expect(res.filter((r) => r.includes('：'))).toEqual([]); // 没有失败项
    const st = await fixtureState(page);
    expect(st.values.basic).toMatchObject({
      email: 'sample.applicant@example.com',
      country: '中国',
      location: ['北京市', '北京市', '海淀区'],
      hukou: ['湖南省', '岳阳市', '岳阳楼区'],
      family_home: ['湖南省', '长沙市'],
      nation: '汉族',
      political: '共青团员',
      marriage: '未婚',
      biz_jXdEQlfwRU: '上海',
      contact_name: '林示例父',
      contact_telephone: '13900000001',
    });
    expect(String(st.values.basic.biz_xWrGBR9LjR)).toMatch(/^2026-12-1[45]/);
    // 锁定字段未被改动
    expect(st.values.basic.full_name).toBe('林示例');
    // 验收 6：执行过程中没有点击保存/提交
    expect(st.saveClicks).toBe(0);
    expect(st.submitEvents).toBe(0);

    // 验收 3：由“用户”点保存，表单校验通过，保存的记录与预期一致
    await clickSave(page, 'basic_info');
    await expect.poll(async () => (await fixtureState(page)).records.basic?.length ?? 0).toBe(1);
    const saved = (await fixtureState(page)).records.basic![0];
    expect(saved).toMatchObject({ email: 'sample.applicant@example.com', nation: '汉族', political: '共青团员' });
    // 验收 7：扩展上下文没有任何外部请求
    expect(externalRequests(requests)).toEqual([]);
  });

  test('教育经历两条：按学历顺序、不混填、条件字段、保存后进入下一条、重复执行识别已存在', async ({ context, extensionId, requests }) => {
    const profile = sampleProfile();
    await setProfile(context, extensionId, profile);
    const { page, panel } = await openWithPanel(context, extensionId, GP);
    await scan(panel);
    const edu = section(panel, 'education');
    await expect(edu.locator('.record')).toHaveCount(2);
    await expect(edu.locator('.record').first()).toContainText('本科');

    // 第 1 条：本科
    await openAndPlan(panel, 'education', /添加并准备第 1 条/);
    expect(await levelOf(panel, 'education', /^学历$/)).toBe('高');
    expect(await levelOf(panel, 'education', '在校经历')).toBe('中');
    await pickCandidate(panel, 'education', '在校经历');
    await exec(page, panel, 'education');
    let res = await resultsText(panel, 'education');
    expect(res.filter((r) => r.includes('：'))).toEqual([]);
    await expect(edu).toContainText('是否专升本'); // 新出现的条件字段一并填写
    let v = (await fixtureState(page)).values.education;
    expect(v).toMatchObject({
      education: '本科',
      skip_edu: 'false',
      biz_zsb7Q2: '否',
      biz_sxw9K1: '否',
      biz_sC7kZ73FAM: '统招',
      is_fulltime: 1,
      school: '示例财经大学',
      major_category: '本科（普通教育）/ 管理学 / 工商管理类',
      major: '会计学',
      gpa_score: '3.52/4.0',
      school_system: '4年',
      biz_6TQ8M4OkGL: '是',
      experience: '（虚构示例）担任班级学习委员；参与学院财务知识竞赛组织。',
    });
    await expect(page.locator('#education .ant-picker-range input').nth(0)).toHaveValue('2021-09');
    await expect(page.locator('#education .ant-picker-range input').nth(1)).toHaveValue('2025-06');
    expect((await fixtureState(page)).saveClicks).toBe(0);

    // 用户保存 → 侧边栏检测到保存，进入第 2 条
    await clickSave(page, 'education');
    await expect.poll(async () => (await fixtureState(page)).records.education?.length ?? 0).toBe(1);
    await expect(edu.getByRole('button', { name: /添加并准备第 2 条/ })).toBeVisible({ timeout: 15_000 });
    await expect(edu.locator('.record').first()).toContainText('本次已保存');

    // 第 2 条：硕士（研究方向为条件字段）
    await openAndPlan(panel, 'education', /添加并准备第 2 条/);
    await pickCandidate(panel, 'education', '在校经历');
    await exec(page, panel, 'education');
    res = await resultsText(panel, 'education');
    expect(res.filter((r) => r.includes('：'))).toEqual([]);
    v = (await fixtureState(page)).values.education;
    expect(v).toMatchObject({
      education: '硕士',
      school: '示例商学院大学',
      major_category: '研究生 / 管理学 / 工商管理类',
      major: '会计',
      research: '管理会计与数字化',
      gpa_score: '3.7/4.0',
      school_system: '2年',
      biz_6TQ8M4OkGL: '否',
    });
    // 防混填：硕士表单里没有本科的值
    expect(JSON.stringify(v)).not.toContain('示例财经大学');
    expect(v.biz_zsb7Q2).toBeUndefined();
    await clickSave(page, 'education');
    await expect.poll(async () => (await fixtureState(page)).records.education?.length ?? 0).toBe(2);

    const recs = (await fixtureState(page)).records.education!;
    expect(recs.map((r) => r.education)).toEqual(['本科', '硕士']);
    expect(recs.map((r) => r.school)).toEqual(['示例财经大学', '示例商学院大学']);

    // 重复执行：重新扫描后识别为已存在，不再新增
    await scan(panel);
    await expect(edu).toContainText('档案中的记录都已在页面中');
    await expect(edu.getByRole('button', { name: /添加并准备/ })).toHaveCount(0);
    expect((await fixtureState(page)).saveClicks).toBe(2); // 只有测试模拟的两次“用户点击”
    expect(externalRequests(requests)).toEqual([]);
  });

  test('工作/实习：至今、级联（直辖市）、单位性质；最近的在前', async ({ context, extensionId }) => {
    await setProfile(context, extensionId, sampleProfile());
    const { page, panel } = await openWithPanel(context, extensionId, GP);
    await scan(panel);
    const work = section(panel, 'work');
    await expect(work.locator('.record').first()).toContainText('示例能源集团财务有限公司');
    await openAndPlan(panel, 'work', /添加并准备第 1 条/);
    await pickCandidate(panel, 'work', '工作内容');
    await exec(page, panel, 'work');
    const res = await resultsText(panel, 'work');
    expect(res.filter((r) => r.includes('：'))).toEqual([]);
    const v = (await fixtureState(page)).values.work;
    expect(v).toMatchObject({
      company_name: '示例能源集团财务有限公司',
      company_nature: '国企',
      job_name: '财务实习生',
      employee_type: '实习',
      location: ['上海市', '上海市'],
      introduction: '（虚构示例）协助月度报表核对与资金台账更新。',
    });
    expect(String(v.period_end)).toMatch(/^2099-12-3/);
    await expect(page.locator('#period_end_input-fe-1601-customization')).toHaveValue('至今');
    await expect(page.locator('#period_start')).toHaveValue('2026-01');
  });

  test('英语能力；求职意向（期望城市需手动）与撤销', async ({ context, extensionId }) => {
    await setProfile(context, extensionId, sampleProfile());
    const { page, panel } = await openWithPanel(context, extensionId, GP);
    await scan(panel);
    await openAndPlan(panel, 'languages', /添加并准备第 1 条/);
    await exec(page, panel, 'languages');
    expect((await fixtureState(page)).values.languages).toMatchObject({ biz_KlznUxBiS5: '大学英语六级CET6', biz_OzLemw6HvG: '520' });

    await openAndPlan(panel, 'intention', /展开编辑表单/);
    expect(await levelOf(panel, 'intention', '期望工作城市')).toBe('跳过');
    await exec(page, panel, 'intention');
    expect((await fixtureState(page)).values.intention).toMatchObject({ biz_iKDY5E10uA: 8000, biz_Ksd7n3QZHt: 12000, biz_v9tuVxSj8f: '是', biz_D96MeJrh3G: '是' });

    // 用户手动改了“最高薪资”，撤销时保留用户的修改
    await page.locator('#biz_Ksd7n3QZHt').fill('15000');
    await page.locator('#biz_Ksd7n3QZHt').blur();
    await page.bringToFront();
    await section(panel, 'intention').getByRole('button', { name: '撤销本次填写' }).click();
    await expect(section(panel, 'intention')).toContainText('你之后修改过，保留你的修改', { timeout: 30_000 });
    const v = (await fixtureState(page)).values.intention;
    expect(v.biz_iKDY5E10uA ?? null).toBeNull();
    expect(v.biz_Ksd7n3QZHt).toBe(15000);
    expect(v.biz_v9tuVxSj8f ?? null).toBeNull();
    expect(v.biz_D96MeJrh3G ?? null).toBeNull();
  });

  test('默认不覆盖：预填的非空字段保持不变', async ({ context, extensionId }) => {
    await setProfile(context, extensionId, sampleProfile());
    const { page, panel } = await openWithPanel(context, extensionId, `${GP}?prefill=1`);
    await scan(panel);
    await expect(section(panel, 'basic').locator('.form-plan')).toBeVisible();
    expect(await levelOf(panel, 'basic', '邮箱')).toBe('跳过');
    await expect(row(panel, 'basic', '邮箱')).toContainText('已经有内容');
    await exec(page, panel, 'basic');
    expect((await fixtureState(page)).values.basic.email).toBe('keep.me@example.com');
  });

  test('歧义选项“研究生”进入中置信：先选最接近的一项并默认勾选，侧边栏可改', async ({ context, extensionId }) => {
    const p = sampleProfile() as { education: Array<{ level: string }> };
    p.education = p.education.filter((e) => e.level === 'master');
    await setProfile(context, extensionId, p);
    const { page, panel } = await openWithPanel(context, extensionId, `${GP}?variant=ambiguous`);
    await scan(panel);
    await openAndPlan(panel, 'education', /添加并准备第 1 条/);
    expect(await levelOf(panel, 'education', /^学历$/)).toBe('中');
    await expect(row(panel, 'education', /^学历$/).locator('select option')).toContainText(['（请选择）', '研究生']);
    // 用户要求（2026-11-09）：大致对得上就先填，本人之后在网页上核对
    await expect(row(panel, 'education', /^学历$/).locator('input[type=checkbox]')).toBeChecked();
    await expect(row(panel, 'education', /^学历$/).locator('select')).toHaveValue('0');
    await exec(page, panel, 'education');
    expect((await fixtureState(page)).values.education?.education).toBe('研究生');
  });

  test('档案未核对时给出提示', async ({ context, extensionId }) => {
    const p = sampleProfile() as { meta: Record<string, unknown> };
    p.meta.reviewedAt = null;
    await setProfile(context, extensionId, p);
    const { panel } = await openWithPanel(context, extensionId, GP);
    await expect(panel.getByTestId('unreviewed')).toBeVisible();
  });

  test('诊断报告只含结构，不含填写的值', async ({ context, extensionId }) => {
    await setProfile(context, extensionId, sampleProfile());
    const { page, panel } = await openWithPanel(context, extensionId, `${GP}?prefill=1`);
    await page.locator('#education .op-btn').click();
    await page.locator('#contact_name').fill('张三丰');
    await panel.locator('details.diag summary').click();
    await page.bringToFront();
    await panel.getByRole('button', { name: '生成诊断报告' }).click();
    const ta = panel.locator('details.diag textarea');
    await expect(ta).toBeVisible({ timeout: 60_000 });
    const text = await ta.inputValue();
    const report = JSON.parse(text);
    expect(report.sections.length).toBeGreaterThan(5);
    expect(report.fields.some((f: { label: string }) => f.label === '学历')).toBe(true);
    for (const secret of ['keep.me@example.com', '林示例', '张三丰', '139****0000', '999***']) expect(text).not.toContain(secret);
  });
});
