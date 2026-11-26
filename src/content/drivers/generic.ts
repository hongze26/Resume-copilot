// 通用驱动：没有专门驱动的自研组件（Moka 的 sd-、北森的 phoenix 等）。
//
// 不认组件库的类名：点开后看页面上新出现（或刚显示出来）的那一块，里面只含一段短文字的条目就是选项；
// 文字完全相等且唯一才点，点完读回控件显示的文字核对。拿不准就不选，并把输入的搜索文字清掉、把弹层关上。
// 平台提示（content/platform）给了弹层和选项的选择器时优先用它们。
import type { DateParts } from '../../core/normalize/date';
import { closest, ranked } from '../../core/normalize/similar';
import { norm } from '../../core/normalize/text';
import type { FillValue, ProbeResult } from '../../core/plan/types';
import { blurEl, fireKey, fireMouse, focusEl, isVisible, safeClick, setNativeValue, settle, sleep, text } from '../dom';
import { genericMeta, shownText, snapshotGeneric, type GenericMeta } from '../generic-kit';
import { fail, OK, type DriverResult } from './common';

const OPEN_TIMEOUT = 1500;
const SEARCH_TIMEOUT = 1200;
/** 带候选的搜索框（学校、专业）要等网站查库：真实网站常要 2–4 秒，候选一出现并稳定就不再等 */
const REMOTE_TIMEOUT = 6000;
/** 弹层里的操作文字和空状态，不是选项。 */
const ACTION_TEXT = /^(确定|确认|取消|清空|清除|重置|全选|搜索|关闭|完成)$/;
const EMPTY_TEXT = /暂无|无数据|没有找到|没有匹配|无匹配|无结果|没有任何|no data|no result|not found|加载中|loading/i;
const DIALOG_SEL = '[role="dialog"], [aria-modal="true"], .el-dialog, .ant-modal, .ivu-modal, .arco-modal, .modal-dialog';

type SelMeta = { popup?: string; option?: string };

export function isGenericControl(el: Element): boolean {
  return genericMeta.has(el);
}

function qs(root: ParentNode, sel: string | undefined): Element[] {
  if (!sel) return [];
  try {
    return Array.from(root.querySelectorAll(sel));
  } catch {
    return [];
  }
}

function trigger(root: Element): HTMLElement {
  if (root.tagName === 'INPUT') return root as HTMLElement;
  return (root.querySelector('input:not([type=hidden])') ?? root) as HTMLElement;
}

function floatingish(el: Element): boolean {
  const win = el.ownerDocument.defaultView ?? window;
  let n: Element | null = el;
  for (let i = 0; i < 4 && n && n !== el.ownerDocument.body; i++, n = n.parentElement) {
    const pos = win.getComputedStyle(n).position;
    if (pos === 'fixed' || pos === 'absolute') return true;
  }
  return false;
}

/** 只含一段短文字的条目：每段文字往上取到“只装着这一段文字”的最高一层。 */
function leafRows(popup: Element): Element[] {
  const out = new Set<Element>();
  const walker = popup.ownerDocument.createTreeWalker(popup, 4 /* NodeFilter.SHOW_TEXT */);
  let node: Node | null;
  for (let n = 0; (node = walker.nextNode()) && n < 3000; n++) {
    const t = (node.textContent ?? '').trim();
    if (!t || t.length > 40) continue;
    let e = node.parentElement;
    if (!e || e === popup) continue;
    while (e.parentElement && e.parentElement !== popup && text(e.parentElement) === text(e)) e = e.parentElement;
    if (isVisible(e)) out.add(e);
  }
  return [...out];
}

function optionEls(popup: Element, meta: SelMeta): Element[] {
  let list = qs(popup, meta.option).filter(isVisible);
  if (!list.length) list = Array.from(popup.querySelectorAll('[role="option"]')).filter(isVisible);
  if (!list.length) list = leafRows(popup);
  return list.filter((o) => {
    const t = text(o);
    return !!t && !ACTION_TEXT.test(t) && !EMPTY_TEXT.test(t);
  });
}

function distance(a: Element, b: Element): number {
  const p = a.getBoundingClientRect();
  const r = b.getBoundingClientRect();
  const dx = Math.max(r.left - p.right, p.left - r.right, 0);
  const dy = Math.max(r.top - p.bottom, p.top - r.bottom, 0);
  return dx + dy;
}

