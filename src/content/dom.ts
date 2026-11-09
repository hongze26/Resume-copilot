// Content Script 的 DOM 工具：等待、可见性、事件派发、受控输入写值、安全点击。

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** 下一帧；后台标签页不触发 rAF 时用 50ms 兜底。 */
export const nextFrame = () =>
  new Promise<void>((r) => {
    let done = false;
    const fin = () => {
      if (!done) {
        done = true;
        r();
      }
    };
    requestAnimationFrame(fin);
    setTimeout(fin, 50);
  });

/** 两帧 + 指定毫秒，用于“失焦后不回滚”的核验。 */
export async function settle(ms = 150): Promise<void> {
  await nextFrame();
  await nextFrame();
  await sleep(ms);
}

export class TimeoutError extends Error {
  constructor(what: string) {
    super(`等待超时：${what}`);
  }
}

/** 基于 MutationObserver + 轮询兜底的等待。 */
export function waitFor<T>(fn: () => T | null | undefined | false, timeout = 5000, what = '页面响应'): Promise<T> {
  return new Promise((resolve, reject) => {
    const first = fn();
    if (first) return resolve(first);
    let done = false;
    const finish = (v?: T, err?: Error) => {
      if (done) return;
      done = true;
      obs.disconnect();
      clearInterval(iv);
      clearTimeout(to);
      if (err) reject(err);
      else resolve(v as T);
    };
    const check = () => {
      try {
        const v = fn();
        if (v) finish(v);
      } catch (e) {
        finish(undefined, e as Error);
      }
    };
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    const iv = setInterval(check, 100);
    const to = setTimeout(() => finish(undefined, new TimeoutError(what)), timeout);
  });
}

/** 等到 fn() 的返回值连续 stableMs 不变。 */
export async function waitStable<T>(fn: () => T, stableMs = 300, timeout = 8000): Promise<T> {
  const start = Date.now();
  let last = JSON.stringify(fn());
  let lastChange = Date.now();
  while (Date.now() - start < timeout) {
    await sleep(60);
    const cur = JSON.stringify(fn());
    if (cur !== last) {
      last = cur;
      lastChange = Date.now();
    } else if (Date.now() - lastChange >= stableMs) {
      return fn();
    }
  }
  throw new TimeoutError('选项稳定');
}

type TagMap = { INPUT: HTMLInputElement; TEXTAREA: HTMLTextAreaElement; SELECT: HTMLSelectElement; LABEL: HTMLLabelElement; BUTTON: HTMLButtonElement };

/**
 * 跨框架安全的类型判断。同源内嵌框架里的元素属于另一个 window，
 * `el instanceof HTMLInputElement`（本页的构造函数）对它们恒为 false。
 */
export function isTag<K extends keyof TagMap>(n: unknown, tag: K): n is TagMap[K] {
  return !!n && (n as Node).nodeType === 1 && (n as Element).tagName === tag;
}

export function isEl(n: unknown): n is HTMLElement {
  return !!n && (n as Node).nodeType === 1;
}

export function isVisible(el: Element | null | undefined): boolean {
  if (!el || !(el as HTMLElement).isConnected) return false;
  if ((el as HTMLElement).closest('.ant-form-item-hidden')) return false;
  const rects = el.getClientRects();
  if (rects.length === 0) return false;
  const st = (el.ownerDocument.defaultView ?? window).getComputedStyle(el as HTMLElement);
  return st.visibility !== 'hidden' && st.display !== 'none';
}

/** 正在播放关闭动画的浮层（antd 的 *-leave 类）视为已关闭。 */
export function isLeaving(el: Element): boolean {
  return /(^|\s)[\w-]+-leave(-active)?(\s|$)/.test(el.className);
}

/** 当前真正打开着的浮层（下拉/日期面板）。 */
export function openOverlays(selector: string, hiddenClass: string): Element[] {
  return Array.from(document.querySelectorAll(selector)).filter((d) => !d.classList.contains(hiddenClass) && !isLeaving(d) && isVisible(d));
}

/** 等上一个浮层收起（含动画），最长 ms。 */
export async function waitOverlaysClosed(selector: string, hiddenClass: string, ms = 800): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const any = Array.from(document.querySelectorAll(selector)).some((d) => !d.classList.contains(hiddenClass) && isVisible(d));
    if (!any) return;
    await sleep(40);
  }
}

export function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
}

