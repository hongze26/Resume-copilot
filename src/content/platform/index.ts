// 当前页面生效的平台提示：内置平台优先，其次定制适配器带来的提示。
import type { SerialHints } from '../../core/platform-hints';
import { mokaHints } from './moka';
import type { PlatformHints } from './types';

export type { ItemClass, PlatformHints } from './types';

const BUILTIN: PlatformHints[] = [mokaHints];

let custom: PlatformHints | undefined;
/** 定制提示每换一次加一，让按文档缓存的结果失效。 */
let epoch = 0;
const cache = new WeakMap<Document, { at: number; epoch: number; value: PlatformHints | undefined }>();

/** 定制适配器带来的提示（随扫描请求传入）；undefined 表示没有。 */
export function setCustomHints(h: SerialHints | undefined): void {
  custom = h ? { id: 'custom', name: '定制提示', ...h } : undefined;
  epoch++;
}

export function hintsFor(doc: Document): PlatformHints | undefined {
  const c = cache.get(doc);
  if (c && c.epoch === epoch && Date.now() - c.at < 500) return c.value;
  let url = '';
  try {
    url = doc.defaultView?.location.href ?? '';
  } catch {
    /* 读不到网址 */
  }
  const builtin = BUILTIN.find((h) => {
    try {
      return !!h.detect?.(doc, url);
    } catch {
      return false;
    }
  });
  const value = builtin ?? custom;
  cache.set(doc, { at: Date.now(), epoch, value });
  return value;
}

/** 按提示里的选择器查找；选择器写错时当作没有。 */
export function q(root: ParentNode, sel: string | undefined): Element[] {
  if (!sel) return [];
  try {
    return Array.from(root.querySelectorAll(sel));
  } catch {
    return [];
  }
}

export function closestSafe(el: Element, sel: string | undefined): Element | null {
  if (!sel) return null;
  try {
    return el.closest(sel);
  } catch {
    return null;
  }
}

export function matchesSafe(el: Element, sel: string | undefined): boolean {
  if (!sel) return false;
  try {
    return el.matches(sel);
  } catch {
    return false;
  }
}

export interface PlatformInfo {
  id: string;
  name: string;
  notes: string[];
  /** 多条记录排在同一页（每条一个记录容器）：第 N 份表单对应档案第 N 条 */
  inlineGroups: boolean;
}

/** 给侧边栏的平台信息。 */
export function platformInfo(doc: Document = document): PlatformInfo | undefined {
  const h = hintsFor(doc);
  if (!h) return undefined;
  return { id: h.id, name: h.name, notes: h.notes ?? [], inlineGroups: q(doc, h.group).length > 0 };
}