/** 从点开那一刻起记下页面上新增和刚改过样式的元素，用来认出这个控件的弹层。 */
class PopupWatch {
  private added = new Set<Element>();
  private changed = new Set<Element>();
  private obs: MutationObserver;
  constructor(
    private root: Element,
    private trg: Element,
    private meta: SelMeta,
  ) {
    this.obs = new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.type === 'childList') r.addedNodes.forEach((n) => n.nodeType === 1 && this.added.add(n as Element));
        else if (r.target.nodeType === 1) this.changed.add(r.target as Element);
      }
    });
    this.obs.observe(root.ownerDocument.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
  }
  stop(): void {
    this.obs.disconnect();
  }
  /** 当前打开着的弹层；没有返回 null。 */
  find(): Element | null {
    const doc = this.root.ownerDocument;
    const usable = (e: Element) => e.isConnected && e !== this.trg && !e.contains(this.trg) && !this.trg.contains(e) && !e.closest('[data-rc-overlay]') && isVisible(e);
    const hinted = qs(doc, this.meta.popup).filter(usable);
    if (hinted.length) return hinted.sort((a, b) => distance(a, this.root) - distance(b, this.root))[0];
    const cands: Element[] = [];
    // 组件里面新增的节点必须是浮层（否则可能是刚显示出来的已选值）；组件外面只改了样式的也必须是浮层
    for (const e of this.added) if (usable(e) && (!this.root.contains(e) || floatingish(e))) cands.push(e);
    for (const e of this.changed) if (usable(e) && !this.root.contains(e) && floatingish(e)) cands.push(e);
    const outer = cands.filter((c) => !cands.some((o) => o !== c && o.contains(c)));
    const withOptions = outer.filter((c) => optionEls(c, this.meta).length > 0);
    if (!withOptions.length) return null;
    return withOptions.sort((a, b) => Number(floatingish(b)) - Number(floatingish(a)) || distance(a, this.root) - distance(b, this.root))[0];
  }
}

async function openPopup(root: Element, meta: SelMeta): Promise<{ watch: PopupWatch; popup: Element | null }> {
  const trg = trigger(root);
  const watch = new PopupWatch(root, trg, meta);
  safeClick(trg);
  const start = Date.now();
  while (Date.now() - start < OPEN_TIMEOUT) {
    await sleep(60);
    const popup = watch.find();
    if (popup) return { watch, popup };
  }
  return { watch, popup: null };
}

/** 等选项列表不再变化；返回当前弹层里的选项。 */
async function settledOptions(watch: PopupWatch, meta: SelMeta, timeout: number, needSome: boolean): Promise<Element[]> {
  const deadline = Date.now() + timeout;
  let last = '\u0000';
  let since = Date.now();
  let opts: Element[] = [];
  while (Date.now() < deadline) {
    const popup = watch.find();
    opts = popup ? optionEls(popup, meta) : [];
    const sig = opts.map(text).join('|');
    if (sig !== last) {
      last = sig;
      since = Date.now();
    } else if (Date.now() - since >= 250 && (opts.length > 0 || !needSome)) break;
    await sleep(80);
  }
  return opts;
}

async function closePopup(root: Element, watch: PopupWatch | undefined): Promise<void> {
  const trg = trigger(root);
  const open = () => (watch ? !!watch.find() : false);
  if (watch && !open()) return;
  // 先点页面空白处（事件目标是 body，不会被当成点了弹窗遮罩）
  const body = root.ownerDocument.body;
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) fireMouse(body, t);
  blurEl(trg);
  await sleep(120);
  if (!open()) return;
  // 还开着再按 Esc；控件在弹窗里时不按（Esc 会把整个弹窗关掉，里面没保存的内容就没了）
  if (!root.closest(DIALOG_SEL)) {
    fireKey(trg, 'Escape');
    fireKey(trg, 'Escape', 'keyup');
    await sleep(120);
  }
}

function clearTyped(trg: HTMLElement): void {
  const input = trg as HTMLInputElement;
  if (input.tagName === 'INPUT' && !input.readOnly && input.value !== '') setNativeValue(input, '');
}

async function choose(root: Element, meta: SelMeta, option: Element, watch: PopupWatch): Promise<DriverResult> {
  const label = text(option);
  (option as HTMLElement).scrollIntoView?.({ block: 'nearest' });
  safeClick(option);
  await settle(120);
  await closePopup(root, watch);
  const shown = norm(shownText(root, meta.popup));
  const want = norm(label);
  if (shown && (shown === want || shown.includes(want))) return OK;
  return fail('verify-failed', '点了选项，但网页上没显示出来');
}

