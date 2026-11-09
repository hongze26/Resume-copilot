// Content Script 入口：只读取页面结构、执行已确认的写入。完整档案从不进入这里。
import { isRequest, MSG_VERSION, type PageEvent, type Request, type Response, type SectionInfoMsg } from '../core/messages';
import { diagnose } from './diag';
import { execute, undo } from './exec';
import { snapshot } from './drivers';
import { norm } from '../core/normalize/text';
import { isVisible, text } from './dom';
import { clearMarks, mark } from './overlay';
import { probe } from './probe';
import { describeFormWithValues, frameStats, registry, scan } from './scan';
import { resumeSectionTitles, siteDomFor, type SiteDom } from './site';

declare const __VERSION__: string;

const FLAG = '__resumeCopilotContent__';
const w = window as unknown as Record<string, unknown>;

if (!w[FLAG]) {
  w[FLAG] = true;
  let currentSite: SiteDom = siteDomFor('generic');

  const sectionsInfo = (site: SiteDom): SectionInfoMsg[] => site.findSections().map((s) => site.info(s));

  // 页面变化通知（节流）：区块展开或保存后，侧边栏据此更新“填写下一条”
  let lastSig = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      const info = sectionsInfo(currentSite);
      const sig = JSON.stringify(info.map((i) => [i.key, i.openForms, i.recordCount, i.openFormEmpty, i.hasAdd, i.hasEdit]));
      if (sig !== lastSig) {
        lastSig = sig;
        const ev: PageEvent = { type: 'rc/event', version: 1, kind: 'sections-changed', sections: info };
        chrome.runtime.sendMessage(ev).catch(() => undefined);
      }
    }, 300);
  });
  // 弹窗关闭常常只是改 style/class（Element 的 display:none），也要监听属性变化
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

  // 侧边栏跟随：网页滚动时告诉侧边栏当前看到的是哪个区块（只有区块键，没有内容）
  let lastInView = '';
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  const reportInView = () => {
    scrollTimer = undefined;
    if (document.visibilityState !== 'visible') return;
    const secs = currentSite.findSections().filter((x) => isVisible(x.el));
    // 视口上方 1/3 处所在的区块
    const probeY = window.innerHeight / 3;
    let pick = secs[0];
    for (const x of secs) {
      const r = x.el.getBoundingClientRect();
      if (r.top <= probeY) pick = x;
      if (r.top <= probeY && r.bottom > probeY) { pick = x; break; }
    }
    if (!pick || pick.key === lastInView) return;
    lastInView = pick.key;
    const ev: PageEvent = { type: 'rc/event', version: 1, kind: 'section-in-view', key: pick.key };
    chrome.runtime.sendMessage(ev).catch(() => undefined);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!scrollTimer) scrollTimer = setTimeout(reportInView, 250);
    },
    { capture: true, passive: true },
  );

  // 用户点页面上的“保存”时：读出这份表单当前显示的内容，交给侧边栏询问是否存回档案。
  // 只读取，不阻止、不改变网站的保存流程。
  document.addEventListener(
    'click',
    (e) => {
      try {
        if (currentSite.id === 'generic') return;
        const t = e.target instanceof Element ? e.target.closest('button, [role="button"], a') : null;
        if (!t || !(currentSite.isSaveButton ? currentSite.isSaveButton(t) : /^(保存|确定|完成)$/.test(norm(text(t))))) return;
        const section = currentSite.sectionOf(t);
        if (!section) return;
        const forms = currentSite.openForms(section);
        const form = forms.find((f) => f.contains(t)) ?? t.closest('form');
        if (!form) return;
        const formIndex = Math.max(0, forms.indexOf(form));
        const fields = describeFormWithValues(currentSite, section, form, formIndex, snapshot);
        const values = fields.map((f) => ({ key: f.key, label: f.label, id: f.id, kind: f.kind, formIndex, text: f.text, section: f.section, sectionKey: f.sectionKey, placeholder: f.placeholder, options: f.options, disabled: f.disabled }));
        const ev: PageEvent = { type: 'rc/event', version: 1, kind: 'form-saving', sectionKey: section.key, formIndex, values };
        chrome.runtime.sendMessage(ev).catch(() => undefined);
      } catch {
        /* 读取失败不影响网站自身的保存 */
      }
    },
    true,
  );

  async function handle(req: Request): Promise<Response> {
    switch (req.type) {
      case 'rc/ping':
        return { ok: true, type: 'rc/ping', version: MSG_VERSION };
      case 'rc/scan': {
        currentSite = siteDomFor(req.adapterId);
        const fields = scan(currentSite, { sectionKey: req.sectionKey });
        const generic = currentSite.id === 'generic';
        return {
          ok: true,
          type: 'rc/scan',
          fields,
          sections: sectionsInfo(currentSite),
          url: location.href,
          frames: frameStats(),
          pageSections: generic ? resumeSectionTitles() : undefined,
        };
      }
      case 'rc/probe':
        return { ok: true, type: 'rc/probe', probes: await probe(req.keys) };
      case 'rc/exec': {
        const results = await execute(req.runId, req.items, (done, total, label) => {
          const ev: PageEvent = { type: 'rc/event', version: 1, kind: 'progress', runId: req.runId, done, total, label };
          chrome.runtime.sendMessage(ev).catch(() => undefined);
        }, currentSite);
        return { ok: true, type: 'rc/exec', results };
      }
      case 'rc/undo':
        return { ok: true, type: 'rc/undo', results: await undo(req.runId) };
      case 'rc/sections':
        currentSite = siteDomFor(req.adapterId);
        return { ok: true, type: 'rc/sections', sections: sectionsInfo(currentSite) };
      case 'rc/saved-records': {
        const site = siteDomFor(req.adapterId);
        const s = site.findSections().find((x) => x.key === req.sectionKey);
        return { ok: true, type: 'rc/saved-records', texts: s ? site.readSavedRecords(s) : [] };
      }
      case 'rc/open-form': {
        const site = siteDomFor(req.adapterId);
        const s = site.findSections().find((x) => x.key === req.sectionKey);
        if (!s) return { ok: true, type: 'rc/open-form', status: 'no-button' };
        const r = await site.openForm(s);
        return { ok: true, type: 'rc/open-form', status: r.status };
      }
      case 'rc/highlight':
        for (const m of req.marks) {
          const reg = registry.get(m.key);
          if (reg) mark(reg.el, m.state, m.note);
        }
        return { ok: true, type: 'rc/highlight' };
      case 'rc/clear-highlight':
        clearMarks();
        return { ok: true, type: 'rc/highlight' };
      case 'rc/scroll-to': {
        const site = siteDomFor(req.adapterId);
        const s = site.findSections().find((x) => x.key === req.sectionKey);
        s?.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        lastInView = req.sectionKey;
        return { ok: true, type: 'rc/scroll-to' };
      }
      case 'rc/read-form': {
        const site = siteDomFor(req.adapterId);
        const s = site.findSections().find((x) => x.key === req.sectionKey);
        if (!s) return { ok: true, type: 'rc/read-form', values: [] };
        const values = site.openForms(s).flatMap((form, i) => describeFormWithValues(site, s, form, i, snapshot)).map((f) => ({ key: f.key, label: f.label, id: f.id, kind: f.kind, formIndex: f.formIndex, text: f.text, section: f.section, sectionKey: f.sectionKey, placeholder: f.placeholder, options: f.options, disabled: f.disabled }));
        return { ok: true, type: 'rc/read-form', values };
      }
      case 'rc/diagnose': {
        const site = siteDomFor(req.adapterId);
        const report = await diagnose(site, req.adapterId, typeof __VERSION__ === 'string' ? __VERSION__ : 'dev');
        return { ok: true, type: 'rc/diagnose', report };
      }
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // 只接受本扩展自身发来的消息
    if (sender.id !== chrome.runtime.id) return false;
    if (!isRequest(msg)) return false;
    handle(msg)
      .then(sendResponse)
      .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) } satisfies Response));
    return true;
  });
}
