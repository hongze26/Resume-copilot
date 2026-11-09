// 侧边栏界面：站点信息、档案状态、区块与计划、结果、适配器栏、设置。每次 render() 整体重绘。
import { ADAPTERS } from '../../adapters/registry';
import type { CustomAdapterDef } from '../../adapters/custom';
import { deleteAdapter, openReview, renameAdapter, startGenerate } from './custom-ui';
import { MSG_VERSION, type Response, type SectionInfoMsg } from '../../core/messages';
import { displayDate, parseDate, type DateParts } from '../../core/normalize/date';
import { summarize } from '../../core/plan/plan';
import { SKIP_REASON_ZH, type FillValue, type Level, type PlanItem } from '../../core/plan/types';
import type { RecordCollection } from '../../core/profile/types';
import { validateProfile } from '../../core/profile/validate';
import { saveSettings } from '../shared/storage';
import { clear, downloadText, h, toast } from '../shared/ui';
import { LEVEL_ZH, COLLECTION_ZH } from './labels';
import { state, customDefs, setCustomDefs, adapterOverride, pickAdapter, isCustom, currentDef, isGenericFlow, domId, working, resetPageState, type Choice, type FormPlan } from './state';
import { app, withAnchor } from './scroll';
import { send, ensureContent } from './bridge';
import { sectionCollection, orderedRecords, recordTitle, recordStatus, boundRecord } from './records';
import { doScan, executePlan, undoPlan, retryWithCandidate, openForm } from './flow';
import { requestTabAccess, resumePendingActivation } from './tabs';

// ---------------- 渲染 ----------------

export function badge(level: Level) {
  return h('span', { class: `badge badge-${level}` }, LEVEL_ZH[level]);
}

export function valueDisplay(v: FillValue | undefined, fallback?: string): string {
  if (!v) return fallback ?? '';
  switch (v.t) {
    case 'text':
      return v.text.length > 60 ? v.text.slice(0, 60) + '…' : v.text;
    case 'option':
    case 'radio':
      return v.text;
    case 'remote-option':
      return v.query;
    case 'cascade':
      return v.path.join(' / ');
    case 'cascade-multi':
      return v.paths.map((p) => p.join(' / ')).join('、');
    case 'date':
      return displayDate(v.date);
    case 'date-range':
      return `${displayDate(v.start)} – ${displayDate(v.end)}`;
    case 'checkbox':
      return v.checked ? '勾选' : '不勾选';
    case 'popup-pick':
      return v.path ? v.path.join(' / ') : fallback ?? v.names[0];
  }
}

