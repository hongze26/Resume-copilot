// 自研组件的识别：哪些输入框其实是下拉、哪几个下拉合起来是“年 + 月”，以及按结构找字段名。
// 有平台提示（content/platform）时听提示的；没有时按类名词、ARIA 和占位文字判断。
import type { ControlKind } from '../core/plan/types';
import { isVisible, text } from './dom';
import { genericMeta, shownText } from './generic-kit';
import { closestSafe, hintsFor, q, type PlatformHints } from './platform';

export interface GenericHost {
  el: Element;
  kind: ControlKind;
}

export interface GenericScan {
  /** 这个输入框属于哪个逻辑控件；不属于任何一个返回 undefined */
  host(input: Element): GenericHost | undefined;
  /** 已并入别的逻辑控件、不单独上报的输入框（年月组合里的“至今”） */
  skip(input: Element): boolean;
}

const SELECT_WORD = /^(select|selector|dropdown|combobox|combo)$/i;
/** Tailwind 等工具类：select-none 不是组件 */
const UTILITY = /^select-(none|text|all|auto)$/;
const CONTROL_SEL = 'input:not([type=hidden]), textarea, select';

function classWords(el: Element): string[] {
  return String(el.getAttribute('class') ?? '')
    .split(/\s+/)
    .filter((c) => c && !UTILITY.test(c))
    .flatMap((c) => c.split(/[-_]+/));
}

function textLike(input: Element): input is HTMLInputElement {
  if (input.tagName !== 'INPUT') return false;
  const t = ((input as HTMLInputElement).type || 'text').toLowerCase();
  return t === 'text' || t === 'search' || t === '';
}

/** 输入框外面那层自研下拉：往上最多 4 层、只装着这一个输入框、类名里有 select / dropdown 这类词；或输入框带 ARIA 下拉标记。 */
function selectRootOf(input: HTMLInputElement, item: Element | null): Element | null {
  let n: Element | null = input.parentElement;
  for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
    if (n === item || n.tagName === 'BODY' || n.tagName === 'FORM') break;
    if (n.querySelectorAll(CONTROL_SEL).length > 1) break;
    if (classWords(n).some((w) => SELECT_WORD.test(w))) return n;
  }
  const pop = input.getAttribute('aria-haspopup');
  if (input.getAttribute('role') === 'combobox' || pop === 'listbox' || pop === 'true' || pop === 'menu') {
    const p = input.parentElement;
    return p && p !== item && p.querySelectorAll(CONTROL_SEL).length === 1 ? p : input;
  }
  return null;
}

const YEAR_HINT = /^(年|年份|yyyy|year|\d{4}年?)$/i;
const MONTH_HINT = /^(月|月份|mm|month|\d{1,2}月?)$/i;

function ymHint(root: Element): 'y' | 'm' | undefined {
  const input = root.tagName === 'INPUT' ? (root as HTMLInputElement) : root.querySelector<HTMLInputElement>('input');
  const t = ((input?.placeholder ?? '').trim() || shownText(root)).replace(/\s+/g, '');
  return YEAR_HINT.test(t) ? 'y' : MONTH_HINT.test(t) ? 'm' : undefined;
}

function commonAncestor(els: Element[]): Element {
  let a: Element = els[0];
  while (a.parentElement && !els.every((e) => a.contains(e))) a = a.parentElement;
  return a;
}

/** 文字是“至今”的勾选框。 */
function presentCheckbox(scope: Element): HTMLInputElement | undefined {
  for (const cb of Array.from(scope.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))) {
    const t = (text(cb.closest('label')) || text(cb.nextElementSibling)).replace(/\s+/g, '');
    if (/^(至今|目前在职|至今在读)$/.test(t)) return cb;
  }
  return undefined;
}

