// Element UI 控件驱动（Vue 2 的 Element UI 1.x / 2.x，兼顾 Vue 3 的 Element Plus 类名）。
// 国内大量企业招聘平台（例如山东高速招聘平台，Element UI 1.4.13）使用这套组件库。
//
// 与 antd 的关键差异（均已在 tests/fixtures/el-real 的真实组件库上验证）：
// - 下拉：1.x 靠输入框 focus 打开，2.x 靠点击外层打开；下拉层显示时被移到 body 下，没有 aria 关联，
//   所以“这个下拉的浮层”= 打开后唯一可见的那个（多个时取离控件最近的）。
// - 级联：1.x 菜单为 .el-cascader-menus/.el-cascader-menu__item，选中文字在 .el-cascader__label；
//   2.x 为 .el-cascader__dropdown/.el-cascader-node，选中文字在输入框里。
// - 日期：输入框可键入。先聚焦并等面板挂载（2.x 面板没挂载时 change 会被丢掉），再写入文字 + change，Esc 收起。
//   日期格式未知时依次尝试 2024-07-01、2024/07/01、2024年07月01日，并以输入框最终显示核验。
// - 关闭浮层：Element 的 clickoutside 监听 document 的 mousedown + mouseup，在 body 上派发即等同点空白处。
import { extractDate, sameDate, type DateParts } from '../../core/normalize/date';
import { regionKey } from '../../core/normalize/region';
import { norm } from '../../core/normalize/text';
import type { FillValue, ProbeResult } from '../../core/plan/types';
import { blurEl, fireKey, fireMouse, focusEl, isLeaving, isVisible, safeClick, setNativeValue, settle, sleep, text, waitFor, waitStable } from '../dom';
import { fail, fillCheckbox, fillNativeRadio, fillNativeSelect, fillText, inputOf, OK, snapshotNative, type DriverResult } from './common';

/** Element 控件根元素（扫描阶段登记的元素）。 */
const ROOT_SEL = '.el-select, .el-cascader, .el-date-editor, .el-range-editor, .el-radio-group, .el-checkbox-group';
const OVERLAY_SEL = '.el-select-dropdown, .el-picker-panel, .el-cascader-menus, .el-cascader__dropdown';

export function isElementControl(el: Element): boolean {
  return el.matches(ROOT_SEL);
}

// ---------------- 浮层 ----------------

function shown(doc: Document, sel: string): Element[] {
  return Array.from(doc.querySelectorAll(sel)).filter((d) => isVisible(d) && !isLeaving(d));
}

/** 多个可见浮层时取离控件最近的（浮层定位在控件正下方或正上方）。 */
function nearest(el: Element, list: Element[]): Element | null {
  if (list.length <= 1) return list[0] ?? null;
  const r = el.getBoundingClientRect();
  const dist = (d: Element) => {
    const b = d.getBoundingClientRect();
    return Math.min(Math.abs(b.top - r.bottom), Math.abs(b.bottom - r.top)) + Math.abs(b.left - r.left);
  };
  return [...list].sort((a, b) => dist(a) - dist(b))[0];
}

/** 点空白处 + Esc，收起所有 Element 浮层（等离场动画结束）。 */
export async function closeElementOverlays(doc: Document = document): Promise<void> {
  for (let i = 0; i < 3 && shown(doc, OVERLAY_SEL).length > 0; i++) {
    const active = doc.activeElement instanceof Element ? doc.activeElement : doc.body;
    fireKey(active, 'Escape');
    fireMouse(doc.body, 'mousedown');
    fireMouse(doc.body, 'mouseup');
    await sleep(120);
  }
  const start = Date.now();
  while (Date.now() - start < 600 && Array.from(doc.querySelectorAll(OVERLAY_SEL)).some((d) => isVisible(d))) await sleep(40);
}

function focusInput(input: HTMLInputElement): void {
  focusEl(input);
  // 侧边栏获得焦点时页面窗口不在前台，focus() 不一定派发事件；补派一次（Vue 只会把下拉设为“打开”，可重复）
  input.dispatchEvent(new FocusEvent('focus'));
}

