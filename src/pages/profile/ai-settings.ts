import { apiUrl, type AiConfig } from '../../core/resume/ai';
import type { ParseResult } from '../../core/resume/parse';
import { recognizeImagesWithAi, recognizeWithAi } from './ai-client';
import { h } from '../shared/ui';

/** 一次识别任务：只有文字（简历原文），或截图加本人补充的文字。 */
export interface AiJob {
  text: string;
  images?: string[];
  /** 状态文字另外显示在哪里（截图入口在设置区之外）。 */
  say?: (msg: string) => void;
  busy?: (on: boolean) => void;
  /** 等待期间输入被换掉时返回 true，结果作废。 */
  stale: () => boolean;
}

/** onResult 的 transcript：截图识别时模型转写出的文字，供左栏对照。 */
export async function initAi(getText: () => string, onResult: (result: ParseResult, transcript?: string) => void) {
  const root = document.getElementById('ai-settings') as HTMLDetailsElement;
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
  const abort = () => controller?.abort();
  cancel.onclick = abort;
  const forget = h('button', { type: 'button', class: 'btn btn-small', onclick: async () => {
    key.value = '';
    await chrome.storage.session.remove('aiKey');
    status.textContent = '已清除会话密钥';
  } }, '清除密钥');

  const start = (job: AiJob) => {
    const images = job.images ?? [];
    const text = job.text;
    const say = (msg: string) => { status.textContent = msg; job.say?.(msg); };
    if (controller) { say('上一次识别还没结束'); return; }
    if (!images.length && !text.trim()) { say('请先选择简历文件'); return; }
    // 截图入口在设置区之外：缺配置时把设置区展开给本人看
    const needConfig = (msg: string) => { if (images.length) root.open = true; say(images.length ? `${msg}（在下方“大模型辅助识别（API）”里填写）` : msg); };
    let url: URL;
    try { url = apiUrl(endpoint.value); }
    catch (e) { needConfig(endpoint.value.trim() ? (e instanceof Error ? e.message : 'API 地址无效') : '请先填写 API 地址'); return; }
    if (!model.value.trim()) { needConfig('请填写模型名称'); return; }
    const dlg = h('dialog', { class: 'dialog dialog-wide', 'data-testid': 'ai-consent' }) as HTMLDialogElement;
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.addEventListener('cancel', close);
    const send = h('button', { type: 'button', class: 'btn btn-primary' }, '确认发送并识别');
    const actions = h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', onclick: close }, '取消'), send);
    if (images.length) {
      dlg.append(
        h('h3', {}, '发送截图'),
        h('p', {}, `将以下 ${images.length} 张截图${text.trim() ? `和 ${text.length} 字补充文字` : ''}发送到 ${url.origin}，模型：${model.value.trim()}（需支持读图）。服务商可能收取 API 费用并处理这些个人信息。`),
        h('p', { class: 'warn-text' }, '截图会整张发送：图里的证件号、手机号、住址等也会一起发出，不需要的部分请先裁掉或打码。不发送浏览器页面或已有档案。'),
        h('div', { class: 'shot-list shot-list-large' }, ...images.map((src, i) => h('img', { src, alt: `截图 ${i + 1}` }))),
        text.trim() ? h('pre', { class: 'source-pre', style: 'max-height:20vh;overflow:auto' }, text) : '',
        actions,
      );
    } else {
      dlg.append(h('h3', {}, '发送简历文字'), h('p', {}, `将以下 ${text.length} 字发送到 ${url.origin}，模型：${model.value.trim()}。服务商可能收取 API 费用并处理这些个人信息。仅发送下方文字，不发送浏览器页面或已有档案。`), h('pre', { class: 'source-pre', style: 'max-height:40vh;overflow:auto' }, text), actions);
    }
    send.onclick = async () => {
      // 权限请求直接发生在确认按钮的用户手势中。
      const permission = chrome.permissions.request({ origins: [`${url.origin}/*`] });
      close();
      run.disabled = true;
      cancel.hidden = false;
      job.busy?.(true);
      const ctl = (controller = new AbortController());
      const timer = window.setTimeout(() => ctl.abort(), images.length ? 180_000 : 120_000);
      say('正在识别，请稍候…');
      try {
        if (!await permission) throw new Error('未授权访问 API 服务');
        const settings: AiConfig = { endpoint: url.href, model: model.value.trim(), apiKey: key.value.trim() };
        await chrome.storage.local.set({ aiConfig: { endpoint: settings.endpoint, model: settings.model } });
        await chrome.storage.session.set({ aiKey: settings.apiKey });
        const got = images.length ? await recognizeImagesWithAi(images, text, settings, ctl.signal) : { result: await recognizeWithAi(text, settings, ctl.signal), text: undefined };
        if (job.stale()) throw new Error(images.length ? '截图或补充文字已更换，请重新识别' : '简历原文已更换，请对新文件重新识别');
        const left = got.result.dropped?.length ? `，${got.result.dropped.length} 项没有填入（预览里列出原因）` : '';
        say(`已识别 ${got.result.fields.length} 个字段、${got.result.records.length} 条记录${left}；请预览核对后合并。`);
        onResult(got.result, got.text);
      } catch (e) {
        say(ctl.signal.aborted ? '识别已取消或超时；档案未修改。' : e instanceof Error ? e.message : '识别失败');
      } finally {
        clearTimeout(timer);
        controller = undefined;
        run.disabled = false;
        cancel.hidden = true;
        job.busy?.(false);
      }
    };
    document.body.append(dlg);
    dlg.showModal();
  };
  run.onclick = () => {
    const text = getText();
    start({ text, stale: () => getText() !== text });
  };
  root.append(h('summary', {}, '大模型辅助识别（API）'), h('p', { class: 'f-hint' }, '支持 Chat Completions / JSON 输出兼容接口；识别截图需要能读图的模型。地址和模型保存在本机；密钥仅保留至浏览器会话结束，不进入档案备份。'), h('label', { class: 'ai-field' }, 'API 地址（Base URL 或完整 chat/completions 地址）', endpoint), h('label', { class: 'ai-field' }, '模型名称', model), h('label', { class: 'ai-field' }, 'API Key（本机免密服务可留空）', key), h('div', { class: 'source-tools' }, run, cancel, forget), status);
  return { start, abort };
}
