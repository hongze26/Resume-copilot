// 没有内置适配器的网站：按页面文字找简历区块，按弹窗/区块定位表单。
//
// 针对两种常见形态：
// 1. 一页填完的申请表：多个区块标题（常是 div/span，不是 h 标签）+ 表单项。
// 2. “我的简历”简历中心（先预填、再统一投递）：左侧导航分成“基本信息 / 教育背景 / 工作履历…”子页面，
//    经历类记录点“添加”后在弹窗里填写。此时当前子页面由导航高亮项判断，弹窗内的字段归到对应区块。
//
// 3. 单项区块先显示为只读文字（“姓名：--”），点区块里的“编辑”才出现输入框：侧边栏提供“点‘编辑’并扫描”。
//
// 区块键在同一页面上稳定（t:标题 / page:标题 / dlg:标题），侧边栏据此跨多次扫描保持计划与记录绑定。
import { guessSection, isResumeSectionTitle, sectionCore } from '../../core/matcher/sections';
import { norm } from '../../core/normalize/text';
import { isVisible, safeClick, text, waitFor } from '../dom';
import { hintsFor, matchesSafe, q } from '../platform';
import { labelOf, readableDocuments } from '../scan';
import type { FormContainer, SectionHandle, SiteDom } from './types';

const HEADING_SEL = 'h1, h2, h3, h4, legend, .section-title, [class*="section-title"], [class*="SectionTitle"], .el-card__header, .ivu-card-head, .arco-card-header';

/** 不可能是区块标题的位置：表单标签、按钮链接、导航菜单、下拉浮层、表头。 */
const NOT_HEADING =
  'label, option, select, button, a, th, [class*="label"], [class*="dropdown"], [data-rc-overlay], nav, [role="navigation"], [role="tab"], [role="menu"], [role="menubar"], [role="menuitem"], .el-menu, .ant-menu, .ivu-menu, .arco-menu, [class*="menu-item"], [class*="menuItem"], [class*="catalog"], [class*="anchor"], .el-select-dropdown, .el-cascader-menus, .el-picker-panel';

const DIALOG_SEL = '.el-dialog, .ant-modal, .ivu-modal, .arco-modal, .n-modal, .layui-layer, .modal-dialog, [role="dialog"], [aria-modal="true"]';
const DIALOG_TITLE_SEL = '.el-dialog__title, .ant-modal-title, .ivu-modal-header-inner, .arco-modal-title, .n-card-header__main, .layui-layer-title, .modal-title, [class*="dialog__title"], [class*="dialog-title"], [class*="modal-title"]';
const CONTROL_SEL = 'input:not([type=hidden]):not([type=password]), textarea, select, .el-select, .ant-select';

/** 导航里表示“当前页”的高亮项（vue-router、Element/antd 菜单、常见 active 类）。 */
const ACTIVE_NAV = '.router-link-exact-active, .router-link-active, .is-active, .active, .current, .selected, [aria-current="page"], .ant-menu-item-selected, .ivu-menu-item-active';

const ADD_TEXT = /^[+＋]?\s*(添加|新增|增加)(一条|记录|经历|信息)?$/;
/** 单项区块先显示为只读文字、点“编辑”才出现输入框（智联、很多企业自建系统）。 */
const EDIT_TEXT = /^(编辑|修改)(信息|资料)?$/;

// ---------------- 弹窗 ----------------

/** 当前打开的、含表单控件的弹窗（登录框除外）。多个时取最后一个（最上层）。 */
export function openDialog(doc: Document = document): Element | undefined {
  const list = Array.from(doc.querySelectorAll(DIALOG_SEL)).filter(
    (d) => !d.parentElement?.closest(DIALOG_SEL) && isVisible(d) && !!d.querySelector(CONTROL_SEL) && !d.querySelector('input[type=password]'),
  );
  return list[list.length - 1];
}

function dialogTitle(d: Element): string {
  const t = d.querySelector(DIALOG_TITLE_SEL);
  if (t && text(t)) return sectionCore(text(t));
  const by = d.getAttribute('aria-labelledby');
  const lb = by ? d.ownerDocument.getElementById(by) : null;
  return lb ? sectionCore(text(lb)) : '';
}

// ---------------- 标题 ----------------