interface SelectOpts {
  /** 可输入时用来搜索的文字 */
  search?: string;
  /** 带候选的搜索框：没有完全相等的候选时选最接近的，并提示核对 */
  remote?: boolean;
  /** 选项文字以目标结尾也算（专业分类路径） */
  suffix?: boolean;
}

/** 在一个自研下拉里选中文字等于 want 之一的选项。 */
async function fillSelect(root: Element, meta: SelMeta, want: string[], o: SelectOpts = {}): Promise<DriverResult> {
  const trg = trigger(root) as HTMLInputElement;
  if (trg.disabled) return fail('locked');
  const acc = [...new Set(want.map(norm).filter(Boolean))];
  if (!acc.length) return fail('no-profile-value');
  const current = norm(shownText(root, meta.popup));
  if (current && acc.includes(current)) return { ok: true, detail: '页面已是这个值' };
  const hits = (opts: Element[]) => {
    const list = opts.filter((e) => {
      const t = norm(text(e));
      return acc.includes(t) || (o.suffix === true && acc.some((a) => t.endsWith('/' + a)));
    });
    // 同一文字出现多次（外层和内层都被当成选项）只算一个
    const byText = new Map(list.map((e) => [norm(text(e)), e]));
    return [...byText.values()];
  };
  const typable = trg.tagName === 'INPUT' && !trg.readOnly;
  const { watch, popup } = await openPopup(root, meta);
  let typed = false;
  try {
    if (!popup && !typable) return fail('timeout', '点了这一栏，但没有弹出选项');
    let opts = popup ? await settledOptions(watch, meta, 600, false) : [];
    let hit = hits(opts);
    if (hit.length === 0 && typable && o.search) {
      typed = true;
      focusEl(trg);
      setNativeValue(trg, o.search);
      opts = await settledOptions(watch, meta, o.remote ? REMOTE_TIMEOUT : SEARCH_TIMEOUT, true);
      hit = hits(opts);
    }
    if (hit.length === 1) return await choose(root, meta, hit[0], watch);
    const texts = [...new Set(opts.map(text))];
    if (hit.length > 1) {
      clearTyped(trg);
      await closePopup(root, watch);
      return fail('no-option', '有好几个选项都和档案里的值一样', hit.map(text));
    }
    if (o.remote && texts.length > 0) {
      const near = closest(want, texts);
      const el = near && opts.find((e) => text(e) === near.option);
      if (near && el) {
        const r = await choose(root, meta, el, watch);
        return r.ok ? { ok: true, warn: true, detail: `候选里没有和“${want[0]}”一字不差的，选了最接近的“${near.option}”，请核对` } : r;
      }
    }
    if (o.remote && typed && texts.length === 0) {
      // 一个候选都没有：有的网站允许直接输入。失焦后内容还在才算填上
      await closePopup(root, watch);
      await settle(300);
      const kept = norm(shownText(root, meta.popup));
      if (kept && kept.includes(norm(o.search!))) return { ok: true, detail: '网站没有给出候选，按输入的文字填写' };
      clearTyped(trg);
      return fail('no-option', '网站要求从候选里选，但没有搜到候选，请自己选');
    }
    clearTyped(trg);
    await closePopup(root, watch);
    return fail('no-option', undefined, ranked(want, texts).slice(0, 8));
  } catch (e) {
    clearTyped(trg);
    await closePopup(root, watch).catch(() => undefined);
    throw e;
  } finally {
    watch.stop();
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0');

async function fillYearMonth(meta: Extract<GenericMeta, { type: 'ym' }>, index: number, d: DateParts): Promise<DriverResult> {
  const ySel = meta.selects[index * 2];
  const mSel = meta.selects[index * 2 + 1];
  if (!ySel || !mSel) return fail('not-supported', '年月下拉的数量和预期不一样');
  if (d.m === undefined) return fail('no-profile-value', '档案里这个日期没写月份，网页要选到月');
  const sm: SelMeta = { popup: meta.popup, option: meta.option };
  const y = await fillSelect(ySel, sm, [String(d.y), `${d.y}年`], { search: String(d.y) });
  if (!y.ok) return { ...y, detail: `年份没选上${y.detail ? `：${y.detail}` : ''}`, candidates: undefined };
  const m = await fillSelect(mSel, sm, [String(d.m), `${d.m}月`, pad2(d.m), `${pad2(d.m)}月`]);
  if (!m.ok) return { ...m, detail: `月份没选上${m.detail ? `：${m.detail}` : ''}`, candidates: undefined };
  return OK;
}

async function setPresent(meta: Extract<GenericMeta, { type: 'ym' }>, checked: boolean): Promise<DriverResult> {
  const cb = meta.present;
  if (!cb) return checked ? fail('manual', '这一栏没有“至今”可选，请自己选') : OK;
  if (cb.checked !== checked) safeClick(cb);
  await settle(120);
  return cb.checked === checked ? OK : fail('verify-failed', '“至今”没有勾上');
}

/** 写入一个值并核验。 */
export async function driveGeneric(el: Element, _kind: string, value: FillValue): Promise<DriverResult> {
  const meta = genericMeta.get(el);
  if (!meta) return fail('not-supported');
  if (meta.type === 'ym') {
    if (value.t === 'date') {
      if (value.date === 'present') return fail('not-supported', '这一栏不能选“至今”');
      return fillYearMonth(meta, 0, value.date);
    }
    if (value.t === 'date-range') {
      if (meta.selects.length < 4) return meta.present ? fail('manual', '网页上勾着“至今”，结束时间选不了；请先取消“至今”再重新扫描') : fail('not-supported', '这一栏只有一组年月');
      const s = await fillYearMonth(meta, 0, value.start);
      if (!s.ok) return { ...s, detail: `开始时间：${s.detail ?? ''}` };
      if (value.end === 'present') return setPresent(meta, true);
      const un = await setPresent(meta, false);
      if (!un.ok) return un;
      const e = await fillYearMonth(meta, 1, value.end);
      return e.ok ? e : { ...e, detail: `结束时间：${e.detail ?? ''}` };
    }
    return fail('not-supported', '这一栏是年月下拉，只能按日期填');
  }
  const sm: SelMeta = { popup: meta.popup, option: meta.option };
  switch (value.t) {
    case 'option':
      return fillSelect(el, sm, [value.text, ...(value.accept ?? [])], { search: value.search ?? value.text, remote: meta.remote, suffix: value.match === 'suffix' });
    case 'remote-option':
      return fillSelect(el, sm, value.accept.length ? value.accept : [value.query], { search: value.query, remote: true });
    case 'radio':
      return fillSelect(el, sm, [value.text, ...(value.accept ?? [])], { search: value.text, remote: meta.remote });
    case 'text':
      if (value.text === '') return fail('not-supported', '这种下拉工具不会清空，请自己处理');
      return fillSelect(el, sm, [value.text], { search: value.text, remote: meta.remote });
    default:
      return fail('not-supported', '这种选择框工具还不会填，请自己选');
  }
}

export function snapshotGenericControl(el: Element, _kind: string): string {
  return snapshotGeneric(el);
}

/** 自研下拉没有可靠的清空方式：如实返回 false，撤销时提示本人处理。 */
export async function clearGeneric(_el: Element, _kind: string): Promise<boolean> {
  return false;
}

/** 执行出错时的兜底：点页面空白处，把这个控件留下的弹层关掉。 */
export async function closeGeneric(el: Element): Promise<void> {
  const meta = genericMeta.get(el);
  const roots = meta?.type === 'ym' ? meta.selects : [el];
  for (const r of roots) {
    clearTyped(trigger(r));
    await closePopup(r, undefined);
  }
}

/** 选项探测：展开读选项后立即关闭，不选任何值。带候选的搜索框不探测（不输入就没有候选）。 */
export async function probeGeneric(el: Element, _kind: string): Promise<Partial<ProbeResult>> {
  const meta = genericMeta.get(el);
  if (!meta) return {};
  if (meta.type === 'ym') return { datePrecision: 'month', hasPresentOption: !!meta.present };
  if (meta.remote) return {};
  const trg = trigger(el) as HTMLInputElement;
  if (trg.disabled) return {};
  const sm: SelMeta = { popup: meta.popup, option: meta.option };
  const { watch, popup } = await openPopup(el, sm);
  try {
    if (!popup) return {};
    const opts = await settledOptions(watch, sm, 500, false);
    const texts = [...new Set(opts.map(text))];
    return texts.length ? { options: texts, optionsPartial: texts.length >= 100 } : {};
  } finally {
    await closePopup(el, watch).catch(() => undefined);
    watch.stop();
  }
}
