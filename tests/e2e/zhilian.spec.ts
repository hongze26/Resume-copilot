// 智联校园网申“我的简历”专用适配器（夹具 tests/fixtures/zl-real，真实 Vue 2 + Element UI 2.15）。
// 重点：区块先是只读展示，工具点“编辑/添加”展开；只读日期框在面板上点选；字段按 label[for] 对应；
// 表单里的“保 存 / 添 加”永远由本人点。
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { FIXTURE, expect, externalRequests, fixtureState, openWithPanel, sampleProfile, setProfile, test } from './fixtures';

const ZL = `${FIXTURE}/zl-like/`;

const section = (panel: Page, key: string): Locator => panel.locator(`[data-section="${key}"]`);
const row = (panel: Page, key: string, label: string | RegExp): Locator =>
  section(panel, key).locator('.row').filter({ has: panel.locator('.row-label', { hasText: typeof label === 'string' ? new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) : label }) });
const levelOf = async (panel: Page, key: string, label: string | RegExp) => (await row(panel, key, label).first().locator('.badge').textContent())?.trim();

async function scan(panel: Page) {
  await panel.click('#scan');
  await expect(panel.locator('#scan')).toHaveText(/重新扫描本页/, { timeout: 60_000 });
}

async function exec(page: Page, panel: Page, key: string) {
  await page.bringToFront();
  await section(panel, key).getByRole('button', { name: /填写选中的 \d+ 项/ }).click();
  await expect(section(panel, key).locator('.results')).toBeVisible({ timeout: 90_000 });
}

const realistic = () => JSON.parse(readFileSync('tests/resumes/profile-realistic.json', 'utf8')) as Record<string, unknown>;

/** 测试用档案：示例档案 + 日期精确到日（页面日期面板到日）+ 身高 + 自定义字段“体重(kg)”。 */
function profile(): Record<string, unknown> {
  const p = sampleProfile() as Record<string, any>;
  p.basic.birthDate = '2003-05-12';
  p.basic.heightCm = 165;
  p.custom = [{ id: 'cf-weight', label: '体重(kg)', value: '50' }];
  p.education[1].start = '2025-09-01';
  p.education[1].end = '2027-06-30';
  p.education[0].start = '2021-09-01';
  p.education[0].end = '2025-06-20';
  p.work[0].start = '2024-07-01';
  p.work[0].end = '2024-09-30';
  return p;
}