// ---------------- 下拉 Select ----------------

function selectInput(el: Element): HTMLInputElement | null {
  return el.querySelector('input.el-input__inner, input.el-select__input, input:not([type=hidden])');
}

function selectDropdown(el: Element): Element | null {
  const own = el.querySelector('.el-select-dropdown');
  if (own && isVisible(own) && !isLeaving(own)) return own;
  return nearest(el, shown(el.ownerDocument, '.el-select-dropdown'));
}

function optionItems(dd: Element): Element[] {
  return Array.from(dd.querySelectorAll('.el-select-dropdown__item')).filter((o) => isVisible(o) && !o.classList.contains('is-disabled'));
}

function selectedText(el: Element): string {
  const tags = Array.from(el.querySelectorAll('.el-tag, .el-select__tags-text')).map(text).filter(Boolean);
  if (tags.length) return [...new Set(tags)].join(' | ');
  const plus = el.querySelector('.el-select__selected-item:not(.el-select__placeholder), .el-select__placeholder:not(.is-transparent)');
  if (plus && !el.querySelector('.el-select__input')?.matches(':focus')) {
    const t = text(plus);
    if (t && !(plus.classList.contains('el-select__placeholder') && el.querySelector('.el-select__placeholder.is-transparent'))) return t;
  }
  return selectInput(el)?.value.trim() ?? '';
}

async function openSelect(el: Element): Promise<Element> {
  const input = selectInput(el);
  if (el.classList.contains('is-disabled') || input?.disabled) throw new Error('locked');
  await closeElementOverlays(el.ownerDocument);
  // 1.x：输入框 focus 即打开；2.x：focus 只对可搜索下拉生效，其余要点击外层
  if (input) focusInput(input);
  let dd = await waitFor(() => selectDropdown(el), 400, '下拉框展开').catch(() => null);
  if (!dd) {
    safeClick(el.querySelector('.el-select__wrapper, .el-input') ?? el);
    dd = await waitFor(() => selectDropdown(el), 1500, '下拉框展开').catch(() => null);
  }
  if (!dd) {
    // 1.x 的另一个入口：右侧箭头图标
    const icon = el.querySelector('.el-input__icon, .el-select__caret');
    if (icon) safeClick(icon);
    dd = await waitFor(() => selectDropdown(el), 1500, '下拉框展开');
  }
  return dd;
}

export async function closeSelectEl(el: Element): Promise<void> {
  if (selectDropdown(el)) await closeElementOverlays(el.ownerDocument);
  const input = selectInput(el);
  if (input) blurEl(input);
}

/** 可搜索下拉：写入搜索词（1.x 靠 keyup、2.x 靠 input 事件触发过滤）。 */
async function typeQuery(el: Element, q: string): Promise<void> {
  const input = selectInput(el);
  if (!input || input.readOnly) return;
  setNativeValue(input, q);
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
  await sleep(350);
}

async function fillSelect(el: Element, v: Extract<FillValue, { t: 'option' }> | { t: 'option'; text: string; accept?: string[]; search?: string; match?: 'exact' | 'suffix' }): Promise<DriverResult> {
  let dd: Element;
  try {
    dd = await openSelect(el);
  } catch (e) {
    return (e as Error).message === 'locked' ? fail('locked') : fail('timeout', '下拉框没有展开');
  }
  try {
    await waitStable(() => optionItems(dd).map(text), 150, 2000).catch(() => undefined);
    const accept = [v.text, ...(v.accept ?? [])].map(norm);
    const matchFn = (o: string) => {
      const on = norm(o);
      if (v.match === 'suffix') {
        const segs = on.split('/').filter(Boolean).join('/');
        return accept.some((a) => segs === a || segs.endsWith('/' + a));
      }
      return accept.includes(on);
    };
    let items = optionItems(dd);
    let hits = items.filter((o) => matchFn(text(o)));
    if (hits.length === 0 && v.search) {
      await typeQuery(el, v.search);
      dd = selectDropdown(el) ?? dd;
      items = optionItems(dd);
      hits = items.filter((o) => matchFn(text(o)));
    }
    if (hits.length !== 1) {
      const cands = (hits.length > 1 ? hits : items).slice(0, 12).map(text);
      await closeSelectEl(el);
      return fail('no-option', hits.length > 1 ? '多个选项都相等' : `选项中没有“${v.text}”`, cands);
    }
    const want = text(hits[0]);
    safeClick(hits[0]);
    await settle(200);
    if (selectDropdown(el)) await closeSelectEl(el);
    else {
      const input = selectInput(el);
      if (input) blurEl(input);
    }
    await settle(100);
    return norm(selectedText(el)).includes(norm(want)) ? OK : fail('verify-failed', '选择后显示与目标不一致');
  } catch (e) {
    await closeSelectEl(el);
    throw e;
  }
}

