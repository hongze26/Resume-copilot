// 自研组件（没有专门驱动的组件库）的逻辑控件登记表：扫描时写入，通用驱动读取。
// 只依赖 dom.ts，避免 scan.ts 与 drivers/ 互相引用。
import { isVisible } from './dom';

export type GenericMeta =
  | { type: 'select'; remote: boolean; popup?: string; option?: string }
  /** 年 + 月组合：selects 依次是 年、月（起止时再加 年、月）；present 是“至今”勾选框 */
  | { type: 'ym'; selects: Element[]; present?: HTMLInputElement; popup?: string; option?: string };

export const genericMeta = new WeakMap<Element, GenericMeta>();

function floating(el: Element): boolean {
  const pos = (el.ownerDocument.defaultView ?? window).getComputedStyle(el).position;
  return pos === 'fixed' || pos === 'absolute';
}

const cls = (e: Element) => String(e.getAttribute('class') ?? '');
/** 类名里有这些词（按 - _ 和空格分开后整词匹配）的元素不是已选值。 */
const NOT_VALUE = /(^|[\s_-])(placeholder|message|msg|error|warning|help|tips?|addon|suffix|prefix|icon|arrow|clear|shadow)([\s_-]|$)/i;

/**
 * 自研下拉当前显示的文字：组件上显示的已选值，没有时取输入框里的字。
 * 不算：占位提示、展开在组件里面的弹层、看不见的元素。
 */
export function shownText(root: Element, popupSel?: string): string {
  let out = '';
  const isPopup = (e: Element) => {
    if (popupSel) {
      try {
        if (e.matches(popupSel)) return true;
      } catch {
        /* 选择器无效 */
      }
    }
    return /dropdown|popup|popover|menu/i.test(cls(e)) && floating(e);
  };
  const walk = (n: Element) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === 3) out += c.textContent ?? '';
      else if (c.nodeType === 1) {
        const e = c as Element;
        if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.tagName === 'SCRIPT' || e.tagName === 'STYLE') continue;
        // 占位提示、校验信息（Moka 必填下拉点开又关上后，会在控件里面显示“必填项未填写”）、图标都不是已选值
        if (NOT_VALUE.test(cls(e))) continue;
        if (!isVisible(e) || isPopup(e)) continue;
        walk(e);
      }
    }
  };
  walk(root);
  const shown = out.replace(/\s+/g, ' ').trim();
  if (shown) return shown;
  const input = root.tagName === 'INPUT' ? (root as HTMLInputElement) : root.querySelector<HTMLInputElement>('input:not([type=hidden])');
  return (input?.value ?? '').trim();
}

const pad = (s: string) => s.padStart(2, '0');

/** 年 + 月组合当前的值：'2024-09'、'2024-09 ~ 2026-06'、'2024-09 ~ 至今'；全空返回 ''。 */
export function ymText(meta: Extract<GenericMeta, { type: 'ym' }>): string {
  const vals = meta.selects.map((s) => shownText(s, meta.popup));
  const part = (i: number) => {
    const y = vals[i]?.match(/\d{4}/)?.[0];
    const m = vals[i + 1]?.match(/\d{1,2}/)?.[0];
    return y && m ? `${y}-${pad(m)}` : (y ?? '');
  };
  // 只剩开始的年、月而“至今”勾着：结束的两个下拉被网站拿掉了
  if (meta.selects.length < 4) return meta.present?.checked ? `${part(0)} ~ 至今` : part(0);
  const start = part(0);
  const end = meta.present?.checked ? '至今' : part(2);
  return start || end ? `${start} ~ ${end}` : '';
}

/** 逻辑控件当前显示的值（判断是否为空、核验、撤销比对）。 */
export function snapshotGeneric(el: Element): string {
  const meta = genericMeta.get(el);
  if (!meta) return '';
  return meta.type === 'ym' ? ymText(meta) : shownText(el, meta.popup);
}
