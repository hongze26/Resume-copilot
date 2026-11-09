// 侧边栏：生成 / 复核 / 重命名 / 删除定制适配器。
import {
  buildPrompt,
  COLLECTION_LABEL,
  hostOf,
  newCustomId,
  pageStructure,
  parseMapping,
  pathsForCollection,
  type CustomAdapterDef,
  type CustomCollection,
} from '../../adapters/custom';
import type { FieldDescriptor } from '../../core/plan/types';
import type { CustomField as ProfileCustomField } from '../../core/profile/types';
import { apiUrl, type AiConfig } from '../../core/resume/ai';
import { chatJson, loadAiConfig, saveAiConfig } from '../shared/ai-chat';
import { loadCustomAdapters, loadProfile, saveCustomAdapters, updateProfile } from '../shared/storage';
import { confirmDialog, h, toast } from '../shared/ui';

function modal(cls = ''): { dlg: HTMLDialogElement; close: () => void } {
  const dlg = h('dialog', { class: `dialog custom-dialog ${cls}` }) as HTMLDialogElement;
  const close = () => {
    if (dlg.open) dlg.close();
    dlg.remove();
  };
  dlg.addEventListener('cancel', close);
  document.body.append(dlg);
  return { dlg, close };
}

export interface GenerateContext {
  url: string;
  /** 读取页面结构（通用扫描，不含任何值） */
  scan: () => Promise<FieldDescriptor[]>;
  onSaved: (def: CustomAdapterDef) => void;
}

/** 第 1 步：读取页面结构，显示将要发送的内容并让用户确认 API 设置。 */
export async function startGenerate(ctx: GenerateContext): Promise<void> {
  let fields: FieldDescriptor[];
  try {
    fields = await ctx.scan();
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error');
    return;
  }
  const structure = pageStructure(ctx.url, fields);
  // 档案里的自定义字段（网站独有的字段，如曾用名）：只把标签放进白名单，值不发送
  const custom = (await loadProfile())?.custom ?? [];
  if (structure.fields.length === 0) {
    toast('这个页面上没有找到表单字段。请先在网页上点开要填写的各个区块（添加/编辑），再生成。', 'warn', 7000);
    return;
  }
  const cfg = await loadAiConfig();
  const { dlg, close } = modal('dialog-wide');
  dlg.dataset.testid = 'custom-consent';
  const endpoint = h('input', { type: 'url', value: cfg.endpoint, placeholder: '服务商提供的 API Base URL', 'aria-label': 'API 地址' }) as HTMLInputElement;
  const model = h('input', { value: cfg.model, placeholder: '模型名称，如 deepseek-v4-flash', 'aria-label': '模型名称' }) as HTMLInputElement;
  const key = h('input', { type: 'password', value: cfg.apiKey, autocomplete: 'off', 'aria-label': 'API Key' }) as HTMLInputElement;
  const status = h('p', { class: 'small', role: 'status' });
  const payload = JSON.stringify(structure, null, 1);
  const send = h('button', { class: 'btn btn-primary' }, '确认发送并生成') as HTMLButtonElement;
  const cancel = h('button', { class: 'btn' }, '取消') as HTMLButtonElement;
  let controller: AbortController | undefined;
  cancel.addEventListener('click', () => {
    controller?.abort();
    close();
  });
  dlg.append(
    h('h3', {}, '生成定制适配器'),
    h(
      'p',
      { class: 'small' },
      `读取到 ${structure.sections.length} 个区块、${structure.fields.length} 个字段。将把下面的“页面结构”发送给你配置的大模型，由它判断每个字段对应档案里的哪一项。只发送字段名称、控件类型和选项${custom.length ? `，以及你在档案里建的 ${custom.length} 个自定义字段的名称` : ''}，不发送你的档案内容或页面上已填写的内容。服务商可能收取少量 API 费用。`,
    ),
    h('details', {}, h('summary', { class: 'small' }, '查看将要发送的内容'), h('pre', { class: 'source-pre', style: 'max-height:30vh;overflow:auto;font-size:11px' }, payload)),
    h('label', { class: 'ai-field small' }, 'API 地址', endpoint),
    h('label', { class: 'ai-field small' }, '模型名称', model),
    h('label', { class: 'ai-field small' }, 'API Key（只保存到浏览器关闭）', key),
    status,
    h('div', { class: 'dialog-actions' }, cancel, send),
  );
  dlg.showModal();
  send.addEventListener('click', async () => {
    let url: URL;
    try {
      url = apiUrl(endpoint.value);
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : 'API 地址无效';
      return;
    }
    if (!model.value.trim()) {
      status.textContent = '请填写模型名称';
      return;
    }
    // 权限请求必须在点击手势中发起
    const permission = chrome.permissions.request({ origins: [`${url.origin}/*`] });
    const config: AiConfig = { endpoint: url.href, model: model.value.trim(), apiKey: key.value.trim() };
    send.disabled = true;
    status.textContent = '正在生成，通常需要 10–60 秒…';
    controller = new AbortController();
    const timer = window.setTimeout(() => controller?.abort(), 180_000);
    try {
      if (!(await permission)) throw new Error('未授权访问 API 服务');
      await saveAiConfig(config);
      const content = await chatJson(config, buildPrompt(custom), JSON.stringify(structure), controller.signal);
      const mapping = parseMapping(content, structure, fields, custom);
      const now = new Date().toISOString();
      const host = hostOf(ctx.url);
      const def: CustomAdapterDef = { id: newCustomId(), name: host, hosts: [host], createdAt: now, updatedAt: now, model: config.model, sections: mapping.sections, fields: mapping.fields };
      close();
      void openReview(def, mapping.dropped, ctx.onSaved, true);
    } catch (e) {
      status.textContent = controller?.signal.aborted ? '已取消或超时，没有保存任何内容。' : e instanceof Error ? e.message : '生成失败';
      send.disabled = false;
    } finally {
      clearTimeout(timer);
    }
  });
}

