// antd v5 控件驱动（国聘等 React + antd 网站）：按用户操作的顺序派发事件，写入后核验。原生控件见 common.ts。
// 每个驱动返回 DriverResult；失败时不留下半成品（关闭下拉、恢复焦点）。
import { certPath, matchCertLeaves, uniqueByName, type CertLeaf } from '../../core/normalize/cert';
import { extractDate, sameDate, type DateParts } from '../../core/normalize/date';
import { norm } from '../../core/normalize/text';
import { regionKey } from '../../core/normalize/region';
import type { FillValue, ProbeResult } from '../../core/plan/types';
import {
  blurEl,
  fireKey,
  fireMouse,
  focusEl,
  isLeaving,
  isVisible,
  openOverlays,
  safeClick,
  safeMouseDown,
  setNativeValue,
  settle,
  sleep,
  text,
  TimeoutError,
  waitFor,
  waitOverlaysClosed,
  waitStable,
} from '../dom';

import { fail, fillNativeRadio, fillNativeSelect, fillText, inputOf, OK, snapshotNative, type DriverResult } from './common';

// ---------------- 快照（撤销与核验用，只在 Content Script 内存中） ----------------

export function snapshotAntd(el: Element, kind: string): string {
  switch (kind) {
    case 'select':
    case 'remote-select':
    case 'cascader': {
      const items = Array.from(el.querySelectorAll('.ant-select-selection-item'));
      return items.map((i) => i.getAttribute('title') || text(i)).join(' | ');
    }
    case 'date':
      return (inputOf(el)?.value ?? '').trim();
    case 'date-range': {
      const vals = Array.from(el.querySelectorAll('input')).map((i) => i.value.trim());
      return vals.every((v) => v === '') ? '' : vals.join(' ~ ');
    }
    case 'radio-button':
      return text(el.querySelector('.ant-radio-button-wrapper-checked, .ant-radio-wrapper-checked'));
    default:
      return snapshotNative(el, kind) ?? inputOf(el)?.value ?? '';
  }
}

function formItemHasError(el: Element): boolean {
  const item = el.closest('.ant-form-item');
  return !!item && item.classList.contains('ant-form-item-has-error');
}

// ---------------- antd Radio.Button ----------------

async function fillRadioButton(el: Element, target: string, accept?: string[]): Promise<DriverResult> {
  const acc = [target, ...(accept ?? [])].map(norm);
  const wrappers = Array.from(el.querySelectorAll('.ant-radio-button-wrapper, .ant-radio-wrapper'));
  const hits = wrappers.filter((w) => acc.includes(norm(text(w))));
  if (hits.length === 0) return fail('no-option', undefined, wrappers.map((w) => text(w)));
  if (hits.length > 1) return fail('no-option', '多个选项都相等', hits.map((w) => text(w)));
  const w = hits[0];
  if (w.classList.contains('ant-radio-button-wrapper-disabled') || w.classList.contains('ant-radio-wrapper-disabled')) return fail('locked');
  const input = w.querySelector('input') ?? w;
  safeClick(input);
  await settle();
  const ok = w.classList.contains('ant-radio-button-wrapper-checked') || w.classList.contains('ant-radio-wrapper-checked');
  return ok ? OK : fail('verify-failed');
}

// ---------------- antd Select ----------------

function selectInput(el: Element): HTMLInputElement | null {
  return el.querySelector('input.ant-select-selection-search-input, .ant-select-selection-search input');
}

/** 找到这个 Select 对应的下拉层（挂在 body 上）。 */
function dropdownOf(el: Element): Element | null {
  const input = selectInput(el);
  const listId = input?.getAttribute('aria-controls') || input?.getAttribute('aria-owns');
  if (listId) {
    // 有 aria-controls 时只认自己的下拉层，避免读到上一个正在关闭的下拉
    const list = document.getElementById(listId);
    const dd = list?.closest('.ant-select-dropdown');
    return dd && !dd.classList.contains('ant-select-dropdown-hidden') && !isLeaving(dd) && isVisible(dd) ? dd : null;
  }
  // 兜底：唯一一个打开着的下拉层
  const visible = openOverlays('.ant-select-dropdown', 'ant-select-dropdown-hidden');
  return visible.length === 1 ? visible[0] : null;
}

function optionTexts(dd: Element): string[] {
  return Array.from(dd.querySelectorAll('.ant-select-item-option')).map((o) => o.getAttribute('title') || text(o.querySelector('.ant-select-item-option-content')) || text(o));
}

function isOpen(el: Element): boolean {
  return el.classList.contains('ant-select-open') || !!dropdownOf(el);
}

async function openSelect(el: Element): Promise<Element> {
  if (el.classList.contains('ant-select-disabled')) throw new Error('locked');
  if (!isOpen(el)) {
    await waitOverlaysClosed('.ant-select-dropdown, .ant-picker-dropdown', 'ant-select-dropdown-hidden');
    const sel = el.querySelector('.ant-select-selector') ?? el;
    safeMouseDown(sel);
    fireMouse(sel, 'mouseup');
  }
  const input = selectInput(el);
  if (input) focusEl(input);
  return waitFor(() => dropdownOf(el), 3000, '下拉框展开');
}

