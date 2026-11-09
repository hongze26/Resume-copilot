// 通用字段扫描：只上报结构（标签、控件类型、是否为空、可见选项），不上报页面上已有的值。
import type { ControlKind, FieldDescriptor } from '../core/plan/types';
import { isEl, isTag, isVisible, text } from './dom';
import type { FormContainer, SectionHandle, SiteDom } from './site';

export interface Registered {
  el: Element; // 控件根元素
  kind: ControlKind;
  sectionKey?: string;
  formIndex: number;
  id?: string;
  label: string;
}

/** 本次扫描的控件登记表：key → 元素。执行时按 key 找回控件。 */
export const registry = new Map<string, Registered>();

const SITE_ID_SUFFIX = /-fe-\d+-customization$/;

export function stripId(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return id.replace(SITE_ID_SUFFIX, '').replace(/-[A-Za-z0-9]{6,}$/, (m) => (/\d/.test(m) && /[a-z]/i.test(m) ? '' : m));
}

/**
 * 其他常见组件库（只用于通用识别：判断控件类型和标签，不执行填写）。
 * 智联招聘、北森、大易、Moka 等页面常见 Element UI / Element Plus、iView(View UI)、Arco、Naive UI。
 */
const LIB_ROOTS: Array<[string, ControlKind]> = [
  ['.el-cascader, .ivu-cascader, .arco-cascader, .n-cascader', 'cascader'],
  ['.el-select, .ivu-select, .arco-select, .n-select', 'select'],
  // Element 1.x 的区间日期只有一个输入框，靠 el-date-editor--daterange 等类名区分
  ['.el-range-editor, .el-date-editor--daterange, .el-date-editor--monthrange, .el-date-editor--datetimerange, .ivu-date-picker-range, .arco-picker-range, .n-date-picker--range', 'date-range'],
  ['.el-date-editor, .ivu-date-picker, .arco-picker, .n-date-picker', 'date'],
  ['.el-radio-group, .ivu-radio-group, .arco-radio-group, .n-radio-group, [role="radiogroup"]', 'radio-button'],
  ['.el-checkbox-group, .ivu-checkbox-group, .arco-checkbox-group, .n-checkbox-group', 'checkbox'],
  ['.el-upload, .ivu-upload, .arco-upload, .n-upload', 'upload'],
  ['.el-input-number, .ivu-input-number, .arco-input-number, .n-input-number', 'number'],
];
const LIB_SEL = LIB_ROOTS.map(([s]) => s).join(', ');
const ANTD_SEL = '.ant-select, .ant-picker, .ant-radio-group, .ant-checkbox-group, .ant-upload, .ant-input-number';
const HOST_SEL = `${ANTD_SEL}, ${LIB_SEL}`;
const POPUP_SEL =
  '.ant-select-dropdown, .ant-picker-dropdown, .ant-cascader-dropdown, .ant-modal, [data-rc-overlay], .el-select-dropdown, .el-picker-panel, .el-cascader__dropdown, .ivu-select-dropdown, .arco-trigger-popup, .n-base-select-menu';