const NEW_CUSTOM = '__new-custom';

/**
 * 第 2 步（也用于“编辑”）：逐项复核区块栏目和字段对应关系，命名后保存。
 * 档案里没有对应项的网站字段（曾用名、档案所在地…）可以选已有的自定义字段，或当场新建一个（保存适配器时写入档案）。
 */
export async function openReview(def: CustomAdapterDef, dropped: string[], onSaved: (def: CustomAdapterDef) => void, isNew = false): Promise<void> {
  const draft: CustomAdapterDef = JSON.parse(JSON.stringify(def));
  const profile = await loadProfile();
  const custom: ProfileCustomField[] = profile?.custom ?? [];
  /** 本次新建的自定义字段：draft.fields 下标 → 值 */
  const pending = new Map<number, string>();
  const { dlg, close } = modal('dialog-wide');
  dlg.dataset.testid = 'custom-review';
  const name = h('input', { value: draft.name, 'aria-label': '适配器名称', maxlength: 30 }) as HTMLInputElement;
  const body = h('div', { class: 'cr-body' });

  const renderBody = () => {
    body.replaceChildren();
    for (const sec of draft.sections) {
      const colSel = h('select', { 'aria-label': `${sec.title} 的栏目` }) as HTMLSelectElement;
      for (const [k, label] of Object.entries(COLLECTION_LABEL)) colSel.append(h('option', { value: k, selected: k === sec.collection }, label));
      colSel.addEventListener('change', () => {
        sec.collection = colSel.value as CustomCollection;
        // 栏目改变后，不属于新栏目的路径清空；自定义字段只用于单项信息
        const ok = new Set(pathsForCollection(sec.collection, custom).map((p) => p.path));
        draft.fields.forEach((f, i) => {
          if (f.section !== sec.key) return;
          if (f.path && !ok.has(f.path)) f.path = undefined;
          if (sec.collection !== 'single') pending.delete(i);
        });
        renderBody();
      });
      const box = h('fieldset', { class: 'cr-section' }, h('legend', {}, sec.title), h('label', { class: 'small' }, '对应档案栏目：', colSel));
      if (sec.collection !== 'manual') {
        const options = pathsForCollection(sec.collection, custom);
        draft.fields.forEach((f, i) => {
          if (f.section !== sec.key) return;
          const sel = h('select', { 'aria-label': `${sec.title}·${f.label}` }) as HTMLSelectElement;
          sel.append(h('option', { value: '', selected: !f.path && !f.manual && !pending.has(i) }, '自动识别'));
          sel.append(h('option', { value: '__manual', selected: !!f.manual }, '需本人完成（不填）'));
          for (const o of options) sel.append(h('option', { value: o.path, selected: f.path === o.path }, o.desc));
          if (sec.collection === 'single') {
            sel.append(
              h('option', { value: NEW_CUSTOM, selected: pending.has(i), disabled: !profile }, profile ? '＋ 新建自定义字段（档案里没有这一项）' : '＋ 新建自定义字段（请先保存档案）'),
            );
          }
          const row = h('div', { class: 'cr-row' }, h('span', { class: 'cr-label' }, f.label), sel);
          box.append(row);
          let valueRow: HTMLElement | undefined;
          const showValue = () => {
            valueRow?.remove();
            valueRow = undefined;
            if (!pending.has(i)) return;
            const input = h('input', { value: pending.get(i) ?? '', placeholder: '你的值，如“否”', 'aria-label': `${f.label} 的值` }) as HTMLInputElement;
            input.addEventListener('input', () => pending.set(i, input.value));
            valueRow = h('div', { class: 'cr-row cr-new' }, h('span', { class: 'small muted' }, `档案新增“${f.label.trim()}”：`), input);
            row.after(valueRow);
          };
          sel.addEventListener('change', () => {
            pending.delete(i);
            if (sel.value === '__manual') {
              f.path = undefined;
              f.manual = f.manual || '需本人完成';
            } else if (sel.value === NEW_CUSTOM) {
              f.path = undefined;
              f.manual = undefined;
              pending.set(i, '');
            } else {
              f.manual = undefined;
              f.path = sel.value || undefined;
            }
            showValue();
          });
          showValue();
        });
      }
      body.append(box);
    }
  };
  renderBody();

  const save = h('button', { class: 'btn btn-primary' }, '保存适配器');
  save.addEventListener('click', async () => {
    const n = name.value.trim();
    if (!n) {
      toast('请给适配器起个名字', 'warn');
      return;
    }
    const empty = [...pending].filter(([, v]) => !v.trim()).map(([i]) => draft.fields[i].label.trim());
    if (empty.length) {
      toast(`请填写新建自定义字段的值：${empty.join('、')}`, 'warn', 6000);
      return;
    }
    // 新建的自定义字段写入档案（读最新档案再追加；同名的已有字段更新值并复用）
    const added = pending.size;
    if (added) {
      try {
        await updateProfile((p) => {
          const list = [...(p.custom ?? [])];
          for (const [i, value] of pending) {
            const f = draft.fields[i];
            const label = f.label.trim();
            const same = list.find((c) => c.label.trim() === label);
            if (same) {
              same.value = value.trim();
              f.path = `custom.${same.id}`;
            } else {
              const id = `cus-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
              list.push({ id, label, value: value.trim(), sensitivity: 'medium' });
              f.path = `custom.${id}`;
            }
          }
          return { ...p, custom: list };
        });
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'error');
        return;
      }
    }
    draft.name = n;
    draft.updatedAt = new Date().toISOString();
    const all = await loadCustomAdapters();
    const i = all.findIndex((d) => d.id === draft.id);
    if (i >= 0) all[i] = draft;
    else all.push(draft);
    await saveCustomAdapters(all);
    close();
    toast(added ? `已保存定制适配器“${n}”，档案里新增 ${added} 个自定义字段` : `已保存定制适配器“${n}”`, 'ok');
    onSaved(draft);
  });
  const mapped = draft.fields.filter((f) => f.path).length;
  dlg.append(
    h('h3', {}, isNew ? '复核并保存定制适配器' : `编辑“${draft.name}”`),
    h(
      'p',
      { class: 'small muted' },
      `已对应 ${mapped}/${draft.fields.length} 个字段。请逐项核对；“自动识别”表示交给通用规则判断。档案里没有的网站字段（如曾用名、档案所在地），可以选“新建自定义字段”并填上你的值，之后按它填写。保存后只存在本机，只用于 ${draft.hosts.join('、')}。`,
    ),
  );
  if (dropped.length) dlg.append(h('details', { class: 'small' }, h('summary', {}, `模型有 ${dropped.length} 处输出不合规，已忽略`), h('ul', {}, ...dropped.map((d) => h('li', {}, d)))));
  dlg.append(
    h('label', { class: 'ai-field small' }, '适配器名称（可自行命名）', name),
    body,
    h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', onclick: close }, '取消'), save),
  );
  dlg.showModal();
}

export function renameAdapter(def: CustomAdapterDef, onDone: () => void): void {
  const { dlg, close } = modal();
  const name = h('input', { value: def.name, 'aria-label': '新名称', maxlength: 30 }) as HTMLInputElement;
  const ok = h('button', { class: 'btn btn-primary' }, '确定');
  ok.addEventListener('click', async () => {
    const n = name.value.trim();
    if (!n) return;
    const all = await loadCustomAdapters();
    const d = all.find((x) => x.id === def.id);
    if (d) {
      d.name = n;
      d.updatedAt = new Date().toISOString();
      await saveCustomAdapters(all);
    }
    close();
    onDone();
  });
  dlg.append(h('h3', {}, '重命名适配器'), h('label', { class: 'ai-field small' }, '名称', name), h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', onclick: close }, '取消'), ok));
  dlg.showModal();
  name.select();
}

export async function deleteAdapter(def: CustomAdapterDef, onDone: () => void): Promise<void> {
  if (!(await confirmDialog('删除定制适配器', `确定删除“${def.name}”？删除后这个网站改用通用识别，可以随时重新生成。`, '删除', true))) return;
  const all = await loadCustomAdapters();
  await saveCustomAdapters(all.filter((d) => d.id !== def.id));
  onDone();
}