export async function closeSelect(el: Element): Promise<void> {
  const input = selectInput(el);
  if (isOpen(el) && input) {
    fireKey(input, 'Escape');
    fireKey(input, 'Escape', 'keyup');
  }
  if (input) blurEl(input);
  // 等下拉层真正收起（含动画），避免影响下一个控件
  const start = Date.now();
  while (Date.now() - start < 600) {
    const anyOpen = Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).some(isVisible);
    if (!anyOpen) break;
    await sleep(50);
  }
}

async function typeSearch(el: Element, q: string): Promise<void> {
  const input = selectInput(el);
  if (!input) return;
  focusEl(input);
  setNativeValue(input, q);
}

function pickOption(dd: Element, title: string): Element | undefined {
  return Array.from(dd.querySelectorAll('.ant-select-item-option')).find((o) => norm(o.getAttribute('title') || text(o)) === norm(title));
}

function selectedText(el: Element): string {
  const it = el.querySelector('.ant-select-selection-item');
  return it ? it.getAttribute('title') || text(it) : '';
}

/**
 * 选择一项。只选“完全相等”（或 suffix 模式下唯一以路径结尾）的选项；
 * 多个候选或没有候选 → 关闭下拉、不选择，返回候选供用户确认。
 */
async function fillSelect(el: Element, v: Extract<FillValue, { t: 'option' }>): Promise<DriverResult> {
  let dd: Element;
  try {
    dd = await openSelect(el);
  } catch (e) {
    return (e as Error).message === 'locked' ? fail('locked') : fail('timeout', '下拉框没有展开');
  }
  try {
    const accept = [v.text, ...(v.accept ?? [])].map(norm);
    const matchFn = (o: string) => {
      const on = norm(o);
      if (v.match === 'suffix') {
        const segs = on.split('/').filter(Boolean).join('/');
        return accept.some((a) => segs === a || segs.endsWith('/' + a));
      }
      return accept.includes(on);
    };
    let hits = optionTexts(dd).filter(matchFn);
    if (hits.length === 0 && v.search !== undefined && selectInput(el)) {
      await typeSearch(el, v.search);
      try {
        await waitStable(() => optionTexts(dropdownOf(el) ?? dd), 200, 3000);
      } catch {
        /* 继续用当前选项 */
      }
      dd = dropdownOf(el) ?? dd;
      hits = optionTexts(dd).filter(matchFn);
    }
    hits = [...new Set(hits)];
    if (hits.length !== 1) {
      const cands = hits.length > 1 ? hits : optionTexts(dd).slice(0, 10);
      await closeSelect(el);
      return fail('no-option', hits.length > 1 ? '多个选项都符合，未选择' : '没有完全相等的选项，未选择', cands);
    }
    const opt = pickOption(dd, hits[0]);
    if (!opt) {
      await closeSelect(el);
      return fail('no-option');
    }
    fireMouse(opt, 'mousemove');
    safeClick(opt);
    await settle();
    if (isOpen(el)) await closeSelect(el);
    const got = selectedText(el);
    if (norm(got) !== norm(hits[0])) return fail('verify-failed', '选中后显示的内容不一致');
    if (formItemHasError(el)) return fail('verify-failed', '网站提示该项有误');
    return OK;
  } catch (e) {
    await closeSelect(el);
    if (e instanceof TimeoutError) return fail('timeout');
    throw e;
  }
}

/** 远程搜索：输入完整名称，等加载结束、选项稳定 300ms，只选完全相等的候选。 */
async function fillRemoteSelect(el: Element, v: Extract<FillValue, { t: 'remote-option' }>): Promise<DriverResult> {
  const accept = v.accept.map(norm);
  try {
    await openSelect(el);
  } catch {
    // 远程搜索的下拉在输入前可能不渲染
  }
  await typeSearch(el, v.query);
  let opts: string[] = [];
  try {
    await waitFor(() => {
      const dd = dropdownOf(el);
      if (!dd) return false;
      const loading = el.querySelector('.ant-select-arrow-loading, .anticon-loading') || dd.querySelector('.ant-spin-spinning');
      // 远程搜索常有防抖且不显示 loading；空列表稳定不代表本次请求完成。
      return !loading && optionTexts(dd).some((o) => accept.includes(norm(o)));
    }, 8000, '远程搜索结果');
    opts = await waitStable(() => {
      const dd = dropdownOf(el);
      return dd ? optionTexts(dd) : [];
    }, 300, 8000);
  } catch {
    const dd = dropdownOf(el);
    if (!dd) {
      await closeSelect(el);
      return fail('timeout', '远程搜索没有返回结果');
    }
    opts = optionTexts(dd);
  }
  const hits = [...new Set(opts.filter((o) => accept.includes(norm(o))))];
  if (hits.length !== 1) {
    await closeSelect(el);
    return fail('no-option', hits.length > 1 ? '多个候选完全相同' : '候选中没有名称完全相等的项', opts.slice(0, 10));
  }
  const dd = dropdownOf(el)!;
  const opt = pickOption(dd, hits[0])!;
  safeClick(opt);
  await settle(250);
  if (isOpen(el)) await closeSelect(el);
  return norm(selectedText(el)) === norm(hits[0]) ? OK : fail('verify-failed');
}