/** 找控件的“根”：组件库控件的外层，或原生元素自身。 */
function controlRoots(container: Element, skip?: string): Array<{ el: Element; kind: ControlKind }> {
  const out: Array<{ el: Element; kind: ControlKind }> = [];
  const seen = new Set<Element>();
  const push = (el: Element, kind: ControlKind) => {
    if (seen.has(el)) return;
    seen.add(el);
    out.push({ el, kind });
  };
  const all = container.querySelectorAll(`${HOST_SEL}, input, textarea, select`);
  for (const el of Array.from(all)) {
    if (el.closest(POPUP_SEL)) continue;
    if (skip && el.closest(skip)) continue;
    // 嵌套在已登记组件内的元素跳过
    const host = el.parentElement?.closest(HOST_SEL);
    if (host && container.contains(host)) continue;
    const lib = LIB_ROOTS.find(([s]) => el.matches(s));
    if (lib) {
      push(el, lib[1]);
      continue;
    }
    if (el.classList.contains('ant-select')) {
      push(el, el.classList.contains('ant-cascader') ? 'cascader' : 'select');
    } else if (el.classList.contains('ant-picker')) {
      push(el, el.classList.contains('ant-picker-range') ? 'date-range' : 'date');
    } else if (el.classList.contains('ant-radio-group')) {
      push(el, 'radio-button');
    } else if (el.classList.contains('ant-checkbox-group')) {
      push(el, 'checkbox');
    } else if (el.classList.contains('ant-upload')) {
      push(el, 'upload');
    } else if (el.classList.contains('ant-input-number')) {
      push(el, 'number');
    } else if (isTag(el, 'TEXTAREA')) {
      push(el, 'textarea');
    } else if (isTag(el, 'SELECT')) {
      push(el, 'native-select');
    } else if (isTag(el, 'INPUT')) {
      const t = (el.type || 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(t)) continue;
      if (t === 'file') {
        push(el, 'upload');
      } else if (t === 'radio') {
        // 原生 radio 按 name 归组，用第一个代表整组
        const name = el.name;
        const first = name ? container.querySelector(`input[type=radio][name="${CSS.escape(name)}"]`) : el;
        if (first) push(first, 'radio');
      } else if (t === 'checkbox') {
        push(el, 'checkbox');
      } else if (el.readOnly && el.closest('.ant-input-affix-wrapper') && el.closest('.ant-input-affix-wrapper')!.querySelector('.anticon-calendar')) {
        // 站点自定义的只读日期输入（国聘“结束时间”）
        push(el, 'date');
      } else {
        push(el, t === 'number' ? 'number' : 'text');
      }
    }
  }
  return out;
}

function primaryInput(el: Element, kind: ControlKind): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  if (isTag(el, 'INPUT') || isTag(el, 'TEXTAREA') || isTag(el, 'SELECT')) return el;
  if (kind === 'radio-button' || kind === 'checkbox') return null;
  return el.querySelector('input:not([type=hidden]), textarea');
}

const FORM_ITEM_SEL =
  '.el-form-item, .ivu-form-item, .arco-form-item, .n-form-item, .form-group, .form-item, .form-row, [class*="form-item"], [class*="FormItem"], [class*="formItem"], [class*="form-field"], [class*="FormField"]';
const LABEL_SEL = 'label, [class*="label"], [class*="Label"], [class*="item-title"], dt, th';

/** 向上找最多 3 层“表单项”容器，取其中不包含控件本身的标签文字。 */
function formItemLabel(el: Element): string {
  let item = el.parentElement?.closest(FORM_ITEM_SEL) ?? null;
  for (let depth = 0; item && depth < 3; depth++) {
    // 排除控件内部的文字（单选项“男/女”）和包着控件的元素
    const lab = Array.from(item.querySelectorAll(LABEL_SEL)).find((l) => !l.contains(el) && !el.contains(l) && !l.querySelector('input, select, textarea') && text(l).length > 0 && text(l).length <= 30);
    if (lab) return text(lab).replace(/[:：]\s*$/, '');
    item = item.parentElement?.closest(FORM_ITEM_SEL) ?? null;
  }
  return '';
}