export function dayInput(fp: FormPlan, it: PlanItem, c: Choice, rerender: () => void) {
  const base = parseDate(it.display?.split(' – ')[0]?.replace(/年|月/g, '-').replace(/-$/, '') ?? '');
  const inp = h('input', { type: 'date', 'aria-label': `${it.label}：补充具体日期` }) as HTMLInputElement;
  if (base && base !== 'present' && base.m) {
    const mm = String(base.m).padStart(2, '0');
    inp.min = `${base.y}-${mm}-01`;
    inp.max = `${base.y}-${mm}-${new Date(base.y, base.m, 0).getDate()}`;
  }
  // 预先填上按 1 日补齐的日期（可改）
  if (c.value?.t === 'date' && c.value.date !== 'present' && c.value.date.d) {
    const d = c.value.date;
    inp.value = `${d.y}-${String(d.m ?? 1).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  inp.addEventListener('change', () => {
    const d = parseDate(inp.value);
    if (d && d !== 'present') {
      c.value = it.kind === 'date' ? { t: 'date', date: d as DateParts } : c.value;
      c.checked = !!c.value;
    } else {
      c.value = undefined;
      c.checked = false;
    }
    rerender();
  });
  return inp;
}

export function renderRow(fp: FormPlan | null, it: PlanItem, canExec: boolean, rerender: () => void): HTMLElement {
  const c = fp?.choices.get(it.fieldKey) ?? { checked: false };
  const actionable = canExec && (it.level === 'high' || it.level === 'medium') && fp?.state === 'preview';
  const cb = h('input', { type: 'checkbox', 'aria-label': `填写“${it.label}”`, checked: c.checked, disabled: !actionable || (!c.value && it.level === 'medium') }) as HTMLInputElement;
  cb.addEventListener('change', () => {
    c.checked = cb.checked && !!c.value;
    rerender();
  });

  let valueEl: HTMLElement;
  if (it.level === 'high') {
    valueEl = h('div', { class: 'row-value' }, valueDisplay(it.value, it.display));
  } else if (it.level === 'medium') {
    if (it.needsDetail === 'day' && it.kind === 'date' && fp) {
      valueEl = h('div', { class: 'row-value' }, h('div', { class: 'small muted' }, `档案只写到 ${it.display ?? ''}，先按 1 日填；知道具体哪天可以改：`), dayInput(fp, it, c, rerender));
    } else if (it.candidates && it.candidates.length > 0) {
      const sel = h('select', { 'aria-label': `为“${it.label}”选择要填写的值`, disabled: !actionable }) as HTMLSelectElement;
      sel.append(h('option', { value: '' }, it.longtext ? '（不插入）' : '（请选择）'));
      it.candidates.forEach((cd, i) => sel.append(h('option', { value: String(i) }, cd.display)));
      const idx = it.candidates.findIndex((cd) => JSON.stringify(cd.value) === JSON.stringify(c.value));
      sel.value = idx >= 0 ? String(idx) : '';
      sel.addEventListener('change', () => {
        const cd = sel.value === '' ? undefined : it.candidates![Number(sel.value)];
        c.value = cd?.value;
        c.checked = !!cd;
        rerender();
      });
      valueEl = h('div', { class: 'row-value' }, sel);
    } else {
      valueEl = h('div', { class: 'row-value muted' }, it.display ?? '请在页面上手动处理');
    }
  } else {
    valueEl = h('div', { class: 'row-value muted small' }, it.skipReason ? SKIP_REASON_ZH[it.skipReason] : '未识别');
  }

  return h(
    'div',
    { class: `row row-${it.level}`, 'data-field': it.fieldKey },
    actionable ? cb : h('span', {}),
    h('div', { class: 'row-label' }, it.label || '（无标签）'),
    badge(it.level),
    valueEl,
    it.reasons.length
      ? h('details', {}, h('summary', {}, '依据'), h('ul', { class: 'reasons' }, ...it.reasons.map((r) => h('li', {}, r))))
      : null,
  );
}

export function renderResults(fp: FormPlan): HTMLElement {
  const res = fp.results ?? [];
  const ok = res.filter((r) => r.status === 'ok').length;
  const wrap = h('div', { class: 'exec-bar' });
  if (fp.stopped) wrap.append(h('div', { class: 'banner banner-error' }, fp.stopped));
  wrap.append(h('div', {}, h('strong', {}, `已填写 ${ok} 项`), res.length - ok ? `，${res.length - ok} 项未填写` : ''));
  if (fp.autoAdded?.length) wrap.append(h('div', { class: 'small muted' }, `选择学历后新出现的字段已一并填写：${fp.autoAdded.join('、')}`));
  const list = h('ul', { class: 'results' });
  for (const r of res) {
    const why = r.reason ? SKIP_REASON_ZH[r.reason] : '';
    const li = h('li', { class: `result result-${r.status}` }, h('span', {}, r.label, r.status !== 'ok' ? ` — ${why}${r.detail ? `：${r.detail}` : ''}` : r.detail ? `（${r.detail}）` : ''));
    if (r.status === 'failed' && r.candidates && r.candidates.length && state.adapter?.allowExecute) {
      li.append(
        h(
          'div',
          { class: 'cands' },
          h('span', { class: 'small muted' }, '页面候选：'),
          ...r.candidates.slice(0, 8).map((cd) => h('button', { class: 'btn btn-small', onclick: () => void retryWithCandidate(fp, r, cd) }, `改选“${cd}”`)),
        ),
      );
    }
    list.append(li);
  }
  wrap.append(list);
  const col = sectionCollection(fp.sectionKey);
  const save = state.sections.find((s) => s.key === fp.sectionKey)?.saveLabel || '保存';
  const missed = res.length - ok;
  wrap.append(
    h(
      'div',
      { class: 'banner banner-info' },
      `${missed ? `上面打 ✕ 的 ${missed} 项没填上，请在网页上自己补。` : ''}核对没问题后，点网页上这份表单下方的“${save}”按钮（工具不会替你点）。${col ? `点了“${save}”后，这里会自动换到下一条。` : ''}`,
    ),
  );
  wrap.append(
    h(
      'div',
      { class: 'scan-row' },
      fp.runIds.length ? h('button', { class: 'btn', onclick: () => void undoPlan(fp) }, '撤销本次填写') : null,
      h('button', { class: 'btn', onclick: () => void doScan() }, '重新扫描'),
    ),
  );
  return wrap;
}

export function renderFormPlan(fp: FormPlan): HTMLElement {
  const box = h('div', { class: 'form-plan', 'data-plan': fp.id });
  const rerender = () => {
    const fresh = renderFormPlan(fp);
    box.replaceWith(fresh);
  };
  const s = summarize(fp.items);
  box.append(
    h(
      'div',
      { class: 'summary-line' },
      h('span', { class: 'badge badge-high' }, `高 ${s.high}`),
      h('span', { class: 'badge badge-medium' }, `中 ${s.medium}`),
      h('span', { class: 'badge badge-low' }, `低 ${s.low}`),
      h('span', { class: 'badge badge-skip' }, `跳过 ${s.skip}`),
    ),
  );
  if (fp.items.length === 0) {
    box.append(h('p', { class: 'muted small' }, '这份表单里没有可处理的字段。'));
    return box;
  }
  const rows = h('div', { class: 'rows' });
  for (const it of fp.items) rows.append(renderRow(fp, it, !!state.adapter?.allowExecute, rerender));
  box.append(rows);
  if (fp.state === 'preview') {
    const n = [...fp.choices.values()].filter((c) => c.checked && c.value).length;
    box.append(
      h(
        'div',
        { class: 'exec-bar' },
        h('div', { class: 'target-note' }, `写入目标：${safeHost()}。网站可能自动保存你填写的内容。工具不会点击保存、提交或投递。`),
        h('button', { class: 'btn btn-primary', disabled: n === 0 || state.busy, onclick: () => void executePlan(fp) }, `填写选中的 ${n} 项`),
      ),
    );
  } else if (fp.state === 'running') {
    const p = fp.progress;
    box.append(
      h(
        'div',
        { class: 'exec-bar', 'data-progress': fp.id },
        h('div', { class: 'small muted' }, p ? `正在填写：${p.label}（${p.done}/${p.total}）` : '正在填写…'),
        h('div', { class: 'progress' }, h('div', { style: `width:${p && p.total ? Math.round((p.done / p.total) * 100) : 5}%` })),
      ),
    );
  } else {
    box.append(renderResults(fp));
  }
  return box;
}

export function renderProgressOnly() {
  for (const fp of state.plans.values()) {
    if (fp.state !== 'running') continue;
    const el = document.querySelector(`[data-progress="${CSS.escape(fp.id)}"]`);
    if (!el || !fp.progress) continue;
    const p = fp.progress;
    el.replaceChildren(
      h('div', { class: 'small muted' }, `正在填写：${p.label}（${p.done}/${p.total}）`),
      h('div', { class: 'progress' }, h('div', { style: `width:${p.total ? Math.round((p.done / p.total) * 100) : 5}%` })),
    );
  }
}

export function safeHost(): string {
  try {
    return new URL(state.url).host;
  } catch {
    return '当前网站';
  }
}

export function renderSection(sec: SectionInfoMsg): HTMLElement | null {
  const rule = state.adapter?.sections.find((s) => s.key === sec.key);
  if (!rule) return null;
  const card = h('section', { class: 'card section-card', 'data-section': sec.key, 'data-anchor': `sec:${sec.key}` });
  const head = h(
    'div',
    { class: 'section-head' },
    h(
      'h2',
      {
        class: 'section-title-link',
        title: '在网页上定位到这个区块',
        onclick: () => void send({ type: 'rc/scroll-to', version: MSG_VERSION, adapterId: domId(), sectionKey: sec.key }).catch(() => undefined),
      },
      sec.title,
    ),
  );
  card.append(head);
  if (rule.mode === 'manual') {
    head.append(h('span', { class: 'badge badge-skip' }, '需本人完成'));
    card.append(h('p', { class: 'small muted', style: 'margin:0' }, rule.manualNote ?? '请手动填写'));
    return card;
  }
  const plans = [...state.plans.values()].filter((p) => p.sectionKey === sec.key);
  const generic = isGenericFlow();
  // 通用页面上没有表单项的单项区块（页面大标题、说明文字）不显示；只读展示、有“编辑”按钮的除外
  if (generic && rule.mode !== 'repeat' && plans.length === 0 && !sec.hasEdit) return null;
  if (rule.mode === 'repeat') {
    const col = rule.collection as RecordCollection;
    const recs = orderedRecords(col);
    const onPage = recs.filter((r) => recordStatus(sec.key, col, r) !== 'pending').length;
    card.append(
      h(
        'div',
        { class: 'small muted' },
        generic
          ? `档案 ${recs.length} 条，其中 ${onPage} 条在页面上已能找到（按学校/单位等名称比对，仅供参考）`
          : `档案 ${recs.length} 条 → 页面已识别 ${sec.recordCount} 条已保存记录（识别结果仅供参考）→ 建议添加 ${recs.length - onPage} 条`,
      ),
    );
    const active = boundRecord(sec.key);
    const list = h('ul', { class: 'records' });
    recs.forEach((r, i) => {
      const st = recordStatus(sec.key, col, r);
      const isActive = active?.id === r.id && st === 'pending';
      list.append(
        h(
          'li',
          {
            class: `record ${st !== 'pending' ? 'record-done' : ''} ${isActive ? 'record-active' : ''} ${generic ? 'record-pick' : ''}`,
            title: generic ? '用这一条填写当前展开的表单' : undefined,
            onclick: generic
              ? () => {
                  state.doneRecords.delete(r.id);
                  state.activeRecord.set(sec.key, r.id);
                  void doScan();
                }
              : undefined,
          },
          h('span', {}, h('span', { class: 'record-title' }, `第 ${i + 1} 条：${recordTitle(col, r)}`)),
          h('span', { class: 'small muted' }, st === 'done' ? '本次已保存' : st === 'on-page' ? '页面中已存在' : isActive ? '当前' : '待填写'),
        ),
      );
    });
    if (recs.length === 0) list.append(h('li', { class: 'small muted' }, `档案中没有${COLLECTION_ZH[col] ?? ''}记录`));
    card.append(list);
    if (generic) {
      if (plans.length > 0) {
        if (recs.length > 1) card.append(h('p', { class: 'small muted' }, '点上面的某一条，可改用那一条填写当前展开的表单。'));
      } else if (active && sec.hasAdd) {
        card.append(h('button', { class: 'btn btn-primary', disabled: state.busy, onclick: () => void openForm(sec.key) }, `添加并准备第 ${recs.indexOf(active) + 1} 条：${recordTitle(col, active)}`));
      } else if (!active && recs.length > 0) {
        card.append(h('div', { class: 'banner banner-ok' }, '档案中的记录在页面上都已能找到。如需修改某一条，请在页面上点它的“编辑”，再点“重新扫描本页”。'));
      } else if (recs.length > 0) {
        card.append(h('p', { class: 'small muted' }, '请先在网页上点开这一栏的“添加/编辑”（弹窗或展开的表单），再点“重新扫描本页”。'));
      }
    } else if (plans.length === 0) {
      if (sec.openForms > 0 && !sec.openFormEmpty) {
        card.append(h('div', { class: 'banner banner-warn' }, '这个区块里有一份未保存的表单。请先在页面上保存或取消，再继续。'));
      } else if (active && state.adapter?.allowExecute) {
        card.append(
          h('button', { class: 'btn btn-primary', disabled: state.busy, onclick: () => void openForm(sec.key) }, sec.openForms > 0 ? `扫描并准备：${recordTitle(col, active)}` : `添加并准备第 ${recs.indexOf(active) + 1} 条：${recordTitle(col, active)}`),
        );
      } else if (!active && recs.length > 0) {
        card.append(h('div', { class: 'banner banner-ok' }, '档案中的记录都已在页面中。'));
      }
    }
  } else if (plans.length === 0) {
    card.append(
      sec.openForms > 0
        ? h('p', { class: 'small muted' }, '表单已展开，点击上方“扫描本页”。')
        : h('button', { class: 'btn', disabled: state.busy, onclick: () => void openForm(sec.key) }, generic ? '点网页上的“编辑”并扫描' : '展开编辑表单并扫描'),
    );
  }
  for (const fp of plans) card.append(renderFormPlan(fp));
  return card;
}

/** 通用页面的说明卡：识别方式、页面上的区块、跨域框架提示和置信度汇总。 */
export function renderGenericHeader(): HTMLElement {
  const card = h('section', { class: 'card', 'data-testid': 'generic-result', 'data-anchor': 'generic' });
  card.append(
    h(
      'div',
      { class: 'banner banner-info' },
      state.fallbackGeneric
        ? `${state.adapter?.name ?? ''}适配器没有在这个页面上找到它认识的简历区块（可能不是“申请简历”页，或网站改版），已改用通用识别。`
        : isCustom()
          ? `使用定制适配器“${state.adapter?.name ?? ''}”识别本页。`
          : '通用识别：按字段名称对应档案。“高”默认勾选，“中”需要你选定，其余不填写；填写前请逐项核对。',
    ),
  );
  if (state.pageSections.length) {
    card.append(h('div', { class: 'small', 'data-testid': 'page-sections' }, `页面上识别到的简历区块：${state.pageSections.join('、')}`));
  }
  if (state.frames?.crossOrigin) {
    card.append(
      h('div', { class: 'banner banner-warn small' }, `页面里有 ${state.frames.crossOrigin} 个来自其他网站的内嵌框架（有些企业招聘系统把表单放在这里），出于浏览器安全限制无法读取。如果要填的表单就在里面，可以在新标签页中单独打开该表单页面后再扫描。`),
    );
  }
  const items = [...state.plans.values()].flatMap((p) => p.items);
  const s = summarize(items);
  card.append(
    h(
      'div',
      { class: 'summary-line' },
      h('span', { class: 'badge badge-high' }, `高 ${s.high}`),
      h('span', { class: 'badge badge-medium' }, `中 ${s.medium}`),
      h('span', { class: 'badge badge-low' }, `低 ${s.low}`),
      h('span', { class: 'badge badge-skip' }, `跳过 ${s.skip}`),
    ),
  );
  if (items.length === 0) {
    card.append(
      h(
        'p',
        { class: 'muted' },
        state.sections.length
          ? '页面上没有展开的表单字段。经历类记录请点下方的“添加并准备”，或先在网页上点开“添加/编辑”，再点“重新扫描本页”。'
          : '没有找到表单字段。请确认打开的是填写简历的页面；如果表单需要先点“添加/编辑”才出现，请先点开再扫描。',
      ),
    );
  }
  return card;
}

export function renderDiag(): HTMLElement {
  const det = h('details', { class: 'card collapsible diag', 'data-anchor': 'diag' }) as HTMLDetailsElement;
  det.append(h('summary', {}, '扫描诊断（只读）'));
  det.append(
    h(
      'p',
      { class: 'small muted' },
      '生成一份页面结构报告：只有字段名称、控件类型、选项文字和日期面板结构，不包含你填写的任何内容。请先在页面上点开各区块的“添加/编辑”（不用填写），再点下面的按钮。报告生成后请你自己看一遍，确认没有个人信息再发给开发者。',
    ),
  );
  det.append(
    h(
      'button',
      {
        class: 'btn',
        disabled: state.busy,
        onclick: async () => {
          try {
            state.busy = true;
            render();
            await ensureContent();
            const r = await send<Extract<Response, { type: 'rc/diagnose' }>>({ type: 'rc/diagnose', version: MSG_VERSION, adapterId: domId() });
            state.diagReport = JSON.stringify(r.report, null, 2);
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), 'error');
          } finally {
            state.busy = false;
            render();
            (document.querySelector('details.diag') as HTMLDetailsElement | null)?.setAttribute('open', '');
          }
        },
      },
      '生成诊断报告',
    ),
  );
  if (state.diagReport) {
    det.open = true;
    det.append(h('textarea', { readonly: true, 'aria-label': '诊断报告内容', value: state.diagReport }));
    det.append(
      h(
        'button',
        { class: 'btn', onclick: () => downloadText(`diagnostic-${state.adapter?.id}-${new Date().toISOString().slice(0, 10)}.json`, state.diagReport) },
        '下载报告文件',
      ),
    );
  }
  return det;
}

export function render(): void {
  resumePendingActivation();
  withAnchor(renderInto);
}

export function renderInto(): void {
  clear(app);
  app.append(renderAdapterBar());
  const a = state.adapter;
  // 站点信息
  const site = h('section', { class: 'card' });
  site.append(
    h(
      'div',
      { class: 'site-line' },
      h('span', { class: 'site-name' }, a ? (a.id === 'generic' ? safeHost() || '当前页面' : `${a.name}（${safeHost()}）`) : '当前页面'),
      a && a.id !== 'generic' ? h('span', { class: 'small muted' }, `适配器 ${a.version} · 最近验证 ${a.verifiedAt}`) : null,
    ),
  );
  if (state.urlBlocked) {
    site.append(
      h(
        'div',
        { class: 'banner banner-warn', 'data-testid': 'url-blocked' },
        h('div', {}, '读取不到当前网页的地址，所以还不能判断是哪个招聘网站。'),
        h('div', { class: 'small' }, '原因：浏览器默认不让扩展读取标签页网址。请点下面的按钮授权（只授权一次，资料仍然只在本机）；或者在该网页上点一下工具栏里的“网申助手”图标。'),
        h('div', { style: 'margin-top:6px' }, h('button', { class: 'btn btn-small btn-primary', onclick: () => void requestTabAccess() }, '允许读取当前网页地址')),
      ),
    );
  } else if (a?.notes.length) site.append(h('ul', { class: 'notes' }, ...a.notes.map((n) => h('li', {}, n))));
  app.append(site);

  // 档案状态
  if (!state.profile) {
    app.append(
      h(
        'div',
        { class: 'banner banner-warn' },
        '还没有已保存的档案。请在“档案管理”页填写（可以导入简历自动识别），然后点右上角“保存”——没点保存的内容侧边栏读不到。',
        h('div', { style: 'margin-top:6px' }, h('button', { class: 'btn btn-small', onclick: openProfile }, '打开档案管理')),
      ),
    );
    return;
  }
  const issues = validateProfile(state.profile);
  if (issues.length) {
    app.append(h('div', { class: 'banner banner-error' }, `档案有 ${issues.length} 处格式问题，请在档案管理页修正后再使用。`));
    return;
  }
  if (!state.profile.meta.reviewedAt) {
    app.append(h('div', { class: 'banner banner-warn', 'data-testid': 'unreviewed' }, '档案尚未核对。请先在档案管理页逐项核对并点“我已核对”，再用于填写。'));
  } else {
    app.append(h('div', { class: 'small muted' }, `档案：已核对（${new Date(state.profile.meta.reviewedAt).toLocaleString('zh-CN')}）`));
  }
  if (state.pageNote) app.append(h('div', { class: 'banner banner-info' }, state.pageNote));

  // 扫描
  const unsupportedPage = !/^https?:/.test(state.url);
  if (state.urlBlocked) {
    app.append(renderDiag());
    return;
  }
  app.append(
    h(
      'div',
      { class: 'scan-row' },
      h('button', { class: 'btn btn-primary', id: 'scan', disabled: state.busy || unsupportedPage, onclick: () => void doScan() }, state.busy ? '处理中…' : state.scanned ? '重新扫描本页' : '扫描本页'),
      unsupportedPage ? h('span', { class: 'small muted' }, '请先切换到招聘网站的申请页面') : null,
    ),
  );
  if (state.error) app.append(h('div', { class: 'banner banner-error' }, state.error));

  if (state.scanned) {
    const generic = isGenericFlow();
    if (generic) app.append(renderGenericHeader());
    const shown = state.sections.map(renderSection).filter((x): x is HTMLElement => !!x);
    if (shown.length === 0 && !generic) app.append(h('div', { class: 'banner banner-warn' }, '没有识别到简历区块。请确认打开的是“申请简历”页面。'));
    app.append(...shown);
  }
  app.append(renderDiag());
  app.append(renderSettings());
}

// ---------------- 适配器栏（定制适配器） ----------------

export function useAdapter(id: string): void {
  if (working() || state.tabId === undefined) return;
  adapterOverride.set(state.tabId, id);
  state.adapter = pickAdapter(state.url, state.tabId);
  resetPageState('');
  render();
}

export function onCustomSaved(def: CustomAdapterDef): void {
  if (!customDefs.some((d) => d.id === def.id)) setCustomDefs([...customDefs, def]);
  else setCustomDefs(customDefs.map((d) => (d.id === def.id ? def : d)));
  if (state.tabId !== undefined && def.hosts.some((h) => safeHost() === h)) adapterOverride.set(state.tabId, def.id);
  state.adapter = pickAdapter(state.url, state.tabId);
  resetPageState('已启用定制适配器，请点“扫描本页”。');
  render();
}

export async function generateCustom(): Promise<void> {
  if (!/^https?:/.test(state.url)) return;
  const scanFields = async () => {
    // 读取页面需要该网站的访问权限（在点击手势中申请）
    const origins = [`${new URL(state.url).protocol}//${new URL(state.url).host}/*`];
    if (!(await chrome.permissions.request({ origins }))) throw new Error('需要允许扩展访问这个网站后才能读取表单结构');
    try {
      await send({ type: 'rc/ping', version: MSG_VERSION });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId: state.tabId!, frameIds: [0] }, files: ['content.js'] });
    }
    const r = await send<Extract<Response, { type: 'rc/scan' }>>({ type: 'rc/scan', version: MSG_VERSION, adapterId: 'generic' });
    return r.fields;
  };
  await startGenerate({ url: state.url, scan: scanFields, onSaved: onCustomSaved });
}