export function fireMouse(el: Element, type: string): void {
  const init: MouseEventInit = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: type.endsWith('down') ? 1 : 0, ...center(el) };
  const ev = type.startsWith('pointer') ? new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, init);
  el.dispatchEvent(ev);
}

export function fireKey(el: Element, key: string, type: 'keydown' | 'keyup' = 'keydown'): void {
  const codes: Record<string, number> = { Escape: 27, ArrowDown: 40, ArrowUp: 38, Tab: 9 };
  el.dispatchEvent(new KeyboardEvent(type, { key, code: key, keyCode: codes[key] ?? 0, which: codes[key] ?? 0, bubbles: true, cancelable: true, composed: true }));
}

// ---------------- 安全点击 ----------------

const FORBIDDEN_TEXT = /保\s*存|提\s*交|投\s*递|报\s*名|发\s*送|确\s*认\s*提|立即申请|申\s*请\s*职|submit|save|apply|send/i;

export class ForbiddenActionError extends Error {}

/**
 * 永不自动提交：任何点击前检查目标。
 * 提交按钮、表单 submit、文字像“保存/提交/投递”的按钮一律拒绝。
 * allowAddEdit 只允许“添加/编辑”这类展开表单的按钮。
 */
export function assertSafeTarget(el: Element, opts: { allowAddEdit?: boolean } = {}): void {
  const btn = el.closest('button, a, [role="button"], input[type="submit"], input[type="button"]');
  const target = (btn ?? el) as HTMLElement;
  if (isTag(target, 'BUTTON') && target.type === 'submit') throw new ForbiddenActionError('拒绝点击提交按钮');
  if (isTag(target, 'INPUT') && target.type === 'submit') throw new ForbiddenActionError('拒绝点击提交按钮');
  if (btn) {
    const t = text(btn) || (btn as HTMLInputElement).value || '';
    if (FORBIDDEN_TEXT.test(t)) throw new ForbiddenActionError(`拒绝点击“${t.slice(0, 10)}”按钮`);
    // 表单里的主按钮“添 加”就是保存这条记录（智联校园等）；展开表单的“添加”在区块标题栏，不在表单里
    if (btn.closest('form') && /^(添\s*加|新\s*增|确\s*定)$/.test(t.trim()) && /primary/.test(String(btn.className))) {
      throw new ForbiddenActionError(`拒绝点击表单里的“${t.trim()}”按钮（相当于保存）`);
    }
    if (!opts.allowAddEdit && /^(添\s*加|编\s*辑|新\s*增|删\s*除|取\s*消)$/.test(t.replace(/^[^一-龥A-Za-z]+/, ''))) {
      throw new ForbiddenActionError(`执行填写时不点击“${t}”`);
    }
  }
}

/** 模拟一次完整的用户点击（含 pointer/mouse 事件）。 */
export function safeClick(el: Element, opts: { allowAddEdit?: boolean } = {}): void {
  assertSafeTarget(el, opts);
  for (const t of ['pointerover', 'mouseover', 'pointerdown', 'mousedown']) fireMouse(el, t);
  (el as HTMLElement).focus?.({ preventScroll: true });
  for (const t of ['pointerup', 'mouseup', 'click']) fireMouse(el, t);
}

/** 只派发 mousedown（antd Select 用 mousedown 打开）。 */
export function safeMouseDown(el: Element): void {
  assertSafeTarget(el);
  fireMouse(el, 'pointerdown');
  fireMouse(el, 'mousedown');
}

// ---------------- 受控输入写值 ----------------

/** 用原型 setter 写值，再派发 input/change，React/Vue 都能识别。 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // 用元素所在 window 的原型（同源内嵌框架里的元素属于另一个 window）
  const win = (el.ownerDocument.defaultView ?? window) as typeof window;
  const proto = isTag(el, 'TEXTAREA') ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function focusEl(el: HTMLElement): void {
  // 点侧边栏“填写”时焦点在侧边栏，网页本身没有焦点：此时 el.focus() 不会触发 focus 事件，
  // 靠聚焦打开的控件（智联“技能类型”弹窗）就不会响应，要等本人点回网页才弹出。没有触发时补发一次。
  let fired = false;
  const on = () => (fired = true);
  el.addEventListener('focus', on, { once: true });
  el.focus({ preventScroll: true });
  el.removeEventListener('focus', on);
  if (!fired) el.dispatchEvent(new FocusEvent('focus'));
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

export function blurEl(el: HTMLElement): void {
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  el.blur();
}

export function scrollIntoViewIfNeeded(el: Element): void {
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
}