/** 标签解析：antd 表单项标签 → label[for] → aria → 组件库表单项 → 外层 label → 前一个文本 → placeholder。 */
function labelOf(el: Element, input: Element | null): string {
  let item = el.closest('.ant-form-item');
  while (item) {
    const lab = item.querySelector(':scope > .ant-row > .ant-form-item-label label, :scope > .ant-form-item-label label');
    if (lab) {
      const t = (lab.getAttribute('title') || '').trim() || text(lab);
      if (t) return t;
    }
    item = item.parentElement?.closest('.ant-form-item') ?? null;
  }
  const doc = el.ownerDocument;
  const id = input?.id || (el as HTMLElement).id;
  if (id) {
    const l = doc.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (l && text(l)) return text(l);
  }
  const lb = (input ?? el).getAttribute('aria-labelledby');
  if (lb) {
    const t = lb
      .split(/\s+/)
      .map((i) => text(doc.getElementById(i)))
      .join(' ')
      .trim();
    if (t) return t;
  }
  const al = (input ?? el).getAttribute('aria-label');
  if (al) return al;
  // 其他组件库的表单项：Element（.el-form-item__label）、iView、Arco、Bootstrap（.form-group > label）及自定义“xx-form-item”
  const fromItem = formItemLabel(el);
  if (fromItem) return fromItem;
  // 原生单选组：标签是组的说明文字（fieldset legend 或组前面的文字），不是某个选项
  if (isTag(el, 'INPUT') && el.type === 'radio') {
    const fs = el.closest('fieldset');
    const legend = fs?.querySelector('legend');
    if (legend && text(legend)) return text(legend);
    const optionLabel = el.closest('label');
    const container = (optionLabel ?? el).parentElement;
    if (container) {
      const own = Array.from(container.childNodes)
        .filter((n) => !(isTag(n, 'LABEL')) && !(isTag(n, 'INPUT')))
        .map((n) => (n.textContent ?? '').trim())
        .filter(Boolean)
        .join(' ');
      if (own) return own;
    }
  }
  const wrapLabel = el.closest('label');
  if (wrapLabel) {
    // 只取 label 自身的文字节点，不含内部下拉的选项文字
    const own = Array.from(wrapLabel.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE || (isEl(n) && !n.matches('select, input, textarea') && !n.querySelector('select, input, textarea')))
      .map((n) => (n.textContent ?? '').trim())
      .filter(Boolean)
      .join(' ');
    if (own) return own;
  }
  // 表格布局：同一行的 th / 前一个 td
  const cell = el.closest('td');
  if (cell) {
    const prev = cell.previousElementSibling;
    if (prev && text(prev)) return text(prev);
  }
  // 前一个兄弟节点的文字
  let p: Element | null = el;
  for (let i = 0; i < 3 && p; i++) {
    const sib = p.previousElementSibling;
    if (sib && text(sib) && text(sib).length <= 20) return text(sib);
    p = p.parentElement;
  }
  const ph = (input as HTMLInputElement | null)?.placeholder;
  return ph || '';
}

function placeholderOf(el: Element, kind: ControlKind, input: Element | null): string | undefined {
  if ((kind === 'select' || kind === 'cascader' || kind === 'remote-select') && el.classList.contains('ant-select')) {
    return text(el.querySelector('.ant-select-selection-placeholder')) || undefined;
  }
  return (input as HTMLInputElement | null)?.placeholder || text(el.querySelector('[class*="placeholder"]')) || undefined;
}

/** 非 antd 下拉是否为空：输入框里显示的值，或“已选项”元素的文字（排除占位提示）。 */
function libSelectEmpty(el: Element): boolean {
  const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('input:not([type=hidden])'));
  if (inputs.some((i) => i.value.trim() !== '')) return false;
  const chosen = Array.from(el.querySelectorAll('[class*="selected"], [class*="selection-item"], [class*="view-value"], [class*="tags-text"], [class*="selection-label"], .el-cascader__label')).filter(
    (c) => !/placeholder|transparent/.test(String((c as HTMLElement).className)) && text(c) !== '',
  );
  return chosen.length === 0;
}

export function isEmptyControl(el: Element, kind: ControlKind): boolean {
  switch (kind) {
    case 'select':
    case 'remote-select':
    case 'cascader':
      if (!el.classList.contains('ant-select')) return libSelectEmpty(el);
      return !el.querySelector('.ant-select-selection-item');
    case 'date':
      return (isTag(el, 'INPUT') ? el.value : (el.querySelector('input') as HTMLInputElement | null)?.value ?? '').trim() === '';
    case 'date-range':
      return Array.from(el.querySelectorAll('input')).every((i) => i.value.trim() === '');
    case 'radio-button':
      return !el.querySelector('.ant-radio-button-wrapper-checked, .ant-radio-wrapper-checked, input:checked, .is-checked, .is-active, .ivu-radio-wrapper-checked, .arco-radio-checked, [aria-checked="true"]');
    case 'radio': {
      const name = (el as HTMLInputElement).name;
      const group = name ? el.ownerDocument.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(name)}"]`) : [el as HTMLInputElement];
      return !Array.from(group).some((i) => i.checked);
    }
    case 'checkbox':
      return isTag(el, 'INPUT') ? !el.checked : !el.querySelector('input:checked');
    case 'native-select': {
      const s = el as HTMLSelectElement;
      return s.value === '' || s.selectedIndex < 0;
    }
    case 'upload':
      return true;
    default: {
      const input = primaryInput(el, kind) as HTMLInputElement | null;
      return (input?.value ?? '').trim() === '';
    }
  }
}