// ---------------- antd Cascader ----------------

function cascaderDropdown(): Element | null {
  const all = openOverlays('.ant-cascader-dropdown, .ant-select-dropdown', 'ant-select-dropdown-hidden').filter((d) => d.querySelector('.ant-cascader-menu'));
  return all[all.length - 1] ?? null;
}

async function fillCascader(el: Element, path: string[]): Promise<DriverResult> {
  if (el.classList.contains('ant-select-disabled')) return fail('locked');
  await waitOverlaysClosed('.ant-select-dropdown, .ant-picker-dropdown', 'ant-select-dropdown-hidden');
  const sel = el.querySelector('.ant-select-selector') ?? el;
  safeMouseDown(sel);
  fireMouse(sel, 'mouseup');
  let dd: Element;
  try {
    dd = await waitFor(() => cascaderDropdown(), 3000, '级联菜单展开');
  } catch {
    return fail('timeout', '级联菜单没有展开');
  }
  const chosen: string[] = [];
  let t = 0; // 目标路径下标
  for (let col = 0; col < 6 && t < path.length; col++) {
    let menu: Element;
    try {
      menu = await waitFor(() => (cascaderDropdown() ?? dd).querySelectorAll('.ant-cascader-menu')[col], 5000, '下一级菜单');
    } catch {
      break;
    }
    // 等待异步加载完成（菜单项稳定）
    try {
      await waitStable(() => Array.from(menu.querySelectorAll('.ant-cascader-menu-item')).map((i) => i.getAttribute('title') || text(i)), 200, 4000);
    } catch {
      /* 用当前项 */
    }
    const items = Array.from(menu.querySelectorAll('.ant-cascader-menu-item')).filter((i) => !i.classList.contains('ant-cascader-menu-item-disabled'));
    const label = (i: Element) => i.getAttribute('title') || text(i.querySelector('.ant-cascader-menu-item-content')) || text(i);
    let hit = items.filter((i) => regionKey(label(i)) === regionKey(path[t]));
    let advance = true;
    if (hit.length === 0 && t > 0 && chosen.length) {
      // 直辖市兼容：第二层是与省同名的“北京市”
      hit = items.filter((i) => regionKey(label(i)) === regionKey(chosen[chosen.length - 1]));
      advance = false;
    }
    if (hit.length !== 1) {
      fireKey(document.activeElement ?? document.body, 'Escape');
      await sleep(100);
      return fail('no-option', `第 ${col + 1} 级找不到“${path[t]}”${chosen.length ? `（已选到 ${chosen.join(' / ')}，已停止）` : ''}`, items.slice(0, 12).map(label));
    }
    chosen.push(label(hit[0]));
    safeClick(hit[0]);
    if (advance) t++;
    await sleep(120);
  }
  await settle(200);
  // 直辖市：目标已用完，但下一列只有与省同名的“北京市”一项 → 补选这一层
  const ddAfter = cascaderDropdown();
  if (ddAfter && chosen.length) {
    const menus = ddAfter.querySelectorAll('.ant-cascader-menu');
    const lastMenu = menus[menus.length - 1];
    if (menus.length > chosen.length && lastMenu) {
      const label = (i: Element) => i.getAttribute('title') || text(i);
      const same = Array.from(lastMenu.querySelectorAll('.ant-cascader-menu-item')).filter((i) => regionKey(label(i)) === regionKey(chosen[chosen.length - 1]));
      if (same.length === 1) {
        chosen.push(label(same[0]));
        safeClick(same[0]);
        await settle(250);
      }
    }
  }
  if (cascaderDropdown()) {
    fireKey(selectInput(el) ?? el, 'Escape');
    await sleep(100);
  }
  const shown = selectedText(el);
  const ok = path.every((p) => regionKey(shown).includes(regionKey(p)) || norm(shown).includes(regionKey(p)));
  if (!shown) return fail('verify-failed', '级联选择后输入框为空（可能还有下一级）');
  return ok ? OK : fail('verify-failed', '级联显示与目标不一致');
}

// ---------------- 分类弹窗（国聘证书：左侧分类、右侧证书项） ----------------

function categoryModal(): Element | null {
  const all = Array.from(document.querySelectorAll('.ant-modal')).filter((m) => !isLeaving(m) && isVisible(m) && m.querySelector('.level-item'));
  return all[all.length - 1] ?? null;
}

