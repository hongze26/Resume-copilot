// 侧边栏：下拉对不上时请大模型从选项里挑（可选功能，设置里打开）。发送前显示全部要发的内容。
import { PICK_PROMPT, parsePicks, type PickRequest } from '../../core/ai-pick';
import { apiUrl, type AiConfig } from '../../core/resume/ai';
import { chatJson, loadAiConfig, saveAiConfig } from '../shared/ai-chat';
import { h } from '../shared/ui';

export async function startAiPick(reqs: PickRequest[], onPicked: (picks: Map<number, string>) => void): Promise<void> {
  const cfg = await loadAiConfig();
  const dlg = h('dialog', { class: 'dialog custom-dialog dialog-wide', 'data-testid': 'ai-pick' }) as HTMLDialogElement;
  const close = () => {
    if (dlg.open) dlg.close();
    dlg.remove();
  };
  dlg.addEventListener('cancel', close);
  document.body.append(dlg);
  const payload = reqs.map(({ i, label, value, options }) => ({ i, label, value, options }));
  const endpoint = h('input', { type: 'url', value: cfg.endpoint, placeholder: '服务商提供的 API Base URL', 'aria-label': 'API 地址' }) as HTMLInputElement;
  const model = h('input', { value: cfg.model, placeholder: '模型名称', 'aria-label': '模型名称' }) as HTMLInputElement;
  const key = h('input', { type: 'password', value: cfg.apiKey, autocomplete: 'off', 'aria-label': 'API Key' }) as HTMLInputElement;
  const status = h('p', { class: 'small', role: 'status' });
  const send = h('button', { class: 'btn btn-primary' }, '确认发送') as HTMLButtonElement;
  let controller: AbortController | undefined;
  const cancel = h('button', { class: 'btn', onclick: () => (controller?.abort(), close()) }, '取消');
  dlg.append(
    h('h3', {}, '让大模型从选项里挑'),
    h(
      'p',
      { class: 'small' },
      `有 ${reqs.length} 个下拉的选项里找不到档案里的值。确认后，会把下面这些内容发给你配置的大模型：每一项的字段名、你档案里这一项的值、网页上的选项。不发送姓名、联系方式、证件和其他档案内容。挑出来的结果标为“中”，仍需你核对。`,
    ),
    h('pre', { class: 'source-pre', style: 'max-height:30vh;overflow:auto;font-size:11px', 'data-testid': 'ai-pick-payload' }, JSON.stringify(payload, null, 1)),
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
    status.textContent = '正在请求，通常需要几秒到几十秒…';
    controller = new AbortController();
    const timer = window.setTimeout(() => controller?.abort(), 120_000);
    try {
      if (!(await permission)) throw new Error('未授权访问 API 服务');
      await saveAiConfig(config);
      const content = await chatJson(config, PICK_PROMPT, JSON.stringify(payload), controller.signal);
      const picks = parsePicks(content, reqs);
      close();
      onPicked(picks);
    } catch (e) {
      status.textContent = controller?.signal.aborted ? '已取消或超时。' : e instanceof Error ? e.message : '请求失败';
      send.disabled = false;
    } finally {
      clearTimeout(timer);
    }
  });
}