// ---------------- 级联 Cascader ----------------

function cascaderPanel(el: Element): Element | null {
  return nearest(el, shown(el.ownerDocument, '.el-cascader-menus, .el-cascader__dropdown'));
}

const CASCADER_ITEM = '.el-cascader-menu__item, .el-cascader-node';
const itemLabel = (i: Element) => text(i.querySelector('.el-cascader-node__label') ?? i);
const extensible = (i: Element) => i.classList.contains('el-cascader-menu__item--extensible') || i.getAttribute('aria-haspopup') === 'true' || !!i.querySelector('.el-cascader-node__postfix');

function cascaderText(el: Element): string {
  const label = el.querySelector('.el-cascader__label');
  if (label && text(label)) return text(label);
  const tags = Array.from(el.querySelectorAll('.el-cascader__tags .el-tag')).map(text);
  if (tags.length) return tags.join(' | ');
  return inputOf(el)?.value.trim() ?? '';
}

async function fillCascader(el: Element, path: string[]): Promise<DriverResult> {
  if (el.classList.contains('is-disabled') || inputOf(el)?.disabled) return fail('locked');
  await closeElementOverlays(el.ownerDocument);
  safeClick(el.querySelector('.el-input') ?? el);
  let panel: Element;
  try {
    panel = await waitFor(() => cascaderPanel(el), 3000, '级联菜单展开');
  } catch {
    return fail('timeout', '级联菜单没有展开');
  }
  const chosen: string[] = [];
  let last: Element | undefined;
  let t = 0;
  for (let col = 0; col < 6 && t < path.length; col++) {
    let menu: Element;
    try {
      menu = await waitFor(() => (cascaderPanel(el) ?? panel).querySelectorAll('.el-cascader-menu')[col], 4000, '下一级菜单');
    } catch {
      break;
    }
    await waitStable(() => Array.from(menu.querySelectorAll(CASCADER_ITEM)).map(itemLabel), 150, 3000).catch(() => undefined);
    const items = Array.from(menu.querySelectorAll(CASCADER_ITEM)).filter((i) => !i.classList.contains('is-disabled'));
    let hit = items.filter((i) => regionKey(itemLabel(i)) === regionKey(path[t]));
    let advance = true;
    if (hit.length === 0 && t > 0 && chosen.length) {
      // 直辖市：第二级是与省同名的“北京市”
      hit = items.filter((i) => regionKey(itemLabel(i)) === regionKey(chosen[chosen.length - 1]));
      advance = false;
    }
    if (hit.length !== 1) {
      await closeElementOverlays(el.ownerDocument);
      return fail('no-option', `第 ${col + 1} 级找不到“${path[t]}”${chosen.length ? `（已选到 ${chosen.join(' / ')}，已停止）` : ''}`, items.slice(0, 12).map(itemLabel));
    }
    last = hit[0];
    chosen.push(itemLabel(hit[0]));
    safeClick(hit[0]);
    if (advance) t++;
    await sleep(150);
  }
  await settle(200);
  // 目标用完但还有下一级（档案只到市，页面要到区县）：不替用户猜，关闭并说明
  if (last && extensible(last) && cascaderPanel(el)) {
    await closeElementOverlays(el.ownerDocument);
    return fail('verify-failed', `页面还要求选择下一级（已选到 ${chosen.join(' / ')}），请在页面上补选`);
  }
  if (cascaderPanel(el)) await closeElementOverlays(el.ownerDocument);
  const shownText = cascaderText(el);
  if (!shownText) return fail('verify-failed', '级联选择后输入框为空');
  const ok = path.every((p) => regionKey(shownText).includes(regionKey(p)) || norm(shownText).includes(regionKey(p)));
  return ok ? OK : fail('verify-failed', '级联显示与目标不一致');
}

