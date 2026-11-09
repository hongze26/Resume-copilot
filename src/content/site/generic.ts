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
import { readableDocuments } from '../scan';
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

function headingsIn(doc: Document): Element[] {
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
    .map((h) => sectionCore(text(h)))
    .filter((t) => isResumeSectionTitle(t));
  return [...new Set(titles)];
}

function firstControlBefore(doc: Document, h: Element | undefined): boolean {
  const c = Array.from(doc.querySelectorAll(CONTROL_SEL)).find((e) => isVisible(e) && !e.closest(DIALOG_SEL));
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
      const title = sectionCore(text(h)).replace(/[(（](必填|选填)[)）]/, '') || text(h);
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
    for (const doc of readableDocuments()) if (doc.body) out.push({ formIndex: 0, el: doc.body });
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
