// 真实 Element UI（1.4.13 / 2.15.x）上的通用识别与填写：仿企业招聘平台“我的简历”（分子页面预填，之后统一投递）。
// 夹具：tests/fixtures/el-real。重点：下拉/级联/日期驱动、弹窗里的经历记录、从不点保存、客服小窗不误报跨域框架。
import type { Page } from '@playwright/test';
import { expect, FIXTURE, fixtureState, openWithPanel, sampleProfile, setProfile, test } from './fixtures';

const row = (panel: Page, label: string) => panel.locator('.row').filter({ has: panel.locator('.row-label', { hasText: new RegExp(`^${label}$`) }) }).first();
const level = async (panel: Page, label: string) => (await row(panel, label).locator('.badge').first().textContent())?.trim();

/** 依次点击所有“填写选中的 N 项”，等每份计划执行完。 */
async function fillAll(panel: Page): Promise<void> {
  const buttons = panel.getByRole('button', { name: /^填写选中的 [1-9]\d* 项$/ });
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    await buttons.first().click();
    await expect(panel.getByText(/正在填写/)).toHaveCount(0, { timeout: 60_000 });
  }
}

for (const v of ['el1', 'el2'] as const) {
  test.describe(`Element UI ${v === 'el1' ? '1.4.13' : '2.15'}`, () => {
    test('基本信息页：识别区块并填写下拉、级联、单选、文本；不点保存', async ({ context, extensionId }) => {
      await setProfile(context, extensionId, sampleProfile());
      const { page, panel } = await openWithPanel(context, extensionId, `${FIXTURE}/${v}/#/resume/baseinfo`);
      await panel.click('#scan');
      await expect(panel.getByTestId('generic-result')).toBeVisible({ timeout: 60_000 });
      // 区块标题是普通 div，外层容器类名含“menu”（right_menu）也要能识别；长括号说明的“联系方式(…)”也算
      const secs = await panel.getByTestId('page-sections').textContent();
      for (const t of ['基本信息', '联系方式']) expect(secs).toContain(t);
      // 右下角客服小窗（跨域 iframe）不算“表单在框架里”
      await expect(panel.locator('.banner-warn', { hasText: '内嵌框架' })).toHaveCount(0);

      expect(await level(panel, '民族')).toBe('高');
      expect(await level(panel, '政治面貌')).toBe('高');
      expect(await level(panel, '性别')).toBe('高');
      expect(await level(panel, '户口所在地')).toBe('高');
      expect(await level(panel, '联系邮箱')).toBe('高');
      expect(await level(panel, '姓名')).toBe('跳过'); // 网站已锁定
      expect(await level(panel, '出生日期')).toBe('中'); // 页面要到日，档案只到月：需本人补日期

      await fillAll(panel);
      const st = await fixtureState(page);
      const base = st.values.base as Record<string, unknown>;
      expect(base.ethnicity).toBe('汉族');
      expect(base.politics).toBe('共青团员');
      expect(base.gender).toBe('2');
      expect(base.hukou).toEqual(['湖南省', '岳阳市', '岳阳楼区']);
      expect(base.email).toBe('sample.applicant@example.com');
      expect(st.saveClicks).toBe(0);
      expect(st.submitEvents).toBe(0);
      // 籍贯档案只到市、页面要到区县：不替用户猜，报告原因
      await expect(panel.locator('li.result', { hasText: '籍贯' }).first()).toContainText(/下一级/);
    });

    test('教育背景子页面：点“添加并准备”打开弹窗，按档案第 1 条填写，保存由本人点', async ({ context, extensionId }) => {
      await setProfile(context, extensionId, sampleProfile());
      const { page, panel } = await openWithPanel(context, extensionId, `${FIXTURE}/${v}/#/resume/addResumeEdu`);
      await panel.click('#scan');
      await expect(panel.getByTestId('generic-result')).toBeVisible({ timeout: 60_000 });
      const add = panel.getByRole('button', { name: /添加并准备第 1 条/ });
      await expect(add).toBeVisible();
      await add.click();
      await expect(page.locator('.el-dialog__title', { hasText: '教育背景' })).toBeVisible();
      await expect(row(panel, '学校名称')).toBeVisible({ timeout: 60_000 });
      expect(await level(panel, '学校名称')).toBe('高');
      expect(await level(panel, '学历')).toBe('高');
      expect(await level(panel, '入学时间')).toBe('高');
      await fillAll(panel);
      const edu = (await fixtureState(page)).values.education as Record<string, unknown>;
      expect(edu.school).toBe('示例财经大学');
      expect(edu.level).toBe('大学本科');
      expect(edu.major).toBe('会计学');
      expect(edu.mode).toBe('全日制');
      const months = await page.evaluate(() => {
        const f = (window as unknown as { __fixture: { values: { education: { start: string; end: string } }; fmtMonth: (d: string) => string } }).__fixture;
        return [f.fmtMonth(f.values.education.start), f.fmtMonth(f.values.education.end)];
      });
      expect(months).toEqual(['2021-09', '2025-06']);
      expect((await fixtureState(page)).saveClicks).toBe(0);

      // 本人在页面上点保存 → 弹窗关闭、表格出现这一条 → 侧边栏转到第 2 条
      await page.locator('.dialog-save').click();
      await expect(page.locator('.record-table', { hasText: '示例财经大学' })).toBeVisible();
      await expect(panel.getByRole('button', { name: /添加并准备第 2 条/ })).toBeVisible({ timeout: 30_000 });
    });

    test('工作履历：区间日期驱动（直接执行），写入后核验', async ({ context, extensionId }) => {
      await setProfile(context, extensionId, sampleProfile());
      const { page, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE}/${v}/#/resume/addResumeWork`);
      await panel.click('#scan');
      await expect(panel.getByTestId('generic-result')).toBeVisible({ timeout: 60_000 });
      await page.locator('.add-btn').click();
      await expect(page.locator('.el-dialog__title', { hasText: '工作履历' })).toBeVisible();
      const results = await panel.evaluate(async (tid) => {
        const scan = await chrome.tabs.sendMessage(tid, { type: 'rc/scan', version: 1, adapterId: 'generic' }, { frameId: 0 });
        const f = scan.fields.find((x: { label: string; kind: string }) => x.label === '起止时间');
        const items = [{ fieldKey: f.key, label: '起止时间', kind: f.kind, value: { t: 'date-range', start: { y: 2024, m: 7, d: 1 }, end: { y: 2024, m: 9, d: 30 } } }];
        const r = await chrome.tabs.sendMessage(tid, { type: 'rc/exec', version: 1, runId: 'w1', items }, { frameId: 0 });
        return { kind: f.kind, results: r.results.map((x: { status: string; detail?: string }) => `${x.status}${x.detail ? ':' + x.detail : ''}`) };
      }, tabId);
      expect(results).toEqual({ kind: 'date-range', results: ['ok'] });
      const period = await page.evaluate(() => {
        const f = (window as unknown as { __fixture: { values: { work: { period: string[] } } } }).__fixture;
        return f.values.work.period.map((d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`; });
      });
      expect(period).toEqual(['2024-7-1', '2024-9-30']);
      expect((await fixtureState(page)).saveClicks).toBe(0);
    });
  });
}