test.describe('智联校园', () => {
  test('个人信息：点“编辑”展开，下拉/只读日期/数字/自定义字段/城市弹窗/证件类型填写；不点保存', async ({ context, extensionId, requests }) => {
    await setProfile(context, extensionId, profile());
    const { page, panel } = await openWithPanel(context, extensionId, `${ZL}#basic`);
    await scan(panel);
    await expect(panel.locator('body')).toContainText('智联校园');
    const basic = section(panel, 'basic');
    await expect(basic).toBeVisible();
    await basic.getByRole('button', { name: '展开编辑表单并扫描' }).click();
    await expect(page.locator('.btn-box button', { hasText: '保 存' })).toBeVisible();
    await expect(basic.locator('.form-plan')).toBeVisible({ timeout: 60_000 });

    for (const label of ['姓名', '证件号码类型', '出生日期', '性别', '民族', '健康状况', '婚姻状况', '政治面貌', '现居住城市', '入学前户口所在地', '手机号码', '电子邮箱', '通信地址', '身高(cm)', '体重(kg)', '高考生源地']) {
      expect(await levelOf(panel, 'basic', label), label).toBe('高');
    }
    // 区号下拉、离职时间叠加框之类的辅助控件不出现在计划里
    await expect(row(panel, 'basic', /^手机号码/)).toHaveCount(1);

    await exec(page, panel, 'basic');
    const v = (await fixtureState(page)).values.basic as Record<string, unknown>;
    expect(v).toMatchObject({
      name: '林示例',
      birth: '2003-05-12',
      gender: '女',
      nation: '汉族',
      healthiness_status: '健康',
      marital_status: '未婚',
      politics_bg: '团员',
      area: '86',
      mobile_number: '13900000000',
      email: 'sample.applicant@example.com',
      address: '示例省示例市示例路 1 号',
      stature: '165',
      avoirdupois: '50',
      id_card_type: '身份证',
      // 直辖市在“热门”里：北京 → 海淀区；户口、生源地页面只到市
      nowlocated_city: '北京-海淀区',
      hukou_city: '湖南-岳阳',
      FIELD1002_city: '湖南-岳阳',
    });
    const st = await fixtureState(page);
    expect(st.saveClicks).toBe(0);
    expect(st.submitEvents).toBe(0);
    expect(externalRequests(requests)).toEqual([]);
  });

  test('教育经历：点“添加”展开，按学历从高到低；学历选后出现的研究方向一并填写；排名换算为档位需确认', async ({ context, extensionId }) => {
    await setProfile(context, extensionId, profile());
    const { page, panel } = await openWithPanel(context, extensionId, `${ZL}#education`);
    await scan(panel);
    const edu = section(panel, 'education');
    await edu.getByRole('button', { name: /添加并准备第 1 条/ }).click();
    await expect(edu.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
    for (const label of ['学校名称', '入学时间', '毕业时间', '受教育类型', '学位', '学历']) {
      expect(await levelOf(panel, 'education', label), label).toBe('高');
    }
    expect(await levelOf(panel, 'education', '是否有海外学习经历')).toBe('高'); // 统招 → 无

    await exec(page, panel, 'education');
    await expect(edu).toContainText('研究方向');
    const v = (await fixtureState(page)).values.education as Record<string, unknown>;
    expect(v).toMatchObject({
      school_name: '示例商学院大学',
      edu_date_start: '2025-09-01',
      edu_date_end: '2027-06-30',
      edu_type: '全日制统分统招',
      education_level: '硕士',
      education_degree: '硕士研究生',
      education_degree_direction: '管理会计与数字化',
      major_name: '会计',
      is_oversea: '无',
    });
    // 学校名称点了名称一致的候选
    expect((await fixtureState(page)).schoolPicks).toBe(1);
    expect((await fixtureState(page)).saveClicks).toBe(0);

    // 本人点表单里的“添 加”保存 → 侧边栏转到第 2 条（本科）
    await page.locator('.btn-box button', { hasText: '添 加' }).click();
    await expect.poll(async () => (await fixtureState(page)).records.education?.length ?? 0).toBe(1);
    await expect(edu.getByRole('button', { name: /添加并准备第 2 条/ })).toBeVisible({ timeout: 15_000 });
    await edu.getByRole('button', { name: /添加并准备第 2 条/ }).click();
    await expect(edu.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
    // 档案排名 15/180 ≈ 前 8.3%，换算成“前10%”需本人确认
    expect(await levelOf(panel, 'education', '年级排名')).toBe('中');
    await expect(row(panel, 'education', '年级排名').first()).toContainText('前10%');
  });

  test('实习经历、奖励荣誉（月份面板）、求职意向薪资（千/万写法）', async ({ context, extensionId }) => {
    await setProfile(context, extensionId, profile());
    const { page, panel } = await openWithPanel(context, extensionId, `${ZL}#work`);
    await scan(panel);
    const work = section(panel, 'work');
    await work.getByRole('button', { name: /添加并准备第 1 条/ }).click();
    await expect(work.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
    // 最近的在前：第 1 条是“至今”的那段，点日期面板左侧的“至今”
    expect(await levelOf(panel, 'work', '离职时间')).toBe('高');
    expect(await levelOf(panel, 'work', '工作类型')).toBe('高');
    await exec(page, panel, 'work');
    let v = (await fixtureState(page)).values.work as Record<string, unknown>;
    expect(v).toMatchObject({ company_name: '示例能源集团财务有限公司', job_type: '实习', job_title: '财务实习生', job_date_endTHISDAY: 0 });
    await expect(page.locator('.apply-form-date-now__ipt input')).toHaveValue('至今');

    // 奖励荣誉：获得时间是“月”面板
    await page.evaluate(() => (document.querySelectorAll('.resume-nav__item')[6] as HTMLElement).click());
    await scan(panel);
    const honors = section(panel, 'honors');
    await honors.getByRole('button', { name: /添加并准备第 1 条/ }).click();
    await expect(honors.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
    await exec(page, panel, 'honors');
    v = (await fixtureState(page)).values.honors as Record<string, unknown>;
    expect(v).toMatchObject({ awards: '（虚构）校级二等奖学金', award_time: '2023-10', award_office: '示例财经大学' });

    // 求职意向：8000 → “8千”，12000 → “1.2万”
    await page.evaluate(() => (document.querySelectorAll('.resume-nav__item')[2] as HTMLElement).click());
    await scan(panel);
    const intent = section(panel, 'intention');
    await intent.getByRole('button', { name: '展开编辑表单并扫描' }).click();
    await expect(intent.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
    expect(await levelOf(panel, 'intention', '期望工作城市')).toBe('高');
    await exec(page, panel, 'intention');
    v = (await fixtureState(page)).values.intention as Record<string, unknown>;
    expect(v).toMatchObject({ desired_salary_minimum: '8千', desired_salary_maximum: '1.2万', desired_city: '北京,上海' });
    expect((await fixtureState(page)).saveClicks).toBe(0);
  });

  test('真实数据档案：海外院校候选、语言证书弹窗、听说读写、技能弹窗（不误选“其他技能”）、多选期望城市', async ({ context, extensionId }) => {
    await setProfile(context, extensionId, realistic());
    const { page, panel } = await openWithPanel(context, extensionId, `${ZL}#education`);
    await scan(panel);
    // 教育：第 1 条是曼彻斯特大学（硕士，境外）
    const edu = section(panel, 'education');
    await edu.getByRole('button', { name: /添加并准备第 1 条/ }).click();
    await expect(edu.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
    await exec(page, panel, 'education');
    let v = (await fixtureState(page)).values.education as Record<string, unknown>;
    expect(v).toMatchObject({
      school_name: '曼彻斯特大学',
      edu_date_start: '2024-09-15',
      edu_date_end: '2025-09-30',
      edu_type: '海外留学',
      education_level: '硕士',
      education_degree: '硕士研究生',
      education_degree_direction: '财务会计',
      college_name: '艾莉安斯曼彻斯特商学院',
      major_name: '会计与金融',
      is_oversea: '有',
      oversea_experience: '1年',
    });

    // 实习：普华永道（至今）+ 月薪 + 证明人
    await page.evaluate(() => (document.querySelectorAll('.resume-nav__item')[3] as HTMLElement).click());
    await scan(panel);
    const work = section(panel, 'work');
    await work.getByRole('button', { name: /添加并准备第 1 条/ }).click();
    await expect(work.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
    await exec(page, panel, 'work');
    v = (await fixtureState(page)).values.work as Record<string, unknown>;
    expect(v).toMatchObject({ company_name: '普华永道中天会计师事务所（特殊普通合伙）长沙分所', job_date_start: '2025-06-16', job_date_endTHISDAY: 0, salary: '4000', is_references: '是' });

    // 语言：选语种后出现证书栏，在“考试 → 级别”弹窗里找“大学英语六级”
    await page.evaluate(() => (document.querySelectorAll('.resume-nav__item')[4] as HTMLElement).click());
    await scan(panel);
    const lang = section(panel, 'languages');
    await lang.getByRole('button', { name: /添加并准备第 1 条/ }).click();
    await expect(lang.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
    await exec(page, panel, 'languages');
    await expect(lang).toContainText('证书');
    v = (await fixtureState(page)).values.languages as Record<string, unknown>;
    expect(v).toMatchObject({ language: '英语', certificate: '全国大学英语六级考试(CET6)', language_skill_listen_say: '熟练', language_skill_read_write: '精通' });

    // 技能：IT技能 → 办公应用软件 → Excel；“其他技能”没有下一级，绝不能点
    await page.evaluate(() => (document.querySelectorAll('.resume-nav__item')[5] as HTMLElement).click());
    await scan(panel);
    const skills = section(panel, 'skills');
    await skills.getByRole('button', { name: /添加并准备第 1 条/ }).click();
    await expect(skills.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
    // 模拟真实情况：点侧边栏“填写”时网页没有焦点，el.focus() 不触发 focus 事件（技能弹窗靠 focus 打开）
    await page.evaluate(() => {
      HTMLElement.prototype.focus = function () {};
    });
    await exec(page, panel, 'skills');
    v = (await fixtureState(page)).values.skills as Record<string, unknown>;
    expect(v).toMatchObject({ skill_type: 'MS Excel', skill_level: '精通' });

    // 求职意向：多选城市 长沙、上海（热门）、深圳，点弹窗“确定”
    await page.evaluate(() => (document.querySelectorAll('.resume-nav__item')[2] as HTMLElement).click());
    await scan(panel);
    const intent = section(panel, 'intention');
    await intent.getByRole('button', { name: '展开编辑表单并扫描' }).click();
    await expect(intent.locator('.form-plan')).toBeVisible({ timeout: 60_000 });
    await exec(page, panel, 'intention');
    v = (await fixtureState(page)).values.intention as Record<string, unknown>;
    expect(v).toMatchObject({ desired_city: '湖南-长沙,上海,广东-深圳' });

    const st = await fixtureState(page);
    expect(st.saveClicks).toBe(0);
    expect(st.submitEvents).toBe(0);
  });
});