// ---------------- 日期 DatePicker ----------------

type ElDateType = 'year' | 'month' | 'date' | 'datetime' | 'week' | 'daterange' | 'monthrange' | 'datetimerange' | 'dates' | 'unknown';

function dateType(el: Element): ElDateType {
  const m = String((el as HTMLElement).className).match(/el-date-editor--(\w+)/);
  return (m?.[1] as ElDateType) ?? (el.classList.contains('el-range-editor') ? 'daterange' : 'unknown');
}

export function elementDatePrecision(el: Element): 'year' | 'month' | 'day' | undefined {
  const t = dateType(el);
  if (t === 'year') return 'year';
  if (t === 'month' || t === 'monthrange') return 'month';
  if (t === 'date' || t === 'daterange' || t === 'datetime' || t === 'datetimerange' || t === 'dates') return 'day';
  return undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 按页面粒度生成几种常见写法，依次尝试。 */
function dateStrings(d: DateParts, precision: 'year' | 'month' | 'day' | undefined): string[] {
  const p = precision ?? (d.d !== undefined ? 'day' : d.m !== undefined ? 'month' : 'year');
  if (p === 'year') return [String(d.y), `${d.y}年`];
  if (d.m === undefined) return [];
  if (p === 'month') return [`${d.y}-${pad(d.m)}`, `${d.y}/${pad(d.m)}`, `${d.y}年${pad(d.m)}月`, `${d.y}.${pad(d.m)}`];
  if (d.d === undefined) return [];
  return [`${d.y}-${pad(d.m)}-${pad(d.d)}`, `${d.y}/${pad(d.m)}/${pad(d.d)}`, `${d.y}年${pad(d.m)}月${pad(d.d)}日`, `${d.y}.${pad(d.m)}.${pad(d.d)}`];
}

function pickerPanel(doc: Document): Element | null {
  const list = shown(doc, '.el-picker-panel');
  return list[list.length - 1] ?? null;
}

/** 聚焦 → 等面板挂载 → 写入文字 → change。不收起面板（区间要连续写两个框）。 */
async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  focusInput(input);
  await waitFor(() => pickerPanel(input.ownerDocument), 800, '日期面板展开').catch(() => undefined);
  await sleep(60);
  setNativeValue(input, value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(120);
}

async function finishTyping(input: HTMLInputElement): Promise<void> {
  fireKey(input, 'Escape');
  await sleep(120);
  if (pickerPanel(input.ownerDocument)) await closeElementOverlays(input.ownerDocument);
  blurEl(input);
  await settle(120);
}

function matchesShown(value: string, target: DateParts, precision: 'year' | 'month' | 'day' | undefined): boolean {
  const got = extractDate(value) ?? (/^\d{4}年?$/.test(value.trim()) ? { y: Number(value.trim().slice(0, 4)) } : null);
  if (!got || got === 'present') return false;
  const want: DateParts = precision === 'year' ? { y: target.y } : precision === 'month' ? { y: target.y, m: target.m } : target;
  return sameDate(got, want) && got.y === want.y && (want.m === undefined || got.m === want.m) && (want.d === undefined || got.d === want.d);
}

// 只读日期框（网站关闭了键入，如智联校园 editable=false）：在面板上逐级点选 年 → 月 → 日。
// 面板结构（Element 1.x / 2.x 相同类名）：表头 .el-date-picker__header-label（“2024 年”“9 月”），
// 点年份标签进入 .el-year-table（每页十年，d-arrow 翻页），再 .el-month-table（12 格按顺序），再 .el-date-table。
// 年/月表格只响应点在 a.cell 上的点击，日期表响应 td 或其中的 span。

const yearCells = (p: Element) => Array.from(p.querySelectorAll('.el-year-table td')).filter(isVisible);
const monthCells = (p: Element) => Array.from(p.querySelectorAll('.el-month-table td')).filter(isVisible);
const dayTable = (p: Element) => Array.from(p.querySelectorAll('.el-date-table')).find(isVisible);
const clickCell = (td: Element) => safeClick(td.querySelector('a.cell, span') ?? td);
const cellDisabled = (td: Element) => td.classList.contains('disabled') || td.classList.contains('is-disabled');

async function pickYear(panel: Element, y: number): Promise<boolean> {
  if (yearCells(panel).length === 0) {
    const label = Array.from(panel.querySelectorAll('.el-date-picker__header-label')).find(isVisible);
    if (!label) return false;
    safeClick(label);
    await waitFor(() => (yearCells(panel).length ? true : null), 1000, '年份表').catch(() => undefined);
  }
  for (let i = 0; i < 30; i++) {
    const cells = yearCells(panel);
    const years = cells.map((c) => Number(text(c))).filter((n) => Number.isFinite(n) && n > 0);
    if (!years.length) return false;
    const hit = cells.find((c) => Number(text(c)) === y);
    if (hit) {
      if (cellDisabled(hit)) return false;
      clickCell(hit);
      await sleep(150);
      return true;
    }
    const btn = panel.querySelector(y < Math.min(...years) ? '.el-date-picker__prev-btn.el-icon-d-arrow-left, .el-icon-d-arrow-left' : '.el-date-picker__next-btn.el-icon-d-arrow-right, .el-icon-d-arrow-right');
    if (!btn) return false;
    safeClick(btn);
    await sleep(80);
  }
  return false;
}

async function pickMonth(panel: Element, m: number): Promise<boolean> {
  await waitFor(() => (monthCells(panel).length === 12 ? true : null), 1000, '月份表').catch(() => undefined);
  const cells = monthCells(panel);
  if (cells.length !== 12 || cellDisabled(cells[m - 1])) return false;
  clickCell(cells[m - 1]);
  await sleep(150);
  return true;
}

async function pickDay(panel: Element, d: number): Promise<boolean> {
  const table = await waitFor(() => dayTable(panel) ?? null, 1000, '日期表').catch(() => null);
  if (!table) return false;
  const cell = Array.from(table.querySelectorAll('td')).find(
    (td) => !td.classList.contains('prev-month') && !td.classList.contains('next-month') && !cellDisabled(td) && text(td) === String(d),
  );
  if (!cell) return false;
  clickCell(cell);
  await sleep(150);
  return true;
}

async function pickDateOnPanel(el: Element, input: HTMLInputElement, target: DateParts, precision: 'year' | 'month' | 'day' | undefined): Promise<DriverResult> {
  const p = precision ?? (target.d !== undefined ? 'day' : target.m !== undefined ? 'month' : 'year');
  if ((p !== 'year' && target.m === undefined) || (p === 'day' && target.d === undefined)) return fail('verify-failed', '档案日期精度不足');
  const panel = await openDatePanel(el, input);
  if (!panel) return fail('timeout', '日期面板没有打开');
  const ok =
    (await pickYear(panel, target.y)) &&
    (p === 'year' || (await pickMonth(panel, target.m!))) &&
    (p !== 'day' || (await pickDay(panel, target.d!)));
  await settle(150);
  if (pickerPanel(el.ownerDocument)) await closeElementOverlays(el.ownerDocument);
  if (!ok) return fail('verify-failed', '没能在日期面板上选中目标日期（可能不在可选范围内）');
  return matchesShown(input.value, target, p) ? OK : fail('verify-failed', `日期没有被网站接受（页面显示“${input.value || '空'}”）`);
}

/** 打开只读日期框的面板（focus，不行再点击）。 */
async function openDatePanel(el: Element, input: HTMLInputElement): Promise<Element | null> {
  await closeElementOverlays(el.ownerDocument);
  focusInput(input);
  let panel = await waitFor(() => pickerPanel(el.ownerDocument), 600, '日期面板展开').catch(() => null);
  if (!panel) {
    safeClick(input);
    panel = await waitFor(() => pickerPanel(el.ownerDocument), 1500, '日期面板展开').catch(() => null);
  }
  return panel;
}

const presentShortcut = (panel: Element) => Array.from(panel.querySelectorAll('.el-picker-panel__shortcut')).find((b) => /^至\s*今$/.test(text(b)));

/** 面板左侧的“至今”快捷项（智联校园的离职/毕业时间）。选中后页面显示“至今”。 */
async function pickPresent(el: Element): Promise<DriverResult> {
  const input = inputOf(el) as HTMLInputElement | null;
  if (!input) return fail('not-supported', '找不到日期输入框');
  if (input.disabled) return fail('locked');
  const panel = await openDatePanel(el, input);
  const btn = panel ? presentShortcut(panel) : undefined;
  if (!btn) {
    await closeElementOverlays(el.ownerDocument);
    return fail('not-supported', '这个日期框没有“至今”，请在页面上手动处理');
  }
  // 选“至今”后网站可能把整份表单重画（原来的元素脱离页面）：按标签的字段名/文字在页面上重新找这一项
  const item = el.closest('.el-form-item');
  const label = item?.querySelector(':scope > .el-form-item__label');
  const forId = label?.getAttribute('for') ?? '';
  const labelText = label ? text(label) : '';
  const doc = el.ownerDocument;
  safeClick(btn);
  await settle(250);
  if (pickerPanel(doc)) await closeElementOverlays(doc);
  const showsPresent = (box: Element) => Array.from(box.querySelectorAll<HTMLInputElement>('input')).some((i) => i.value.trim() === '至今');
  const liveItems = (): Element[] => {
    if (item?.isConnected) return [item];
    if (!forId && !labelText) return [];
    return Array.from(doc.querySelectorAll('.el-form-item')).filter((i) => {
      const l = i.querySelector(':scope > .el-form-item__label');
      return !!l && (forId ? l.getAttribute('for') === forId : text(l) === labelText) && isVisible(i);
    });
  };
  const ok = await waitFor(() => liveItems().some(showsPresent) || (!item && showsPresent(el.parentElement ?? el)), 1500, '“至今”显示').catch(() => false);
  return ok ? OK : fail('verify-failed', '点了“至今”，但网页上这一栏没有显示“至今”');
}

async function fillDate(el: Element, target: DateParts | 'present'): Promise<DriverResult> {
  if (target === 'present') return pickPresent(el);
  const input = inputOf(el) as HTMLInputElement | null;
  if (!input) return fail('not-supported', '找不到日期输入框');
  if (input.disabled) return fail('locked');
  const precision = elementDatePrecision(el);
  if (input.readOnly) {
    if (dateType(el) === 'date' || dateType(el) === 'month' || dateType(el) === 'year') return pickDateOnPanel(el, input, target, precision);
    return fail('not-supported', '这个日期框不允许键入，请在页面上手动选择');
  }
  const tries = dateStrings(target, precision);
  if (tries.length === 0) return fail('verify-failed', '档案日期精度不足');
  await closeElementOverlays(el.ownerDocument);
  for (const s of tries) {
    await typeInto(input, s);
    await finishTyping(input);
    if (matchesShown(input.value, target, precision)) return OK;
  }
  return fail('verify-failed', `日期没有被网站接受（页面显示“${input.value || '空'}”）`);
}

async function fillDateRange(el: Element, start: DateParts, end: DateParts | 'present'): Promise<DriverResult> {
  if (end === 'present') return fail('not-supported', '区间日期没有“至今”，请在页面上手动处理');
  const precision = elementDatePrecision(el);
  const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('input.el-range-input'));
  const s = dateStrings(start, precision);
  const e = dateStrings(end, precision);
  if (!s.length || !e.length) return fail('verify-failed', '档案日期精度不足');
  await closeElementOverlays(el.ownerDocument);
  if (inputs.length === 2) {
    if (inputs.some((i) => i.disabled)) return fail('locked');
    if (inputs.some((i) => i.readOnly)) return fail('not-supported', '这个日期框不允许键入，请在页面上手动选择');
    for (let k = 0; k < Math.min(s.length, e.length); k++) {
      await typeInto(inputs[0], s[k]);
      await typeInto(inputs[1], e[k]);
      await finishTyping(inputs[1]);
      if (matchesShown(inputs[0].value, start, precision) && matchesShown(inputs[1].value, end, precision)) return OK;
    }
    return fail('verify-failed', '起止日期没有被网站接受');
  }
  // 1.x：一个输入框，写成“开始 - 结束”
  const input = inputOf(el) as HTMLInputElement | null;
  if (!input) return fail('not-supported', '找不到日期输入框');
  if (input.disabled) return fail('locked');
  if (input.readOnly) return fail('not-supported', '这个日期框不允许键入，请在页面上手动选择');
  for (let k = 0; k < Math.min(s.length, e.length); k++) {
    await typeInto(input, `${s[k]} - ${e[k]}`);
    await finishTyping(input);
    const [a, b] = input.value.split(/\s+[-~至]\s+/);
    if (a && b && matchesShown(a, start, precision) && matchesShown(b, end, precision)) return OK;
  }
  return fail('verify-failed', '起止日期没有被网站接受');
}