/** 当前子页面的名称：导航高亮项里像简历区块名的文字（“基本信息(必填)” → 基本信息）。 */
export function pageTitle(doc: Document = document): string {
  for (const e of Array.from(doc.querySelectorAll(ACTIVE_NAV))) {
    if (!isVisible(e) || e.closest(DIALOG_SEL)) continue;
    const t = sectionCore(text(e));
    if (isResumeSectionTitle(t)) return t;
  }
  return '';
}

/** 区块标题元素里的第一段文字（平台的区块标题里常常还装着“添加”按钮和说明）。 */
function firstText(el: Element): string {
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (t) return t;
  }
  return '';
}

/** 标题文字：平台提示指出的区块标题取第一段，其余取全部文字。 */
function titleOf(h: Element): string {
  return matchesSafe(h, hintsFor(h.ownerDocument)?.sectionTitle) ? firstText(h) : text(h);
}

function headingsIn(doc: Document): Element[] {
  // 平台提示（content/platform）给了区块和标题的位置：直接用，不再按文字猜
  const hints = hintsFor(doc);
  if (hints?.section && hints.sectionTitle) {
    const hs = q(doc, hints.section)
      .map((b) => q(b, hints.sectionTitle)[0])
      .filter((h): h is Element => !!h && isVisible(h) && !h.closest(DIALOG_SEL) && !!firstText(h));
    if (hs.length) return hs;
  }
  const out = new Set<Element>();
  const ok = (e: Element) => isVisible(e) && !e.closest(NOT_HEADING) && !e.closest(DIALOG_SEL);
  for (const h of Array.from(doc.querySelectorAll(HEADING_SEL))) {
    const t = text(h);
    if (t.length > 0 && t.length <= 20 && ok(h)) out.add(h);
  }
  // 文字恰好是简历区块名的元素（取文字节点的父元素）
  const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  for (let n = 0; (node = walker.nextNode()) && n < 20000; n++) {
    const raw = (node.textContent ?? '').trim();
    if (raw.length < 2 || raw.length > 80 || !isResumeSectionTitle(raw)) continue;
    const p = node.parentElement;
    if (p && ok(p)) out.add(p);
  }
  // 外层与内层文字相同时只留外层；按文档顺序
  let list = [...out].filter((h) => ![...out].some((o) => o !== h && o.contains(h) && text(o) === text(h)));
  list.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  // 相邻两个同名标题（页面大标题 + 表单内小标题“基本信息”）：只留后一个，字段归它
  list = list.filter((h, i) => i === list.length - 1 || sectionCore(text(h)) !== sectionCore(text(list[i + 1])));
  return list;
}

/** 页面上像简历区块的标题文字（侧边栏提示“识别到了哪些区块”）。 */
export function resumeSectionTitles(): string[] {
  const titles = readableDocuments()
    .flatMap(headingsIn)
    .map((h) => sectionCore(titleOf(h)))
    .filter((t) => isResumeSectionTitle(t));
  return [...new Set(titles)];
}

