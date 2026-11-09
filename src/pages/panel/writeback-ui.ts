// 存回档案：用户点页面“保存”且表单收起后，询问是否把页面内容补进档案。
import type { FieldValueMsg } from '../../core/messages';
import { applyWriteback, proposeWriteback, type PageFieldValue, type WritebackItem } from '../../core/profile/writeback';
import { saveSettings, updateProfile } from '../shared/storage';
import { h, toast } from '../shared/ui';
import { state } from './state';
import { sectionCollection } from './records';
import { render } from './render';

// ---------------- 存回档案 ----------------

interface PendingSave {
  sectionKey: string;
  title: string;
  items: WritebackItem[];
  timer: ReturnType<typeof setTimeout>;
}
let pendingSave: PendingSave | undefined;
/** 侧边栏自己写档案时，不把它当成“档案在别处被修改”而清空扫描结果 */
let selfProfileWrite = false;

export function toPageValues(values: FieldValueMsg[]): PageFieldValue[] {
  return values.map((v, i) => ({
    key: v.key,
    label: v.label,
    id: v.id,
    kind: v.kind as PageFieldValue['kind'],
    formIndex: v.formIndex,
    itemIndex: i,
    section: v.section,
    sectionKey: v.sectionKey,
    placeholder: v.placeholder,
    options: v.options,
    required: false,
    disabled: !!v.disabled,
    readonly: false,
    isEmpty: !v.text,
    visible: true,
    text: v.text,
  }));
}

export function onFormSaving(sectionKey: string, formIndex: number, values: FieldValueMsg[]): void {
  if (!state.profile || !state.adapter || state.settings?.writebackPrompt === false) return;
  const rule = state.adapter.sections.find((x) => x.key === sectionKey);
  if (!rule || rule.mode === 'manual') return;
  const fp = state.plans.get(`${sectionKey}:${formIndex}`);
  let items: WritebackItem[] = [];
  try {
    items = proposeWriteback(state.profile, toPageValues(values), { adapter: state.adapter, collection: sectionCollection(sectionKey) ?? 'single', record: fp?.record });
  } catch {
    return;
  }
  if (pendingSave) clearTimeout(pendingSave.timer);
  pendingSave = undefined;
  if (items.length === 0) return;
  const title = state.sections.find((x) => x.key === sectionKey)?.title ?? rule.titles[0];
  // 网站校验没通过（表单没收起）就不问；8 秒后作废
  const timer = setTimeout(() => {
    if (pendingSave?.timer === timer) pendingSave = undefined;
  }, 8000);
  pendingSave = { sectionKey, title, items, timer };
}

export async function rememberNever(never: HTMLInputElement): Promise<void> {
  if (never.checked && state.settings) {
    state.settings = { ...state.settings, writebackPrompt: false };
    await saveSettings(state.settings);
  }
}

export async function showWriteback(ps: PendingSave): Promise<void> {
  const dlg = h('dialog', { class: 'dialog writeback', 'data-testid': 'writeback' }) as HTMLDialogElement;
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  const KIND_ZH: Record<WritebackItem['kind'], string> = { set: '补上', replace: '与档案不同', template: '新增文字模板', custom: '新建自定义项', 'new-record': '新建记录' };
  const list = h('div', { class: 'wb-list' });
  for (const it of ps.items) {
    const cb = h('input', { type: 'checkbox', checked: it.checked && !it.error, disabled: !!it.error, 'aria-label': it.label }) as HTMLInputElement;
    cb.addEventListener('change', () => (it.checked = cb.checked));
    list.append(
      h(
        'label',
        { class: `wb-item${it.error ? ' wb-error' : ''}` },
        cb,
        h(
          'div',
          {},
          h('div', {}, h('b', {}, it.label), ' ', h('span', { class: 'badge badge-skip' }, KIND_ZH[it.kind])),
          it.kind === 'new-record'
            ? h('ul', { class: 'small' }, ...(it.details ?? []).map((d) => h('li', {}, d)))
            : h('div', { class: 'small' }, it.before ? `档案：${it.before} → 页面：${it.after}` : `页面：${it.after}`),
          it.error ? h('div', { class: 'small wb-err' }, it.error) : null,
        ),
      ),
    );
  }
  const never = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const save = h('button', { class: 'btn btn-primary' }, '存入档案');
  save.addEventListener('click', async () => {
    const chosen = ps.items.filter((i) => i.checked && !i.error);
    try {
      await rememberNever(never);
      if (chosen.length) {
        selfProfileWrite = true;
        state.profile = await updateProfile((p) => applyWriteback(p, chosen));
        toast(`已存入档案 ${chosen.length} 项`, 'ok');
      }
    } catch (e) {
      selfProfileWrite = false;
      toast(e instanceof Error ? e.message : String(e), 'error', 6000);
    }
    close();
    render();
  });
  const skip = h('button', { class: 'btn' }, '这次不用');
  skip.addEventListener('click', async () => {
    await rememberNever(never);
    close();
  });
  dlg.append(
    h('h3', {}, `把“${ps.title}”里的内容存回档案？`),
    h('p', { class: 'small muted' }, '你刚在网页上保存了这份表单。下面是档案里缺少或与档案不同的项，只写入你勾选的内容，只存在本机。'),
    list,
    h('label', { class: 'small wb-never' }, never, ' 以后不再自动询问（可在侧边栏底部“设置”里重新打开）'),
    h('div', { class: 'dialog-actions' }, skip, save),
  );
  dlg.addEventListener('cancel', close);
  document.body.append(dlg);
  dlg.showModal();
}

/** 表单收起（网站接受了保存）时，取出这个区块等待中的“存回档案”询问。 */
export function takePendingSave(sectionKey: string): PendingSave | undefined {
  if (!pendingSave || pendingSave.sectionKey !== sectionKey) return undefined;
  const ps = pendingSave;
  pendingSave = undefined;
  clearTimeout(ps.timer);
  return ps;
}

/** 档案变更是否由侧边栏自己写入（读取后复位）。 */
export function consumeSelfProfileWrite(): boolean {
  const v = selfProfileWrite;
  selfProfileWrite = false;
  return v;
}
