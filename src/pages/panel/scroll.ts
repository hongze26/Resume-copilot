// 侧边栏滚动位置：重绘后保持锚点卡片位置；网页滚动时跟随到对应区块。
import { state, working } from './state';

export const app = document.getElementById('app')!;

// ---------------- 滚动位置 ----------------
// 整体重绘会清空再重建页面，浏览器会把滚动位置归零；这里记住“锚点卡片”在视口中的位置并在重绘后恢复。
export interface Anchor { key: string; top: number }
/** 用户刚刚操作的区块：重绘后让它停在原来的位置 */
let pendingFocus: Anchor | undefined;
export function setPendingFocus(a: Anchor | undefined): void {
  pendingFocus = a;
}
let lastPanelInput = 0;
for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown']) window.addEventListener(ev, () => (lastPanelInput = Date.now()), { capture: true, passive: true });

export function anchorEl(key: string): HTMLElement | null {
  return Array.from(app.querySelectorAll<HTMLElement>('[data-anchor]')).find((e) => e.dataset.anchor === key) ?? null;
}

export function anchorOf(key: string): Anchor | undefined {
  const el = anchorEl(key);
  if (!el) return undefined;
  const top = el.getBoundingClientRect().top;
  return { key, top: Math.min(Math.max(top, 56), window.innerHeight - 120) };
}

export function captureAnchor(): Anchor | undefined {
  if (window.scrollY < 4) return undefined;
  for (const el of Array.from(app.querySelectorAll<HTMLElement>('[data-anchor]'))) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 60) return { key: el.dataset.anchor!, top: r.top };
  }
  return undefined;
}

export function restoreAnchor(a: Anchor | undefined, y: number): void {
  const el = a ? anchorEl(a.key) : null;
  if (a && el) window.scrollBy(0, el.getBoundingClientRect().top - a.top);
  else window.scrollTo(0, y);
}

/** 侧边栏滚到某个区块（网页滚动跟随） */
export function followSection(key: string): void {
  if (!state.settings?.followPage || working() || Date.now() - lastPanelInput < 2000) return;
  const el = anchorEl(`sec:${key}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('in-view');
  setTimeout(() => el.classList.remove('in-view'), 1200);
}

/** 重绘：保持用户正在看的卡片停在原位。 */
export function withAnchor(redraw: () => void): void {
  const anchor = pendingFocus ?? captureAnchor();
  const y = window.scrollY;
  redraw();
  restoreAnchor(anchor, y);
}