const levelLabel = (i: Element) => text(i.querySelector('.item-txt')) || text(i);
const leafLabel = (i: Element) => i.getAttribute('title') || text(i);
const modalLeaves = (m: Element) => Array.from(m.querySelectorAll('.leaf-item'));

export async function closeCategoryModal(): Promise<void> {
  const m = categoryModal();
  if (!m) return;
  const x = m.querySelector('.ant-modal-close');
  if (x) safeClick(x);
  else fireKey(m, 'Escape');
  try {
    await waitFor(() => !categoryModal(), 1500, '弹窗关闭');
  } catch {
    /* 由调用方报告 */
  }
}

/** 切换到某个分类，等右侧证书项稳定。 */
async function showCategory(m: Element, name: string): Promise<boolean> {
  const item = Array.from(m.querySelectorAll('.level-item')).find((i) => norm(levelLabel(i)) === norm(name));
  if (!item) return false;
  if (!item.classList.contains('active')) {
    safeClick(item);
    try {
      await waitFor(() => item.classList.contains('active') || norm(text(m.querySelector('.label-path'))).includes(norm(name)), 2000, '切换分类');
    } catch {
      return false;
    }
  }
  try {
    await waitStable(() => modalLeaves(m).map(leafLabel).join('|'), 120, 2000);
  } catch {
    /* 用当前项 */
  }
  return true;
}

async function fillCategoryPopup(el: Element, v: Extract<FillValue, { t: 'popup-pick' }>): Promise<DriverResult> {
  if (el.classList.contains('ant-select-disabled')) return fail('locked');
  await waitOverlaysClosed('.ant-select-dropdown, .ant-picker-dropdown', 'ant-select-dropdown-hidden');
  const sel = el.querySelector('.ant-select-selector') ?? el;
  let m: Element;
  try {
    safeMouseDown(sel);
    fireMouse(sel, 'mouseup');
    m = await waitFor(() => categoryModal(), 1000, '证书弹窗打开');
  } catch {
    try {
      safeClick(sel);
      m = await waitFor(() => categoryModal(), 3000, '证书弹窗打开');
    } catch {
      return fail('timeout', '证书弹窗没有打开');
    }
  }

  let pick: CertLeaf | undefined;
  if (v.path) {
    pick = { category: v.path[0], name: v.path[1] };
  } else {
    const all = Array.from(m.querySelectorAll('.level-item')).map(levelLabel);
    const hinted = (v.categories ?? []).filter((c) => all.some((a) => norm(a) === norm(c)));
    const order = [...hinted, ...all.filter((a) => !hinted.some((h) => norm(h) === norm(a)))];
    const exact: CertLeaf[] = [];
    const loose: CertLeaf[] = [];
    for (let i = 0; i < order.length; i++) {
      if (!(await showCategory(m, order[i]))) continue;
      const r = matchCertLeaves(modalLeaves(m).map((l) => ({ category: order[i], name: leafLabel(l) })), v.names);
      exact.push(...r.exact);
      loose.push(...r.loose);
      // 优先分类里已找到名称一致的，就不再翻其他分类
      if (i === hinted.length - 1 && uniqueByName(exact).length === 1) break;
    }
    const ex = uniqueByName(exact);
    if (ex.length === 1) {
      pick = ex[0];
    } else {
      await closeCategoryModal();
      if (ex.length > 1) return fail('no-option', '多个证书名称都符合，未选择', ex.map(certPath));
      const near = uniqueByName(loose);
      return fail('no-option', near.length ? '没有名称一致的证书，下面是相近的，请确认' : `证书弹窗中没有找到“${v.names[0]}”，请手动选择`, near.slice(0, 8).map(certPath));
    }
  }

  if (!(await showCategory(m, pick.category))) {
    await closeCategoryModal();
    return fail('no-option', `证书弹窗中没有“${pick.category}”分类`);
  }
  const leaf = modalLeaves(m).find((l) => norm(leafLabel(l)) === norm(pick!.name));
  if (!leaf) {
    await closeCategoryModal();
    return fail('no-option', `“${pick.category}”中没有“${pick.name}”`);
  }
  safeClick(leaf);
  try {
    await waitFor(() => !categoryModal(), 2000, '弹窗关闭');
  } catch {
    await closeCategoryModal();
    return fail('verify-failed', '点选证书后弹窗没有关闭，请在页面上确认');
  }
  await settle(200);
  const shown = selectedText(el) || text(el.querySelector('.ant-select-selection-item'));
  if (!norm(shown).includes(norm(pick.name))) return fail('verify-failed', '选择后输入框显示的证书不一致');
  if (formItemHasError(el)) return fail('verify-failed', '网站提示该项有误');
  return OK;
}

// ---------------- antd DatePicker ----------------

function pickerDropdown(): Element | null {
  const all = openOverlays('.ant-picker-dropdown', 'ant-picker-dropdown-hidden');
  return all[all.length - 1] ?? null;
}

