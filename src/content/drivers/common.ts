// 驱动的公共部分：结果类型 + 原生控件（文本框、原生下拉、原生单选、复选框）。
// 各组件库驱动（antd.ts、element.ts）只处理自己的浮层控件，文本输入统一走这里。
import { norm } from '../../core/normalize/text';
import type { FillValue, SkipReason } from '../../core/plan/types';
import { blurEl, focusEl, isEditable, isTag, safeClick, setNativeValue, settle, text } from '../dom';
import { radioLabel } from '../scan';

export interface DriverResult {
  ok: boolean;
  reason?: SkipReason;
  detail?: string;
  /** 选项不唯一或找不到时，页面上的候选文字（给用户挑选） */
  candidates?: string[];
  /** 填上了，但不是一字不差（选了最接近的候选）：页面上标成“需确认” */
  warn?: boolean;
}

export const OK: DriverResult = { ok: true };
export const fail = (reason: SkipReason, detail?: string, candidates?: string[]): DriverResult => ({ ok: false, reason, detail, candidates });

/** 控件根元素里的输入框（原生元素自身，或组件库外层里的第一个输入框）。 */
export function inputOf(el: Element): HTMLInputElement | HTMLTextAreaElement | null {
  if (isTag(el, 'INPUT') || isTag(el, 'TEXTAREA')) return el;
  return el.querySelector('input:not([type=hidden]), textarea');
}

// ---------------- 原生文本 ----------------

/**
 * 写入富文本编辑框：选中全部内容后用 insertText 输入，走浏览器自己的编辑流程，编辑器的数据才会跟着变；
 * 浏览器不支持时直接改文字并补发 input 事件。
 */
async function fillEditable(el: HTMLElement, value: string): Promise<DriverResult> {
  const doc = el.ownerDocument;
  focusEl(el);
  const range = doc.createRange();
  range.selectNodeContents(el);
  const sel = doc.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  let done = false;
  try {
    done = doc.execCommand(value ? 'insertText' : 'delete', false, value);
  } catch {
    done = false;
  }
  if (!done) {
    el.textContent = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  }
  sel?.removeAllRanges();
  blurEl(el);
  await settle();
  return norm(el.innerText) === norm(value) ? OK : fail('verify-failed', '编辑框里的内容和要填的不一样（网站可能改写了格式）');
}

export async function fillText(el: Element, value: string): Promise<DriverResult> {
  if (isEditable(el)) return fillEditable(el, value);
  const input = inputOf(el);
  if (!input) return fail('not-supported', '找不到输入框');
  if (input.disabled) return fail('locked');
  if (input.readOnly) return fail('not-supported', '输入框为只读');
  focusEl(input);
  setNativeValue(input, value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  blurEl(input);
  await settle();
  const after = input.value;
  // maxlength 截断或格式化（如数字框）
  if (norm(after) !== norm(value)) {
    if (input.maxLength > 0 && value.length > input.maxLength) return fail('verify-failed', `内容超过网站限制的 ${input.maxLength} 字`);
    return fail('verify-failed', '失焦后内容被网站改写或回滚');
  }
  return OK;
}

// ---------------- 原生日期框（type=date / month / datetime-local） ----------------

export function isNativeDate(el: Element): el is HTMLInputElement {
  return isTag(el, 'INPUT') && (el.type === 'date' || el.type === 'month' || el.type === 'datetime-local');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 按日期框要求的格式写入：date → 2024-09-01，month → 2024-09，datetime-local → 2024-09-01T00:00。 */
export async function fillNativeDate(el: HTMLInputElement, value: FillValue): Promise<DriverResult> {
  if (value.t !== 'date') return fail('not-supported', '这个日期框只能填一个日期');
  if (value.date === 'present') return fail('no-option', '这个日期框不能填“至今”');
  if (el.disabled) return fail('locked');
  if (el.readOnly) return fail('not-supported', '日期框为只读');
  const d = value.date;
  const ym = d.m ? `${d.y}-${pad2(d.m)}` : undefined;
  const ymd = ym && d.d ? `${ym}-${pad2(d.d)}` : undefined;
  const s = el.type === 'month' ? ym : el.type === 'date' ? ymd : ymd && `${ymd}T00:00`;
  if (!s) return fail('no-profile-value', el.type === 'month' ? '档案里这个日期没写月份' : '档案里这个日期没写到哪一天');
  focusEl(el);
  setNativeValue(el, s);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  blurEl(el);
  await settle();
  return el.value === s ? OK : fail('verify-failed', '日期框没有接受这个日期（可能超出了网站允许的范围）');
}

// ---------------- 原生 select / radio / checkbox ----------------

export async function fillNativeSelect(el: HTMLSelectElement, target: string, accept?: string[]): Promise<DriverResult> {
  const acc = [target, ...(accept ?? [])].map(norm);
  const opts = Array.from(el.options).filter((o) => acc.includes(norm(text(o))) || acc.includes(norm(o.value)));
  if (opts.length === 0) return fail('no-option');
  if (new Set(opts.map((o) => o.value)).size > 1) return fail('no-option', '多个选项都相等', opts.map((o) => text(o)));
  focusEl(el);
  const win = (el.ownerDocument.defaultView ?? window) as typeof window;
  const setter = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value')?.set;
  setter ? setter.call(el, opts[0].value) : (el.value = opts[0].value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  blurEl(el);
  await settle();
  return el.value === opts[0].value ? OK : fail('verify-failed');
}

export async function fillNativeRadio(el: HTMLInputElement, target: string, accept?: string[]): Promise<DriverResult> {
  const acc = [target, ...(accept ?? [])].map(norm);
  const doc = el.ownerDocument;
  const group = el.name ? Array.from(doc.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(el.name)}"]`)) : [el];
  const hits = group.filter((i) => acc.includes(norm(radioLabel(i))));
  if (hits.length !== 1) return fail('no-option', hits.length > 1 ? '多个选项都相等' : undefined, group.map(radioLabel));
  safeClick(hits[0]);
  await settle();
  return hits[0].checked ? OK : fail('verify-failed');
}

export async function fillCheckbox(el: Element, checked: boolean): Promise<DriverResult> {
  const input = (isTag(el, 'INPUT') ? el : el.querySelector('input[type=checkbox]')) as HTMLInputElement | null;
  if (!input) return fail('not-supported', '找不到复选框');
  if (input.checked !== checked) safeClick(input);
  await settle();
  return input.checked === checked ? OK : fail('verify-failed');
}

/** 原生控件当前显示的值（撤销与核验用，只留在 Content Script 内存中）。 */
export function snapshotNative(el: Element, kind: string): string | undefined {
  switch (kind) {
    case 'radio': {
      const name = (el as HTMLInputElement).name;
      const group = name ? Array.from(el.ownerDocument.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(name)}"]`)) : [el as HTMLInputElement];
      const c = group.find((i) => i.checked);
      return c ? radioLabel(c) : '';
    }
    case 'checkbox':
      return String((isTag(el, 'INPUT') ? el : el.querySelector('input'))?.checked ?? false);
    case 'native-select': {
      const s = el as HTMLSelectElement;
      return s.selectedIndex >= 0 && s.value !== '' ? text(s.options[s.selectedIndex]) : '';
    }
    case 'text':
    case 'textarea':
    case 'number':
      if (isEditable(el)) return el.innerText.trim();
      return inputOf(el)?.value ?? '';
    default:
      return undefined;
  }
}
