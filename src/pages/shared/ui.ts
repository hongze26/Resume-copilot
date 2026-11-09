// 极小的 DOM 构造工具（不引入框架）。

type Attrs = Record<string, string | number | boolean | undefined | null | ((e: Event) => void)>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Array<Child | Child[]>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (typeof v === 'function') {
      el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'html') {
      throw new Error('不允许 html 属性');
    } else if (k === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
      el.value = String(v);
    } else if (k === 'checked' && el instanceof HTMLInputElement) {
      el.checked = Boolean(v);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function toast(msg: string, kind: 'info' | 'ok' | 'warn' | 'error' = 'info', ms = 3500): void {
  let box = document.getElementById('rc-toasts');
  if (!box) {
    box = h('div', { id: 'rc-toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(box);
  }
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function confirmDialog(title: string, body: string, okText = '确定', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog' }) as HTMLDialogElement;
    const done = (v: boolean) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    dlg.append(
      h('h3', {}, title),
      h('p', { class: 'dialog-body' }, body),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { class: 'btn', onclick: () => done(false) }, '取消'),
        h('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', onclick: () => done(true) }, okText),
      ),
    );
    dlg.addEventListener('cancel', () => done(false));
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

/** 在扩展页内生成下载（不经过网络）。 */
export function downloadText(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