function panelKind(dd: Element): 'year' | 'month' | 'day' | 'decade' | undefined {
  if (dd.querySelector('.ant-picker-date-panel')) return 'day';
  if (dd.querySelector('.ant-picker-month-panel')) return 'month';
  if (dd.querySelector('.ant-picker-year-panel')) return 'year';
  if (dd.querySelector('.ant-picker-decade-panel')) return 'decade';
  return undefined;
}

function headerYearMonth(dd: Element): { y?: number; m?: number } {
  const header = dd.querySelector('.ant-picker-header-view');
  const yt = text(header?.querySelector('.ant-picker-year-btn')) || text(header);
  const mt = text(header?.querySelector('.ant-picker-month-btn'));
  const y = Number((yt.match(/(\d{4})/) ?? [])[1]);
  const m = Number((mt.match(/(\d{1,2})/) ?? [])[1]);
  return { y: Number.isFinite(y) && y > 0 ? y : undefined, m: Number.isFinite(m) && m > 0 ? m : undefined };
}

function cellDate(cell: Element, kind: 'year' | 'month' | 'day', dd: Element): DateParts | null {
  const title = cell.getAttribute('title');
  if (title) {
    const d = extractDate(title);
    if (d && d !== 'present') return d;
  }
  // 没有 title 时：用头部年份 + 单元格文字
  const { y } = headerYearMonth(dd);
  const t = text(cell);
  if (kind === 'year') return /^\d{4}$/.test(t) ? { y: Number(t) } : null;
  if (kind === 'month' && y) {
    const m = Number((t.match(/(\d{1,2})/) ?? [])[1]);
    return m ? { y, m } : null;
  }
  return null;
}

function findCell(dd: Element, target: DateParts, kind: 'year' | 'month' | 'day'): Element | undefined {
  const cells = Array.from(dd.querySelectorAll('td.ant-picker-cell')).filter((c) => c.classList.contains('ant-picker-cell-in-view'));
  return cells.find((c) => {
    const d = cellDate(c, kind, dd);
    if (!d) return false;
    if (kind === 'year') return d.y === target.y && d.m === undefined;
    if (kind === 'month') return d.y === target.y && d.m === target.m && d.d === undefined;
    return d.y === target.y && d.m === target.m && d.d === target.d;
  });
}

function firstInViewDate(dd: Element, kind: 'year' | 'month' | 'day'): DateParts | null {
  const c = dd.querySelector('td.ant-picker-cell-in-view');
  return c ? cellDate(c, kind, dd) : null;
}

async function navigateAndPick(target: DateParts, wantKind?: 'year' | 'month' | 'day'): Promise<DriverResult> {
  for (let step = 0; step < 80; step++) {
    const dd = pickerDropdown();
    if (!dd) return fail('timeout', '日期面板已关闭');
    const kind = panelKind(dd);
    if (!kind || kind === 'decade') return fail('not-supported', '无法识别的日期面板');
    const need = wantKind ?? kind;
    if (need === 'day' && target.d === undefined) return fail('verify-failed', '页面要求精确到日，档案只到月');
    if (need === 'month' && target.m === undefined) return fail('verify-failed', '页面要求精确到月，档案只到年');
    const cell = findCell(dd, target, kind);
    if (cell) {
      if (cell.classList.contains('ant-picker-cell-disabled')) return fail('no-option', '该日期在网站上不可选');
      safeClick(cell.querySelector('.ant-picker-cell-inner') ?? cell);
      return OK;
    }
    // 翻页
    const first = firstInViewDate(dd, kind);
    if (!first) return fail('not-supported', '无法读取面板日期');
    const curIndex = kind === 'day' ? first.y * 12 + (first.m ?? 1) : first.y;
    const tgtIndex = kind === 'day' ? target.y * 12 + (target.m ?? 1) : target.y;
    const back = tgtIndex < curIndex;
    const bigJump = kind === 'day' && Math.abs(tgtIndex - curIndex) >= 12;
    const sel = back
      ? bigJump || kind !== 'day'
        ? '.ant-picker-header-super-prev-btn'
        : '.ant-picker-header-prev-btn'
      : bigJump || kind !== 'day'
        ? '.ant-picker-header-super-next-btn'
        : '.ant-picker-header-next-btn';
    const btns = Array.from(dd.querySelectorAll(sel)).filter((b) => (b as HTMLElement).style.visibility !== 'hidden');
    const btn = back ? btns[0] : btns[btns.length - 1];
    if (!btn) return fail('not-supported', '日期面板无法翻页');
    safeClick(btn);
    await sleep(40);
  }
  return fail('timeout', '翻页次数过多');
}

/**
 * 关闭所有还开着的日期面板。只按 Esc 不一定关得掉：面板由别的输入框（国聘结束时间的显示框）打开时，
 * 焦点不在面板的输入框上，Esc 传不到它。此时在面板外按下鼠标（等同用户点空白处）。
 */