function visibleOptions(el: Element, kind: ControlKind): { options?: string[]; partial?: boolean } {
  if (kind === 'native-select') {
    const opts = Array.from((el as HTMLSelectElement).options)
      .filter((o) => o.value !== '' || text(o) !== '')
      .map((o) => text(o))
      .filter((t) => t && !/^请选择/.test(t));
    return { options: opts, partial: false };
  }
  if (kind === 'radio-button') {
    const opts = Array.from(el.querySelectorAll('.ant-radio-button-wrapper, .ant-radio-wrapper, .el-radio, .el-radio-button, .ivu-radio-wrapper, .arco-radio, [role="radio"], label'))
      .filter((l) => !l.parentElement?.closest('.el-radio, .el-radio-button, .ivu-radio-wrapper, .arco-radio, label'))
      .map((l) => text(l))
      .filter(Boolean);
    return { options: [...new Set(opts)], partial: false };
  }
  if (kind === 'radio') {
    const name = (el as HTMLInputElement).name;
    const group = name ? Array.from(el.ownerDocument.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(name)}"]`)) : [el as HTMLInputElement];
    return { options: group.map((i) => radioLabel(i)).filter(Boolean), partial: false };
  }
  return {};
}

export function radioLabel(i: HTMLInputElement): string {
  const wrap = i.closest('label');
  if (wrap) return text(wrap);
  if (i.id) {
    const l = i.ownerDocument.querySelector(`label[for="${CSS.escape(i.id)}"]`);
    if (l) return text(l);
  }
  return text(i.nextElementSibling) || i.value;
}

function isDisabled(el: Element, input: Element | null): boolean {
  if ((input as HTMLInputElement | null)?.disabled) return true;
  if (el.matches('.ant-select-disabled, .ant-picker-disabled, .ant-input-number-disabled, .ant-input-disabled')) return true;
  if (el.querySelector('.ant-radio-button-wrapper-disabled, .ant-radio-wrapper-disabled') && !el.querySelector('.ant-radio-button-wrapper:not(.ant-radio-button-wrapper-disabled), .ant-radio-wrapper:not(.ant-radio-wrapper-disabled)')) return true;
  if ((el as HTMLInputElement).disabled) return true;
  if (el.closest('fieldset[disabled]')) return true;
  if (el.matches('.is-disabled, .ivu-select-disabled, .ivu-date-picker-disabled, .arco-select-disabled, .arco-picker-disabled, .n-select--disabled, [aria-disabled="true"]')) return true;
  return false;
}

/** 本页与可读取的同源内嵌框架文档（最多两层）。 */
export function readableDocuments(): Document[] {
  const out: Document[] = [document];
  for (let i = 0; i < out.length && i < 20; i++) {
    for (const f of Array.from(out[i].querySelectorAll('iframe, frame'))) {
      try {
        const d = (f as HTMLIFrameElement).contentDocument;
        if (d && !out.includes(d) && isVisible(f)) out.push(d);
      } catch {
        /* 跨域 */
      }
    }
  }
  return out;
}

/** 内嵌框架统计：同源可读 / 跨域不可读（只统计可见的大框架）。 */
export function frameStats(): { sameOrigin: number; crossOrigin: number } {
  let same = 0;
  let cross = 0;
  for (const f of Array.from(document.querySelectorAll('iframe, frame'))) {
    if (!isVisible(f)) continue;
    const r = f.getBoundingClientRect();
    // 只统计可能装着表单的大框架；统计脚本、右下角客服小窗（如“山小招”）不算
    if (r.width < 300 || r.height < 200 || r.width * r.height < window.innerWidth * window.innerHeight * 0.08) continue;
    let readable = false;
    try {
      readable = !!(f as HTMLIFrameElement).contentDocument;
    } catch {
      readable = false;
    }
    if (readable) same++;
    else cross++;
  }
  return { sameOrigin: same, crossOrigin: cross };
}

type Container = FormContainer;