// ---------------- 输入联想 Autocomplete ----------------

/**
 * 输入联想框（智联校园的学校名称）：写入全称，等候选出现，点名称完全一致的那一项（网站会据此带出“是否海外”等）。
 * 没有完全一致的候选时保留输入的文字（网站接受直接输入），并说明。
 */
export async function fillAutocomplete(el: Element, value: string): Promise<DriverResult> {
  const input = inputOf(el) as HTMLInputElement | null;
  if (!input) return fail('not-supported', '找不到输入框');
  if (input.disabled) return fail('locked');
  focusInput(input);
  setNativeValue(input, value);
  const doc = el.ownerDocument;
  const items = () =>
    Array.from(doc.querySelectorAll('.el-autocomplete-suggestion'))
      .filter((d) => isVisible(d) && !isLeaving(d))
      .flatMap((d) => Array.from(d.querySelectorAll('li')))
      .filter((li) => isVisible(li) && !li.classList.contains('is-loading'));
  // 网站对输入做了防抖（约 300ms）再请求候选：先等候选出现，再等它稳定
  await waitFor(() => (items().length ? true : null), 2500, '候选出现').catch(() => undefined);
  const list = await waitStable(() => items().map(text), 250, 2500).catch(() => undefined);
  const hit = items().find((li) => norm(text(li)) === norm(value));
  if (hit) {
    safeClick(hit);
    await settle(250);
  } else {
    fireKey(input, 'Escape');
    await sleep(80);
  }
  blurEl(input);
  await settle(150);
  if (norm(input.value) !== norm(value)) return fail('verify-failed', `页面显示“${input.value || '空'}”`);
  if (!hit) return { ok: true, detail: list && list.length ? '候选里没有名称完全一致的项，已保留输入的全称' : '没有出现候选，已保留输入的全称' };
  return OK;
}

