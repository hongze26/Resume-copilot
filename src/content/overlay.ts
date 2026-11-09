// 页面高亮：在独立的 Shadow DOM 层中画框，不修改网站自己的 DOM 和样式。

export type MarkState = 'active' | 'ok' | 'fail' | 'skip' | 'low' | 'medium' | 'high' | 'none';

const COLORS: Record<Exclude<MarkState, 'none'>, string> = {
  active: '#2563eb',
  ok: '#16a34a',
  fail: '#dc2626',
  skip: '#9ca3af',
  low: '#ea580c',
  medium: '#ca8a04',
  high: '#16a34a',
};

let host: HTMLElement | null = null;
let layer: HTMLElement | null = null;
const boxes = new Map<Element, { box: HTMLElement; state: MarkState; note?: string }>();
let raf = 0;

function ensureLayer(): HTMLElement {
  if (layer && host?.isConnected) return layer;
  host = document.createElement('div');
  host.setAttribute('data-rc-overlay', '');
  host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none;';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    .b{position:absolute;border:2px solid;border-radius:6px;box-sizing:border-box;transition:border-color .15s}
    .n{position:absolute;top:-20px;left:-2px;font:12px/18px system-ui,"Microsoft YaHei",sans-serif;color:#fff;padding:0 6px;border-radius:4px;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis}
  `;
  root.appendChild(style);
  layer = document.createElement('div');
  root.appendChild(layer);
  document.documentElement.appendChild(host);
  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  return layer;
}

function schedule() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    reposition();
  });
}

function reposition() {
  for (const [el, { box }] of boxes) {
    if (!el.isConnected) {
      box.remove();
      boxes.delete(el);
      continue;
    }
    const r = el.getBoundingClientRect();
    // 同源内嵌框架中的元素：坐标加上框架自身的位置
    let dx = 0;
    let dy = 0;
    let w: Window | null = el.ownerDocument.defaultView;
    while (w && w !== window && w.frameElement) {
      const fr = w.frameElement.getBoundingClientRect();
      dx += fr.left;
      dy += fr.top;
      w = w.parent;
    }
    box.style.left = `${r.left + dx + window.scrollX - 3}px`;
    box.style.top = `${r.top + dy + window.scrollY - 3}px`;
    box.style.width = `${r.width + 6}px`;
    box.style.height = `${r.height + 6}px`;
    box.style.display = r.width === 0 && r.height === 0 ? 'none' : 'block';
  }
}

export function mark(el: Element, state: MarkState, note?: string): void {
  const existing = boxes.get(el);
  if (state === 'none') {
    existing?.box.remove();
    boxes.delete(el);
    return;
  }
  const l = ensureLayer();
  const box = existing?.box ?? document.createElement('div');
  box.className = 'b';
  box.style.borderColor = COLORS[state];
  box.innerHTML = '';
  if (note) {
    const n = document.createElement('div');
    n.className = 'n';
    n.style.background = COLORS[state];
    n.textContent = note;
    box.appendChild(n);
  }
  if (!existing) l.appendChild(box);
  boxes.set(el, { box, state, note });
  schedule();
}

export function clearMarks(): void {
  for (const { box } of boxes.values()) box.remove();
  boxes.clear();
}