/** 描述一个容器里的全部控件（不登记、不读值）。 */
function describeContainer(site: SiteDom, sections: SectionHandle[], c: Container, nextKey: () => number): Array<{ d: FieldDescriptor; el: Element; kind: ControlKind }> {
  const out: Array<{ d: FieldDescriptor; el: Element; kind: ControlKind }> = [];
  const roots = controlRoots(c.el, site.skip);
  // 同一标签下有多个控件时（“在职时间”的开始/结束），用占位提示区分
  const labelCount = new Map<string, number>();
  const prelim = roots.map(({ el, kind }) => {
    const input = primaryInput(el, kind);
    const label = labelOf(el, input);
    labelCount.set(label, (labelCount.get(label) ?? 0) + 1);
    return { el, kind, input, label };
  });
  prelim.forEach(({ el, kind, input, label }, itemIndex) => {
    if (!isVisible(el)) return;
    const section = c.section ?? site.sectionOf(el, sections);
    const placeholder = placeholderOf(el, kind, input);
    let finalLabel = label;
    if ((labelCount.get(label) ?? 0) > 1 && placeholder && placeholder !== label) finalLabel = `${label}-${placeholder}`;
    const rawId = (input as HTMLElement | null)?.id || (el as HTMLElement).id || site.fieldId?.(el) || undefined;
    const key = `${section?.key ?? 'page'}:${c.formIndex}:${itemIndex}:${nextKey()}`;
    const { options, partial } = visibleOptions(el, kind);
    const d: FieldDescriptor = {
      key,
      label: finalLabel,
      id: stripId(rawId),
      rawId,
      name: (input as HTMLInputElement | null)?.name || undefined,
      placeholder,
      section: section?.title,
      sectionKey: section?.key,
      formIndex: c.formIndex,
      itemIndex,
      kind,
      required: !!el.closest('.ant-form-item')?.querySelector('.ant-form-item-required') || (input as HTMLInputElement | null)?.required === true || el.getAttribute('aria-required') === 'true',
      disabled: isDisabled(el, input),
      readonly: !!(input as HTMLInputElement | null)?.readOnly,
      isEmpty: isEmptyControl(el, kind),
      options,
      optionsPartial: partial,
      visible: true,
    };
    out.push({ d, el, kind });
  });
  return out;
}

/** 扫描。sectionFilter 只扫描指定区块。 */
export function scan(site: SiteDom, opts: { sectionKey?: string } = {}): FieldDescriptor[] {
  registry.clear();
  const fields: FieldDescriptor[] = [];
  const sections = site.findSections();
  // 国聘：各区块展开的表单；通用：打开的弹窗，或本页 + 同源内嵌框架（跨域框架浏览器不允许读取，只计数）
  const containers = site.containers(sections, opts.sectionKey);

  let n = 0;
  for (const c of containers) {
    for (const { d, el, kind } of describeContainer(site, sections, c, () => n++)) {
      fields.push(d);
      registry.set(d.key, { el, kind, sectionKey: d.sectionKey, formIndex: c.formIndex, id: d.id, label: d.label });
    }
  }
  return fields;
}

/**
 * 找回被网站重画掉的控件：智联选“至今”后整份表单重新渲染，原来登记的元素都脱离了页面。
 * 按同一区块、同一份表单里的字段名（没有时用标签）找到新的元素，并更新登记表。找不到返回 undefined。
 */
export function relocate(site: SiteDom, key: string): Element | undefined {
  const r = registry.get(key);
  if (!r) return undefined;
  if (r.el.isConnected) return r.el;
  const sections = site.findSections();
  let n = 0;
  for (const c of site.containers(sections, r.sectionKey)) {
    if (c.formIndex !== r.formIndex) continue;
    for (const { d, el, kind } of describeContainer(site, sections, c, () => n++)) {
      if (d.sectionKey !== r.sectionKey) continue;
      if (r.id ? d.id === r.id : d.label === r.label && kind === r.kind) {
        registry.set(key, { ...r, el, kind });
        return el;
      }
    }
  }
  return undefined;
}

/**
 * 读出一个表单里各控件当前显示的文字（用户点“保存”时调用，用于存回档案）。
 * 不改动扫描登记表；有登记的控件沿用登记的 key，侧边栏可直接对应到计划。
 */
export function describeFormWithValues(site: SiteDom, section: SectionHandle, form: Element, formIndex: number, read: (el: Element, kind: ControlKind) => string): Array<FieldDescriptor & { text: string }> {
  const sections = site.findSections();
  let n = 0;
  const regKeys = new Map<Element, string>();
  for (const [k, r] of registry) regKeys.set(r.el, k);
  return describeContainer(site, sections, { section, formIndex, el: form }, () => n++).map(({ d, el, kind }) => ({
    ...d,
    key: regKeys.get(el) ?? `read:${d.key}`,
    text: read(el, kind).trim(),
  }));
}