export async function closeOpenPickers(): Promise<void> {
  for (let i = 0; i < 3 && pickerDropdown(); i++) {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
    fireKey(active, 'Escape');
    await sleep(80);
    if (!pickerDropdown()) break;
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) fireMouse(document.body, t);
    await sleep(120);
  }
  await waitOverlaysClosed('.ant-picker-dropdown', 'ant-picker-dropdown-hidden', 600);
}

/** 打开 input 对应的日期面板。reuse：沿用已打开的面板（日期区间选完开始后自动切到结束）。 */
async function openPicker(input: HTMLInputElement, ms = 3000, reuse = false): Promise<Element> {
  if (!(reuse && pickerDropdown())) {
    // 已经开着的面板属于别的控件（例如探测后没关掉），先关掉，不能拿来选
    if (pickerDropdown()) await closeOpenPickers();
    await waitOverlaysClosed('.ant-picker-dropdown, .ant-select-dropdown', 'ant-picker-dropdown-hidden');
    safeMouseDown(input);
    focusEl(input);
    fireMouse(input, 'mouseup');
    fireMouse(input, 'click');
  }
  return waitFor(() => pickerDropdown(), ms, '日期面板展开');
}

/**
 * 国聘的“结束时间”由三部分组成：隐藏的 period_end、只读显示框 period_end_input、日期面板 period_end_picker。
 * 返回同组的全部输入框（用于打开面板与核验），没有分组时只返回自身。
 */
export function dateGroupInputs(el: Element): HTMLInputElement[] {
  const own = dateInputOf(el);
  const group = el.closest('.period-end');
  const rest = group
    ? (Array.from(group.querySelectorAll('input')) as HTMLInputElement[]).filter((i) => i !== own && i.type !== 'hidden' && i.type !== 'radio' && i.type !== 'checkbox')
    : [];
  return [...(own ? [own] : []), ...rest];
}

/** 打开日期面板：先点本控件；不出现面板时依次尝试同组的其他输入框。 */
async function openPickerFor(el: Element): Promise<HTMLInputElement | null> {
  const inputs = dateGroupInputs(el).filter((i) => !i.disabled);
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];
    // 隐藏的表单项（ant-form-item-hidden）只保存值，不是给人点的
    if (inp.closest('.ant-form-item-hidden')) continue;
    try {
      await openPicker(inp, i === 0 ? 1500 : 1200);
      return inp;
    } catch {
      /* 换下一个 */
    }
  }
  return null;
}

function groupShown(el: Element): string[] {
  return dateGroupInputs(el).map((i) => i.value.trim()).filter(Boolean);
}

/** 部分面板选完后还要点“确定”。 */
async function confirmPickerIfNeeded(): Promise<void> {
  const dd = pickerDropdown();
  if (!dd) return;
  const ok = dd.querySelector('.ant-picker-ok button:not([disabled])');
  if (ok) {
    safeClick(ok);
    await sleep(120);
  }
}

function targetText(t: DateParts | 'present'): string {
  return t === 'present' ? '至今' : `${t.y}${t.m ? '-' + String(t.m).padStart(2, '0') : ''}${t.d ? '-' + String(t.d).padStart(2, '0') : ''}`;
}

async function closePicker(input: HTMLInputElement): Promise<void> {
  if (pickerDropdown()) {
    fireKey(input, 'Escape');
    await sleep(80);
  }
  if (pickerDropdown()) await closeOpenPickers();
  blurEl(input);
}

function dateInputOf(el: Element): HTMLInputElement | null {
  return (el instanceof HTMLInputElement ? el : el.querySelector('input')) as HTMLInputElement | null;
}

function shownMatches(value: string, target: DateParts | 'present'): boolean {
  if (target === 'present') return value.includes('至今') || /2099/.test(value);
  const d = extractDate(value);
  return !!d && d !== 'present' && sameDate(d, target);
}

async function clickPresent(): Promise<boolean> {
  const dd = pickerDropdown();
  if (!dd) return false;
  const el = Array.from(dd.querySelectorAll('button, a, span, div, li')).find((e) => text(e) === '至今' && !e.querySelector('button, a, span, div, li'));
  if (!el) return false;
  safeClick(el);
  return true;
}