/** 找出容器里的自研下拉和年月组合，登记到 genericMeta。known：已有专门驱动的组件库选择器，里面的输入框不管。 */
export function collectGeneric(container: Element, known: string): GenericScan {
  const doc = container.ownerDocument;
  const hints = hintsFor(doc);
  const sel = { popup: hints?.popup, option: hints?.option };
  const roots = new Map<Element, { input: HTMLInputElement; item: Element | null }>();
  for (const input of Array.from(container.querySelectorAll('input'))) {
    if (!textLike(input) || input.closest(known)) continue;
    const item = closestSafe(input, hints?.item);
    const root = selectRootOf(input, item);
    if (root && !roots.has(root)) roots.set(root, { input, item });
  }

  const owner = new Map<Element, GenericHost>();
  const dropped = new Set<Element>();
  const used = new Set<Element>();
  const composite = (group: Element[], scope: Element) => {
    // 年在前、月在后；占位文字说反了就按占位文字来
    const ordered: Element[] = [];
    for (let i = 0; i + 1 < group.length; i += 2) {
      const [a, b] = [group[i], group[i + 1]];
      ordered.push(...(ymHint(a) === 'm' && ymHint(b) === 'y' ? [b, a] : [a, b]));
    }
    const cb = presentCheckbox(scope);
    // 有的网站勾了“至今”就把结束的年、月拿掉，只剩开始的两个下拉：仍然是起止时间
    const collapsed = group.length === 2 && cb?.checked === true;
    const range = group.length === 4 || collapsed;
    const present = range ? cb : undefined;
    const el = commonAncestor(collapsed ? [...group, cb!] : group);
    genericMeta.set(el, { type: 'ym', selects: ordered, present, ...sel });
    const host: GenericHost = { el, kind: range ? 'date-range' : 'date' };
    for (const r of group) {
      used.add(r);
      owner.set(roots.get(r)!.input, host);
    }
    if (present) dropped.add(present);
  };

  // 年 + 月组合：平台提示说这一项是年月；或同一个小容器里的 2 / 4 个下拉占位文字都是“年”“月”
  const list = [...roots.keys()];
  if (hints?.classify) {
    const byItem = new Map<Element, Element[]>();
    for (const r of list) {
      const item = roots.get(r)!.item;
      if (item && hints.classify(item)?.kind === 'ym') byItem.set(item, [...(byItem.get(item) ?? []), r]);
    }
    for (const [item, group] of byItem) if (group.length === 2 || group.length === 4) composite(group, item);
  }
  for (const r of list) {
    if (used.has(r) || !ymHint(r)) continue;
    let best: { group: Element[]; scope: Element } | undefined;
    let a: Element | null = r.parentElement;
    for (let i = 0; i < 5 && a && a.tagName !== 'BODY' && a.tagName !== 'FORM'; i++, a = a.parentElement) {
      const inside = list.filter((x) => a!.contains(x));
      if (inside.some((x) => used.has(x) || !ymHint(x)) || a.querySelectorAll(CONTROL_SEL).length > 5) break;
      if (inside.length === 2 || inside.length === 4) best = { group: inside, scope: a };
    }
    if (best) composite(best.group, best.scope);
  }

  for (const [root, { input, item }] of roots) {
    if (used.has(root)) continue;
    const cls = item ? hints?.classify?.(item) : undefined;
    if (cls?.manual) continue; // 需本人完成的项：按普通输入框上报，由 manualNote 说明
    const remote = cls?.kind ? cls.kind === 'remote-select' : !input.readOnly && /^(请输入|输入|搜索|请搜索)/.test(input.placeholder.trim());
    genericMeta.set(root, { type: 'select', remote, ...sel });
    owner.set(input, { el: root, kind: remote ? 'remote-select' : 'select' });
  }
  return { host: (i) => owner.get(i), skip: (i) => dropped.has(i) };
}

// ---------------- 字段名 ----------------

const NOT_TITLE = /^(请选择|请输入|请填写|年|月|日|至|到|至今|[-~—–/])/;
/** 已选值、占位、图标、校验提示这类元素里的字不是字段名。 */
const NOT_TITLE_CLASS = /placeholder|display|value|selection|tag|icon|addon|suffix|prefix|error|help|tip|count|arrow/i;

function cleanTitle(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim().replace(/^[*＊]\s*/, '').replace(/\s*[:：*＊]$/, '');
  return t.length >= 2 && t.length <= 30 && !NOT_TITLE.test(t) ? t : '';
}

/** 平台提示里表单项的标题。 */
export function hintedTitle(el: Element, hints: PlatformHints | undefined = hintsFor(el.ownerDocument)): string {
  const item = closestSafe(el, hints?.item);
  if (!item) return '';
  const t = q(item, hints?.title).find((e) => !e.contains(el));
  return t ? text(t).replace(/\s*[:：*＊]$/, '') : '';
}

/**
 * 没有任何明确关联时按结构找字段名：从控件往上，取“排在它前面、离它最近”的一段短文字。
 * 前面先遇到别的控件就停（那段文字是别人的）；容器里控件超过 5 个也停（已经出了这一项）。
 */
export function leadingTitle(el: Element): string {
  let node: Element = el;
  for (let depth = 0; depth < 6; depth++) {
    const parent: Element | null = node.parentElement;
    if (!parent || parent.tagName === 'BODY' || parent.tagName === 'FORM') return '';
    if (parent.querySelectorAll(CONTROL_SEL).length > 5) return '';
    for (let sib: Node | null = node.previousSibling; sib; sib = sib.previousSibling) {
      if (sib.nodeType === 3) {
        const t = cleanTitle(sib.textContent ?? '');
        if (t) return t;
      } else if (sib.nodeType === 1) {
        const e = sib as Element;
        if (e.matches(CONTROL_SEL) || e.querySelector(CONTROL_SEL)) break;
        if (NOT_TITLE_CLASS.test(String(e.getAttribute('class') ?? '')) || !isVisible(e)) continue;
        const t = cleanTitle(text(e));
        if (t) return t;
      }
    }
    node = parent;
  }
  return '';
}

/** 平台提示说这一项需要本人完成（日历、地区面板、上传、声明）时的说明。 */
export function manualNoteOf(el: Element): string | undefined {
  const hints = hintsFor(el.ownerDocument);
  const item = closestSafe(el, hints?.item);
  return item ? hints?.classify?.(item)?.manual : undefined;
}

/**
 * 一个表单项里有几个互不相关的控件（手机号前的区号、证件号码前的证件类型）：
 * 主控件（最后一个文本框，没有就第一个）用项标题，其余已经有值的不上报。返回要去掉的控件。
 */
export function redundantInItem<T extends { el: Element; kind: ControlKind }>(entries: T[], isEmpty: (e: T) => boolean): Set<T> {
  const out = new Set<T>();
  const hints = entries.length ? hintsFor(entries[0].el.ownerDocument) : undefined;
  if (!hints?.item) return out;
  const byItem = new Map<Element, T[]>();
  for (const e of entries) {
    const item = closestSafe(e.el, hints.item);
    if (item) byItem.set(item, [...(byItem.get(item) ?? []), e]);
  }
  for (const group of byItem.values()) {
    if (group.length < 2) continue;
    const primary = [...group].reverse().find((e) => e.kind === 'text' || e.kind === 'textarea' || e.kind === 'number') ?? group[0];
    for (const e of group) if (e !== primary && !isEmpty(e)) out.add(e);
  }
  return out;
}
