// 侧边栏入口：扫描 → 预览 → 确认 → 执行 → 结果 → 撤销。完整档案只在这里（扩展页面）使用。
//
// 模块：
//   state.ts        状态、适配器选择、通用页面规则组装（composeRules）
//   bridge.ts       与 Content Script 通信
//   records.ts      档案记录（重复区块）
//   flow.ts         扫描、计划、填写、撤销、展开表单
//   writeback-ui.ts 存回档案
//   tabs.ts         标签页跟踪与切换
//   render.ts       界面（scroll.ts 负责重绘时的滚动位置）
//   custom-ui.ts    定制适配器的生成与复核
import { isCustomId } from '../../adapters/custom';
import { isPageEvent } from '../../core/messages';
import { loadCustomAdapters, loadProfile, loadSettings, onCustomAdaptersChanged, onProfileChanged } from '../shared/storage';
import { toast } from '../shared/ui';
import { state, setCustomDefs, adapterOverride, pickAdapter, applySections, tabStates, scrollPositions, working, resetPageState } from './state';
import { followSection } from './scroll';
import { refreshSaved } from './flow';
import { onFormSaving, showWriteback, takePendingSave, consumeSelfProfileWrite } from './writeback-ui';
import { resolveTab, setPanelWindow } from './tabs';
import { render, renderProgressOnly, openProfile } from './render';

// ---------------- 页面事件 ----------------

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!isPageEvent(msg)) return;
  if (sender.tab?.id !== state.tabId) {
    if (msg.kind === 'sections-changed' && sender.tab?.id !== undefined) tabStates.delete(sender.tab.id);
    return;
  }
  if (msg.kind === 'section-in-view') {
    followSection(msg.key);
    return;
  }
  if (msg.kind === 'form-saving') {
    onFormSaving(msg.sectionKey, msg.formIndex, msg.values);
    return;
  }
  if (msg.kind === 'progress') {
    for (const fp of state.plans.values()) {
      if (fp.runIds.includes(msg.runId)) fp.progress = { done: msg.done, total: msg.total, label: msg.label };
    }
    renderProgressOnly();
    return;
  }
  if (msg.kind === 'sections-changed') {
    const before = new Map(state.sections.map((s) => [s.key, s]));
    applySections(msg.sections);
    let savedDetected = false;
    for (const s of msg.sections) {
      const b = before.get(s.key);
      if (!b) continue;
      // 表单收起且记录数增加 → 视为用户已保存
      if (s.mode === 'repeat' && b.openForms > s.openForms && s.recordCount > b.recordCount) {
        const rid = state.activeRecord.get(s.key);
        if (rid) {
          state.doneRecords.add(rid);
          state.activeRecord.delete(s.key);
          savedDetected = true;
        }
      }
      if (b.openForms > s.openForms) {
        for (const k of [...state.plans.keys()]) if (k.startsWith(s.key + ':')) state.plans.delete(k);
        // 表单收起 = 网站接受了保存：此时再询问是否存回档案
        const ps = takePendingSave(s.key);
        if (ps) void showWriteback(ps);
      }
    }
    if (savedDetected) toast('检测到已保存，可以填写下一条', 'ok');
    void refreshSaved().then(render).catch(() => render());
  }
});

async function init() {
  document.getElementById('open-profile')!.addEventListener('click', openProfile);
  state.settings = await loadSettings();
  state.profile = await loadProfile();
  setCustomDefs(await loadCustomAdapters());
  onCustomAdaptersChanged((defs) => {
    setCustomDefs(defs);
    const before = state.adapter?.id;
    for (const [tab, id] of adapterOverride) if (isCustomId(id) && !defs.some((d) => d.id === id)) adapterOverride.delete(tab);
    if (working()) return;
    state.adapter = pickAdapter(state.url, state.tabId);
    if (state.adapter.id !== before || isCustomId(before)) resetPageState(state.scanned ? '适配器已更新，请重新扫描。' : '');
    render();
  });
  setPanelWindow((await chrome.windows.getCurrent()).id);
  await resolveTab();
  onProfileChanged((p) => {
    if (consumeSelfProfileWrite()) {
      // 侧边栏自己存回的内容：保留当前扫描结果，只更新档案
      state.profile = p;
      render();
      return;
    }
    tabStates.clear();
    scrollPositions.clear();
    state.profile = p;
    resetPageState(state.scanned ? '档案已更新，请重新扫描。' : '');
    render();
  });
  render();
}

void init();

