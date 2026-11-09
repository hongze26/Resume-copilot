import { apiUrl, type AiConfig } from '../../core/resume/ai';
import type { ParseResult } from '../../core/resume/parse';
import { recognizeWithAi } from './ai-client';
import { h } from '../shared/ui';

export async function initAi(getText: () => string, onResult: (result: ParseResult) => void) {
  const root = document.getElementById('ai-settings')!;
  const config = (await chrome.storage.local.get('aiConfig')).aiConfig as Partial<AiConfig> | undefined;
  const sessionKey = (await chrome.storage.session.get('aiKey')).aiKey as string | undefined;
  const endpoint = h('input', { type: 'url', value: config?.endpoint ?? '', placeholder: '服务商提供的 API Base URL', 'aria-label': 'API 地址' }) as HTMLInputElement;
  const model = h('input', { value: config?.model ?? '', placeholder: '模型名称', 'aria-label': '模型名称' }) as HTMLInputElement;
  const key = h('input', { type: 'password', value: sessionKey ?? '', autocomplete: 'off', 'aria-label': 'API Key' }) as HTMLInputElement;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.aiKey && !changes.aiKey.newValue) key.value = '';
    if (area === 'local' && changes.aiConfig && !changes.aiConfig.newValue) { endpoint.value = ''; model.value = ''; }
  });
  const status = h('p', { class: 'f-hint', role: 'status', 'data-testid': 'ai-status' });
  const run = h('button', { type: 'button', class: 'btn btn-primary' }, '大模型识别') as HTMLButtonElement;
  const cancel = h('button', { type: 'button', class: 'btn', hidden: true }, '取消识别') as HTMLButtonElement;
  let controller: AbortController | undefined;
  cancel.onclick = () => controller?.abort();
  const forget = h('button', { type: 'button', class: 'btn btn-small', onclick: async () => {
    key.value = '';
    await chrome.storage.session.remove('aiKey');
    status.textContent = '已清除会话密钥';
  } }, '清除密钥');
  run.onclick = () => {
    const text = getText();
    if (!text.trim()) { status.textContent = '请先选择简历文件'; return; }
    let url: URL;
    try { url = apiUrl(endpoint.value); }
    catch (e) { status.textContent = e instanceof Error ? e.message : 'API 地址无效'; return; }
    if (!model.value.trim()) { status.textContent = '请填写模型名称'; return; }
    const dlg = h('dialog', { class: 'dialog dialog-wide', 'data-testid': 'ai-consent' }) as HTMLDialogElement;
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.addEventListener('cancel', close);
    const send = h('button', { type: 'button', class: 'btn btn-primary' }, '确认发送并识别');
    dlg.append(h('h3', {}, '发送简历文字'), h('p', {}, `将以下 ${text.length} 字发送到 ${url.origin}，模型：${model.value.trim()}。服务商可能收取 API 费用并处理这些个人信息。仅发送下方文字，不发送浏览器页面或已有档案。`), h('pre', { class: 'source-pre', style: 'max-height:40vh;overflow:auto' }, text), h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', onclick: close }, '取消'), send));
    send.onclick = async () => {
      // 权限请求直接发生在确认按钮的用户手势中。
      const permission = chrome.permissions.request({ origins: [`${url.origin}/*`] });
      close();
      run.disabled = true;
      cancel.hidden = false;
      controller = new AbortController();
      const timer = window.setTimeout(() => controller?.abort(), 120_000);
      status.textContent = '正在识别，请稍候…';
      try {
        if (!await permission) throw new Error('未授权访问 API 服务');
        const settings: AiConfig = { endpoint: url.href, model: model.value.trim(), apiKey: key.value.trim() };
        await chrome.storage.local.set({ aiConfig: { endpoint: settings.endpoint, model: settings.model } });
        await chrome.storage.session.set({ aiKey: settings.apiKey });
        const result = await recognizeWithAi(text, settings, controller.signal);
        if (getText() !== text) throw new Error('简历原文已更换，请对新文件重新识别');
        status.textContent = `已识别 ${result.fields.length} 个字段、${result.records.length} 条记录；请预览核对后合并。`;
        onResult(result);
      } catch (e) {
        status.textContent = controller.signal.aborted ? '识别已取消或超时；档案未修改。' : e instanceof Error ? e.message : '识别失败';
      } finally {
        clearTimeout(timer);
        controller = undefined;
        run.disabled = false;
        cancel.hidden = true;
      }
    };
    document.body.append(dlg);
    dlg.showModal();
  };
  root.append(h('summary', {}, '大模型辅助识别（API）'), h('p', { class: 'f-hint' }, '支持 Chat Completions / JSON 输出兼容接口。地址和模型保存在本机；密钥仅保留至浏览器会话结束，不进入档案备份。'), h('label', { class: 'ai-field' }, 'API 地址（Base URL 或完整 chat/completions 地址）', endpoint), h('label', { class: 'ai-field' }, '模型名称', model), h('label', { class: 'ai-field' }, 'API Key（本机免密服务可留空）', key), h('div', { class: 'source-tools' }, run, cancel, forget), status);
}