async function fillDate(el: Element, target: DateParts | 'present'): Promise<DriverResult> {
  const input = dateInputOf(el);
  if (!input) return fail('not-supported');
  if (input.disabled) return fail('locked');
  const opener = await openPickerFor(el);
  if (!opener) return fail('timeout', '点击后没有出现日期面板（请在页面上手动选择，并用“扫描诊断”生成报告反馈）');
  let r: DriverResult;
  if (target === 'present') {
    r = (await clickPresent()) ? OK : fail('no-option', '面板中没有“至今”');
  } else {
    // 先切到年份面板直接选年，再逐级向下（适用于年/月/日面板）
    r = await pickDateCascade(target);
    if (r.ok) await confirmPickerIfNeeded();
  }
  await settle(200);
  if (!r.ok) {
    await closePicker(opener);
    return r;
  }
  if (pickerDropdown()) await closePicker(opener);
  else blurEl(opener);
  await settle();
  // 核验：同组任何一个输入框（显示框 / 面板 / 隐藏值）显示目标即可
  const shown = groupShown(el);
  if (!shown.some((v) => shownMatches(v, target))) {
    const seen = shown.find((v) => extractDate(v)) ?? '';
    return fail('verify-failed', seen ? `页面显示“${seen}”，目标是 ${targetText(target)}` : `选择后日期框仍为空（目标 ${targetText(target)}）`);
  }
  if (formItemHasError(el)) return fail('verify-failed', '网站提示该项有误');
  return OK;
}

/** 在当前打开的面板上，按面板类型选中目标。日面板/月面板直接翻页；选中后若面板下钻则继续。 */
async function pickDateCascade(target: DateParts): Promise<DriverResult> {
  for (let i = 0; i < 4; i++) {
    const dd = pickerDropdown();
    if (!dd) return OK; // 选中后关闭 = 完成
    const kind = panelKind(dd);
    if (!kind || kind === 'decade') return fail('not-supported', '无法识别的日期面板');
    const before = dd.innerHTML.length;
    const r = await navigateAndPick(target, kind);
    if (!r.ok) return r;
    await sleep(120);
    const after = pickerDropdown();
    if (!after) return OK;
    const nk = panelKind(after);
    // 年面板选年后下钻到月面板、月面板下钻到日面板：继续
    if (nk === kind && after.innerHTML.length === before) return OK;
    if (kind === 'day' || (kind === 'month' && nk !== 'day') || (kind === 'year' && nk !== 'month' && nk !== 'day')) return OK;
  }
  return OK;
}

async function fillDateRange(el: Element, start: DateParts, end: DateParts | 'present'): Promise<DriverResult> {
  const inputs = Array.from(el.querySelectorAll('input')) as HTMLInputElement[];
  if (inputs.length < 2) return fail('not-supported');
  if (inputs[0].disabled) return fail('locked');
  try {
    await openPicker(inputs[0]);
  } catch {
    return fail('timeout', '日期面板没有展开');
  }
  let r = await navigateAndPick(start);
  if (!r.ok) {
    await closePicker(inputs[0]);
    return r;
  }
  await sleep(150);
  if (!pickerDropdown()) {
    try {
      await openPicker(inputs[1], 3000, true);
    } catch {
      return fail('timeout');
    }
  }
  r = end === 'present' ? ((await clickPresent()) ? OK : fail('no-option', '面板中没有“至今”')) : await navigateAndPick(end);
  await settle(200);
  if (!r.ok) {
    await closePicker(inputs[1]);
    return r;
  }
  if (pickerDropdown()) await closePicker(inputs[1]);
  await settle();
  const now = Array.from(el.querySelectorAll('input')) as HTMLInputElement[];
  if (!shownMatches(now[0].value, start) || !shownMatches(now[1].value, end)) return fail('verify-failed', '起止时间显示与目标不一致');
  if (formItemHasError(el)) return fail('verify-failed', '网站提示该项有误');
  return OK;
}

// ---------------- 入口 ----------------

export async function driveAntd(el: Element, kind: string, value: FillValue): Promise<DriverResult> {
  switch (value.t) {
    case 'text':
      if (kind === 'native-select') return fillNativeSelect(el as HTMLSelectElement, value.text);
      return fillText(el, value.text);
    case 'option':
      if (kind === 'native-select') return fillNativeSelect(el as HTMLSelectElement, value.text, value.accept);
      if (kind === 'radio') return fillNativeRadio(el as HTMLInputElement, value.text, value.accept);
      if (kind === 'radio-button') return fillRadioButton(el, value.text, value.accept);
      return fillSelect(el, value);
    case 'radio':
      if (kind === 'radio') return fillNativeRadio(el as HTMLInputElement, value.text, value.accept);
      return fillRadioButton(el, value.text, value.accept);
    case 'remote-option':
      return fillRemoteSelect(el, value);
    case 'cascade-multi':
      return fail('not-supported', '多选地区弹窗请手动选择');
    case 'cascade':
      return fillCascader(el, value.path);
    case 'popup-pick':
      return fillCategoryPopup(el, value);
    case 'date':
      return fillDate(el, value.date);
    case 'date-range':
      return fillDateRange(el, value.start, value.end);
    case 'checkbox': {
      const input = el as HTMLInputElement;
      if (input.checked !== value.checked) safeClick(input);
      await settle();
      return input.checked === value.checked ? OK : fail('verify-failed');
    }
  }
}

// ---------------- 撤销 ----------------