export function renderAdapterBar(): HTMLElement {
  const bar = h('section', { class: 'adapter-bar', 'data-testid': 'adapter-bar' });
  const httpPage = /^https?:/.test(state.url);
  const builtin = ADAPTERS.find((a) => a.matches(state.url));
  const chips = h('div', { class: 'chips' });
  const chip = (id: string, label: string, title: string, matched: boolean) =>
    h('button', { class: `chip${state.adapter?.id === id ? ' chip-active' : ''}${matched ? '' : ' chip-other'}`, title, disabled: working(), onclick: () => useAdapter(id) }, label);
  chips.append(builtin ? chip(builtin.id, builtin.name, `内置适配器：${builtin.name}`, true) : chip('generic', '通用识别', '没有专用适配器时使用：按字段名称识别，预览确认后填写', true));
  for (const d of customDefs) chips.append(chip(d.id, d.name, `定制适配器，用于 ${d.hosts.join('、')}`, d.hosts.includes(safeHost())));
  chips.append(h('button', { class: 'chip chip-add', disabled: !httpPage || working(), title: '读取当前页面的表单结构，用大模型生成字段对应关系', onclick: () => void generateCustom() }, '＋ 生成定制适配器'));
  bar.append(chips);
  // 也可以输入招聘页面网址：在新标签页打开（需要登录的页面请先登录），打开后在那个页面上点“生成定制适配器”
  const urlInput = h('input', { type: 'url', placeholder: '招聘申请页网址（以 https 开头）', 'aria-label': '招聘页面网址' }) as HTMLInputElement;
  const openUrl = () => {
    let u: URL;
    try {
      u = new URL(urlInput.value.trim());
    } catch {
      toast('请输入完整网址（以 https:// 开头）', 'warn');
      return;
    }
    if (!/^https?:$/.test(u.protocol)) {
      toast('只支持 http/https 网址', 'warn');
      return;
    }
    void chrome.tabs.create({ url: u.href, active: true });
    toast('已在新标签页打开。页面加载（并登录、点开各区块）后，在那个页面上点“生成定制适配器”。', 'info', 7000);
  };
  bar.append(
    h(
      'details',
      { class: 'url-gen small' },
      h('summary', {}, '从网址生成'),
      h('div', { class: 'url-row' }, urlInput, h('button', { class: 'btn btn-small', onclick: openUrl }, '打开')),
    ),
  );
  const def = currentDef();
  if (def) {
    bar.append(
      h(
        'div',
        { class: 'chip-actions small' },
        h('span', { class: 'muted' }, `当前：${def.name}`),
        h('button', { class: 'link-btn', onclick: () => void openReview(def, [], onCustomSaved) }, '编辑对应关系'),
        h('button', { class: 'link-btn', onclick: () => renameAdapter(def, () => undefined) }, '重命名'),
        h('button', { class: 'link-btn link-danger', onclick: () => void deleteAdapter(def, () => undefined) }, '删除'),
      ),
    );
  }
  return bar;
}

export function renderSettings(): HTMLElement {
  const det = h('details', { class: 'card collapsible', 'data-anchor': 'settings' }) as HTMLDetailsElement;
  det.append(h('summary', {}, '设置'));
  const toggle = (key: 'writebackPrompt' | 'followPage', label: string) => {
    const cb = h('input', { type: 'checkbox', checked: state.settings?.[key] !== false }) as HTMLInputElement;
    cb.addEventListener('change', async () => {
      if (!state.settings) return;
      state.settings = { ...state.settings, [key]: cb.checked };
      await saveSettings(state.settings);
    });
    return h('label', { class: 'setting-row small' }, cb, ' ', label);
  };
  det.append(toggle('writebackPrompt', '在网页上点“保存”时，询问是否把页面内容存回档案'), toggle('followPage', '侧边栏跟随网页滚动到对应区块'));
  return det;
}

export function openProfile() {
  void chrome.runtime.openOptionsPage();
}