// ---------------- 单选组 RadioGroup ----------------

const radioOptions = (el: Element) => Array.from(el.querySelectorAll('.el-radio, .el-radio-button')).filter(isVisible);
const radioText = (o: Element) => text(o.querySelector('.el-radio__label, .el-radio-button__inner') ?? o);

async function fillRadioGroup(el: Element, target: string, accept?: string[]): Promise<DriverResult> {
  const acc = [target, ...(accept ?? [])].map(norm);
  const opts = radioOptions(el);
  const hits = opts.filter((o) => acc.includes(norm(radioText(o))));
  if (hits.length === 0) return fail('no-option', undefined, opts.map(radioText));
  if (hits.length > 1) return fail('no-option', '多个选项都相等', hits.map(radioText));
  const o = hits[0];
  if (o.classList.contains('is-disabled')) return fail('locked');
  safeClick(o.querySelector('input') ?? o);
  await settle();
  return o.classList.contains('is-checked') ? OK : fail('verify-failed');
}

// ---------------- 入口 ----------------

export async function driveElement(el: Element, kind: string, value: FillValue): Promise<DriverResult> {
  switch (value.t) {
    case 'text':
      if (kind === 'select' || kind === 'remote-select') return fillSelect(el, { t: 'option', text: value.text, search: value.text });
      return fillText(el, value.text);
    case 'option':
    case 'radio':
      if (kind === 'radio-button') return fillRadioGroup(el, value.text, value.accept);
      if (kind === 'native-select') return fillNativeSelect(el as HTMLSelectElement, value.text, value.accept);
      if (kind === 'radio') return fillNativeRadio(el as HTMLInputElement, value.text, value.accept);
      return fillSelect(el, value.t === 'option' ? value : { t: 'option', text: value.text, accept: value.accept });
    case 'remote-option':
      return fillSelect(el, { t: 'option', text: value.accept[0] ?? value.query, accept: value.accept, search: value.query });
    case 'cascade-multi':
      return fail('not-supported', '多选地区弹窗请手动选择');
    case 'cascade':
      return fillCascader(el, value.path);
    case 'date':
      return fillDate(el, value.date);
    case 'date-range':
      return fillDateRange(el, value.start, value.end);
    case 'checkbox':
      return fillCheckbox(el, value.checked);
    case 'popup-pick':
      return fail('not-supported', '这种弹窗选择暂不支持，请手动选择');
  }
}