/** 清空 antd Select / Cascader / DatePicker。 */
export async function clearAntd(el: Element, kind: string): Promise<boolean> {
  if (kind === 'select' || kind === 'remote-select' || kind === 'cascader') {
    const clear = el.querySelector('.ant-select-clear');
    if (!clear) return false;
    fireMouse(el, 'mouseenter');
    fireMouse(clear, 'mousedown');
    fireMouse(clear, 'mouseup');
    fireMouse(clear, 'click');
    await settle();
    if (isOpen(el)) await closeSelect(el);
    return !el.querySelector('.ant-select-selection-item');
  }
  if (kind === 'date' || kind === 'date-range') {
    const clear = el.querySelector('.ant-picker-clear') ?? el.parentElement?.querySelector('.ant-input-clear-icon');
    if (!clear) return false;
    fireMouse(el, 'mouseenter');
    fireMouse(clear, 'mousedown');
    fireMouse(clear, 'mouseup');
    fireMouse(clear, 'click');
    await settle();
    if (pickerDropdown()) fireKey(document.activeElement ?? document.body, 'Escape');
    return Array.from(el.querySelectorAll('input')).every((i) => i.value === '') || (el instanceof HTMLInputElement && el.value === '');
  }
  return false;
}

// ---------------- 选项探测（展开下拉/日期面板读取选项和粒度，随即关闭，不选择任何值） ----------------

function visibleSelectDropdown(el: Element): Element | null {
  const input = el.querySelector('input');
  const listId = input?.getAttribute('aria-controls') || input?.getAttribute('aria-owns');
  if (listId) {
    const dd = document.getElementById(listId)?.closest('.ant-select-dropdown');
    return dd && !dd.classList.contains('ant-select-dropdown-hidden') && !isLeaving(dd) && isVisible(dd) ? dd : null;
  }
  const v = openOverlays('.ant-select-dropdown', 'ant-select-dropdown-hidden');
  return v.length === 1 ? v[0] : null;
}

async function probeSelect(el: Element): Promise<Partial<ProbeResult>> {
  if (el.classList.contains('ant-select-disabled')) return {};
  await waitOverlaysClosed('.ant-select-dropdown, .ant-picker-dropdown', 'ant-select-dropdown-hidden');
  const sel = el.querySelector('.ant-select-selector') ?? el;
  safeMouseDown(sel);
  fireMouse(sel, 'mouseup');
  const input = el.querySelector('input');
  if (input) focusEl(input as HTMLElement);
  try {
    const dd = await waitFor(() => visibleSelectDropdown(el), 2000, '下拉框展开');
    await sleep(120);
    const opts = Array.from(dd.querySelectorAll('.ant-select-item-option')).map((o) => o.getAttribute('title') || text(o));
    const holder = dd.querySelector('.rc-virtual-list-holder') as HTMLElement | null;
    const partial = !!holder && holder.scrollHeight > holder.clientHeight + 2;
    return { options: opts, optionsPartial: partial || opts.length === 0 };
  } catch {
    return {};
  } finally {
    await closeSelect(el);
  }
}


async function probeDate(el: Element): Promise<Partial<ProbeResult>> {
  const input = (el instanceof HTMLInputElement ? el : el.querySelector('input')) as HTMLInputElement | null;
  if (!input || input.disabled) return {};
  await waitOverlaysClosed('.ant-picker-dropdown, .ant-select-dropdown', 'ant-picker-dropdown-hidden');
  safeMouseDown(input);
  focusEl(input);
  fireMouse(input, 'mouseup');
  fireMouse(input, 'click');
  try {
    const dd = await waitFor(() => pickerDropdown(), 2000, '日期面板展开');
    await sleep(80);
    const precision = dd.querySelector('.ant-picker-date-panel')
      ? 'day'
      : dd.querySelector('.ant-picker-month-panel')
        ? 'month'
        : dd.querySelector('.ant-picker-year-panel')
          ? 'year'
          : undefined;
    const hasPresent = Array.from(dd.querySelectorAll('button, a, span, li, div')).some((e) => text(e) === '至今');
    return { datePrecision: precision, hasPresentOption: hasPresent };
  } catch {
    return {};
  } finally {
    if (pickerDropdown()) fireKey(input, 'Escape');
    await sleep(60);
    // 由显示框打开的面板收不到 Esc（国聘结束时间），必须确认真正关掉，否则下一个日期会选进这个面板
    if (pickerDropdown()) await closeOpenPickers();
    blurEl(input);
    await sleep(60);
  }
}

export async function probeAntd(el: Element, kind: string): Promise<Partial<ProbeResult>> {
  // 只探测已知能安全关闭的 antd 控件；其他组件库（iView、Arco…）的下拉不去展开，避免留下打开的浮层
  if (!el.closest('.ant-select, .ant-picker, .ant-input-affix-wrapper') || el.ownerDocument !== document) return {};
  if (kind === 'select') return probeSelect(el);
  if (kind === 'date' || kind === 'date-range') return probeDate(el);
  return {};
}