function firstControlBefore(doc: Document, h: Element | undefined): boolean {
  // 平台提示给了“一条记录的容器”时，只有容器里的控件才会被扫描；页头的搜索框不算表单项
  const groups = q(doc, hintsFor(doc)?.group);
  const c = Array.from(doc.querySelectorAll(CONTROL_SEL)).find((e) => isVisible(e) && !e.closest(DIALOG_SEL) && (!groups.length || groups.some((g) => g.contains(e))));
  if (!c) return false;
  return !h || !!(c.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function keyed(prefix: string, title: string, used: Set<string>): string {
  const base = `${prefix}:${norm(title) || 'form'}`;
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}#${i}`;
  used.add(key);
  return key;
}

/** 弹窗属于哪个区块：同名区块 → 同类区块 → 当前子页面 → 单独一个弹窗区块。 */
function dialogSection(sections: SectionHandle[], dialog: Element, used: Set<string>): SectionHandle {
  const dt = dialogTitle(dialog);
  const pt = pageTitle(dialog.ownerDocument);
  const want = guessSection(dt).collection !== 'single' || !pt ? dt : pt;
  const col = guessSection(want).collection;
  const same =
    sections.find((s) => sectionCore(s.title) === sectionCore(want)) ??
    (col !== 'single' && col !== 'manual' ? sections.find((s) => guessSection(s.title).collection === col) : undefined);
  if (same) return same;
  const title = want || pt || '弹窗表单';
  return { key: keyed('dlg', title, used), title, el: dialog };
}

// ---------------- 区块与表单 ----------------

interface Layout {
  sections: SectionHandle[];
  dialog?: { el: Element; section: SectionHandle };
}

/** 同一轮计算（一次扫描、一次 sections-changed）里多次调用时复用结果。 */
let cached: { at: number; value: Layout } | undefined;

function layout(): Layout {
  if (cached && Date.now() - cached.at < 150) return cached.value;
  const value = computeLayout();
  cached = { at: Date.now(), value };
  return value;
}

function computeLayout(): Layout {
  const used = new Set<string>();
  const sections: SectionHandle[] = [];
  const docs = readableDocuments();
  docs.forEach((doc, di) => {
    const hs = headingsIn(doc);
    // 第一个标题之前就有表单项（或页面没有区块标题）：用导航高亮项（或网页标题）作为整页区块
    if (di === 0 && firstControlBefore(doc, hs[0])) {
      const title = pageTitle(doc) || sectionCore(doc.title).slice(0, 20) || '本页';
      sections.push({ key: keyed('page', title, used), title, el: doc.body });
    }
    for (const h of hs) {
      const title = sectionCore(titleOf(h)).replace(/[(（](必填|选填)[)）]/, '') || titleOf(h);
      sections.push({ key: keyed('t', title, used), title, el: h });
    }
  });
  const d = openDialog(document);
  if (!d) return { sections };
  const sec = dialogSection(sections, d, used);
  if (!sections.includes(sec)) sections.push(sec);
  return { sections, dialog: { el: d, section: sec } };
}

/** 元素是否在区块范围内：区块标题之后、下一个区块标题之前（弹窗区块不参与划分）。 */
function inRange(section: SectionHandle, sections: SectionHandle[]): (e: Element) => boolean {
  const doc = section.el.ownerDocument;
  const heads = sections.filter((s) => s.el !== doc.body && s.el.ownerDocument === doc && !s.key.startsWith('dlg:'));
  const next = heads[heads.indexOf(section) + 1];
  return (e) => {
    const afterHead = section.el.contains(e) || !!(section.el.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
    const beforeNext = !next || !!(e.compareDocumentPosition(next.el) & Node.DOCUMENT_POSITION_FOLLOWING);
    return afterHead && beforeNext;
  };
}

/** 去掉按钮文字前的图标字符（“+ 添加”“✎编辑”）。 */
const buttonWord = (b: Element) => text(b).replace(/^[^一-龥A-Za-z+＋]+/, '');

/** 区块范围内文字匹配的按钮（整页区块取全页唯一的一个）。 */
function buttonFor(section: SectionHandle, sections: SectionHandle[], word: RegExp): HTMLElement | undefined {
  const doc = section.el.ownerDocument;
  const cands = Array.from(doc.querySelectorAll<HTMLElement>('button, a, [role="button"], .el-button, [class*="btn"], [class*="add"], [class*="edit"]')).filter(
    (b) => word.test(buttonWord(b)) && isVisible(b) && !b.closest(DIALOG_SEL) && !b.closest('nav, .el-menu, .ant-menu') && !b.parentElement?.closest('button, a, [role="button"]'),
  );
  // 同一个按钮常被多个选择器命中（外层 .btn 包着 button）：只留最外层
  const outer = cands.filter((b) => !cands.some((o) => o !== b && o.contains(b)));
  if (section.el === doc.body) return outer.length === 1 ? outer[0] : undefined;
  return outer.find(inRange(section, sections));
}

/** “添加/新增”按钮。 */
function addButtonFor(section: SectionHandle, sections: SectionHandle[]): HTMLElement | undefined {
  return buttonFor(section, sections, ADD_TEXT);
}

/** 单项区块的“编辑/修改”按钮。经历类的“编辑”是改已有记录，不自动点。 */
function editButtonFor(section: SectionHandle, sections: SectionHandle[]): HTMLElement | undefined {
  if (isRepeat(section)) return undefined;
  return buttonFor(section, sections, EDIT_TEXT);
}

function isRepeat(section: SectionHandle): boolean {
  const c = guessSection(section.title).collection;
  return c !== 'single' && c !== 'manual';
}

/** 区块范围内可见的输入控件数（不含弹窗）。 */
function controlsIn(section: SectionHandle, sections: SectionHandle[]): number {
  const doc = section.el.ownerDocument;
  const ok = section.el === doc.body ? () => true : inRange(section, sections);
  return Array.from(doc.querySelectorAll(CONTROL_SEL)).filter((e) => isVisible(e) && !e.closest(DIALOG_SEL) && ok(e)).length;
}

function controlCount(): number {
  return readableDocuments().reduce((n, d) => n + Array.from(d.querySelectorAll(CONTROL_SEL)).filter(isVisible).length, 0);
}

// ---------------- 多条记录排在同一页 ----------------

const FIELD_SEL = 'input:not([type=hidden]), textarea, select';

/** 两套字段名大体相同：至少两个相同，相同的占两边合起来的六成以上。 */
function alike(a: Set<string>, b: Set<string>): boolean {
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return both >= 2 && both / (a.size + b.size - both) >= 0.6;
}

const inferCache = new WeakMap<Document, { at: number; value: Element[] }>();

/**
 * 没有平台提示时按结构推断“一条记录的容器”：经历类区块里，同一个父元素下并排着几个容器，
 * 各自装着同一套字段名（学校、专业、学历…各出现一遍）。
 * 一行两栏的普通表单各栏字段名不同，起止时间的两半字段名只有一个，都不会被当成多条记录。
 */
function inferGroups(doc: Document, sections: SectionHandle[]): Element[] {
  const hit = inferCache.get(doc);
  if (hit && Date.now() - hit.at < 150) return hit.value;
  const out: Element[] = [];
  const controls = Array.from(doc.querySelectorAll(FIELD_SEL)).filter((e) => isVisible(e) && !e.closest(DIALOG_SEL) && !e.closest('[data-rc-overlay]'));
  const names = new Map<Element, string>();
  const nameOf = (c: Element) => {
    let n = names.get(c);
    if (n === undefined) names.set(c, (n = norm(labelOf(c, c))));
    return n;
  };
  for (const s of controls.length >= 4 ? sections : []) {
    if (s.el === doc.body || s.el.ownerDocument !== doc || s.key.startsWith('dlg:') || !isRepeat(s)) continue;
    const own = controls.filter(inRange(s, sections));
    if (own.length < 4) continue;
    const mine = new Set(own);
    const inside = (box: Element) => controls.filter((c) => box.contains(c));
    // 容器里的控件绝大多数属于这个区块（个别字段名长得像区块标题，会把它后面的控件划到别的区块去）
    const mostlyMine = (box: Element) => {
      const all = inside(box);
      const n = all.filter((c) => mine.has(c)).length;
      return n > 0 && n >= all.length * 0.8;
    };
    // 从区块里第一个控件一层层往上，找“并排的几个容器字段名相同”的那一层
    for (let a: Element = own[0], p = a.parentElement; p && a !== doc.body && mostlyMine(a); a = p, p = a.parentElement) {
      const sibs = Array.from(p.children).filter(mostlyMine);
      if (sibs.length >= 2) {
        const sets = sibs.map((c) => new Set(inside(c).map(nameOf).filter(Boolean)));
        const base = sets[sibs.indexOf(a)];
        const same = sibs.filter((_, i) => alike(base, sets[i]));
        const covered = own.filter((o) => same.some((c) => c.contains(o))).length;
        if (same.length >= 2 && covered >= own.length * 0.8) {
          out.push(...same);
          break;
        }
      }
      if (own.every((o) => p.contains(o))) break; // 再往上只剩整个区块
    }
  }
  inferCache.set(doc, { at: Date.now(), value: out });
  return out;
}

/** 一条记录的容器：平台提示给了就用提示的，否则按结构推断。 */
function recordGroups(doc: Document, sections: SectionHandle[]): { groups: Element[]; hinted: boolean } {
  const all = q(doc, hintsFor(doc)?.group).filter((g) => isVisible(g) && !g.closest(DIALOG_SEL));
  const hinted = all.filter((g) => !all.some((o) => o !== g && o.contains(g)));
  return hinted.length ? { groups: hinted, hinted: true } : { groups: inferGroups(doc, sections), hinted: false };
}

/** 这一页是不是“多条记录排在同一页”（侧边栏据此按“第 N 份表单对应档案第 N 条”安排）。 */
export function hasInlineGroups(): boolean {
  if (openDialog(document)) return false;
  const sections = layout().sections;
  return readableDocuments().some((doc) => recordGroups(doc, sections).groups.length > 0);
}

export const genericDom: SiteDom = {
  id: 'generic',
  findSections() {
    return layout().sections;
  },
  containers(sections, sectionKey) {
    const d = openDialog(document);
    if (d) {
      // 弹窗打开时只填弹窗（背后的页面通常被遮罩挡住，用户也只会看弹窗）
      const sec = sections.find((s) => s.el === d) ?? dialogSection(sections, d, new Set(sections.map((s) => s.key)));
      return !sectionKey || sec.key === sectionKey ? [{ section: sec, formIndex: 0, el: d }] : [];
    }
    const out: FormContainer[] = [];
    for (const doc of readableDocuments()) {
      // 多条经历排在同一页（平台提示给了“一条记录的容器”，或按结构推断出来）：每条记录一份表单，按区块内的顺序编号
      const { groups, hinted } = recordGroups(doc, sections);
      const count = new Map<string, number>();
      for (const g of groups) {
        const sec = this.sectionOf(g, sections);
        const k = sec?.key ?? 'page';
        const formIndex = count.get(k) ?? 0;
        count.set(k, formIndex + 1);
        if (!sectionKey || sec?.key === sectionKey) out.push({ section: sec, formIndex, el: g });
      }
      // 平台提示的容器包住了全部表单项；推断出来的只包住多条记录的区块，其余表单项照旧按整页扫描
      if (hinted) continue;
      if (doc.body) out.push({ formIndex: 0, el: doc.body, ...(groups.length ? { exclude: groups } : {}) });
    }
    return out;
  },
  sectionOf(el, sections) {
    const hs = sections ?? this.findSections();
    const d = el.closest(DIALOG_SEL);
    if (d) {
      const lay = layout();
      if (lay.dialog && lay.dialog.el === d) return hs.find((s) => s.key === lay.dialog!.section.key) ?? lay.dialog.section;
      return undefined;
    }
    let found: SectionHandle | undefined;
    for (const h of hs) {
      if (h.key.startsWith('dlg:') || h.el.ownerDocument !== el.ownerDocument) continue;
      if (h.el.contains(el)) found = h;
      else if (h.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = h;
    }
    return found;
  },
  openForms(section) {
    const lay = layout();
    if (lay.dialog) return lay.dialog.section.key === section.key ? [lay.dialog.el] : [];
    return [section.el.ownerDocument.body];
  },
  readSavedRecords(section) {
    // 只用于和档案记录比对“页面上是否已有这条”（学校名、单位名），不保存、不外发
    const body = section.el.ownerDocument.body as HTMLElement;
    return [(body.innerText ?? text(body)).slice(0, 30000)];
  },
  async openForm(section) {
    const lay = layout();
    if (lay.dialog) return { status: 'already-open' };
    const own = lay.sections.find((s) => s.key === section.key) ?? section;
    // 单项区块：已有输入框就直接扫描；只读展示时点“编辑”
    if (!isRepeat(own)) {
      if (controlsIn(own, lay.sections) > 0) return { status: 'already-open' };
      const edit = editButtonFor(own, lay.sections);
      if (!edit) return { status: 'no-button' };
      safeClick(edit, { allowAddEdit: true });
      try {
        await waitFor(() => openDialog(document) || controlsIn(own, computeLayout().sections) > 0, 5000, '表单展开');
        cached = undefined;
        return { status: 'opened' };
      } catch {
        return { status: 'timeout' };
      }
    }
    const btn = addButtonFor(own, lay.sections);
    if (!btn) return { status: 'no-button' };
    const before = controlCount();
    safeClick(btn, { allowAddEdit: true });
    try {
      await waitFor(() => openDialog(document) || controlCount() > before, 5000, '表单展开');
      return { status: 'opened' };
    } catch {
      return { status: 'timeout' };
    }
  },
  info(section) {
    const lay = layout();
    const sections = lay.sections;
    const own = sections.find((s) => s.key === section.key) ?? section;
    return {
      key: section.key,
      title: section.title,
      mode: 'unknown',
      openForms: lay.dialog?.section.key === section.key ? 1 : 0,
      openFormEmpty: false,
      recordCount: 0,
      hasAdd: !lay.dialog && !!addButtonFor(own, sections),
      // 只读展示的单项区块（范围内没有输入框，但有“编辑”）
      hasEdit: !lay.dialog && !isRepeat(own) && controlsIn(own, sections) === 0 && !!editButtonFor(own, sections),
    };
  },
};