export function snapshotElement(el: Element, kind: string): string {
  switch (kind) {
    case 'select':
    case 'remote-select':
      return selectedText(el);
    case 'cascader':
      return cascaderText(el);
    case 'date':
      return (inputOf(el)?.value ?? '').trim();
    case 'date-range': {
      const vals = Array.from(el.querySelectorAll('input')).map((i) => i.value.trim());
      return vals.every((v) => v === '') ? '' : vals.join(' ~ ');
    }
    case 'radio-button':
      return radioText(el.querySelector('.el-radio.is-checked, .el-radio-button.is-active') ?? el.ownerDocument.createElement('i'));
    default:
      return snapshotNative(el, kind) ?? inputOf(el)?.value ?? '';
  }
}

/** 撤销：清空下拉（需网站开启“可清空”）或可键入的日期框。 */
export async function clearElement(el: Element, kind: string): Promise<boolean> {
  if (kind === 'select' || kind === 'remote-select' || kind === 'cascader') {
    fireMouse(el, 'mouseenter');
    fireMouse(el.querySelector('.el-input') ?? el, 'mouseenter');
    await sleep(80);
    const clear = el.querySelector('.el-icon-circle-close, .el-select__clear, .el-cascader__clearIcon, .el-input__clear');
    if (!clear) return false;
    safeClick(clear);
    await settle();
    await closeElementOverlays(el.ownerDocument);
    return snapshotElement(el, kind) === '';
  }
  if (kind === 'date') {
    const input = inputOf(el) as HTMLInputElement | null;
    if (!input || input.readOnly) return false;
    await typeInto(input, '');
    await finishTyping(input);
    return input.value === '';
  }
  return false;
}

/** 选项探测：下拉读出全部选项（Element 不做虚拟列表）；日期粒度从类名读，不展开面板。 */
export async function probeElement(el: Element, kind: string): Promise<Partial<ProbeResult>> {
  if (kind === 'date' || kind === 'date-range') {
    const p = elementDatePrecision(el);
    const input = inputOf(el) as HTMLInputElement | null;
    // 只读日期框要在面板上点选：顺便看看面板有没有“至今”快捷项
    let present = false;
    if (kind === 'date' && input?.readOnly && !input.disabled) {
      const panel = await openDatePanel(el, input).catch(() => null);
      present = !!panel && !!presentShortcut(panel);
      await closeElementOverlays(el.ownerDocument);
      blurEl(input);
    }
    return p ? { datePrecision: p, hasPresentOption: present } : {};
  }
  if (kind !== 'select') return {};
  try {
    const dd = await openSelect(el);
    await waitStable(() => optionItems(dd).map(text), 150, 1500).catch(() => undefined);
    const opts = optionItems(dd).map(text).filter(Boolean);
    return { options: opts, optionsPartial: opts.length === 0 };
  } catch {
    return {};
  } finally {
    await closeSelectEl(el);
  }
}
