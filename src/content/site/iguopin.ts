// 国聘（c.iguopin.com 申请简历页）的 DOM 适配：.item-section 区块、antd 表单、标题栏的“添加/编辑”按钮。
import { norm } from '../../core/normalize/text';
import { iguopinRules } from '../../adapters/iguopin/rules';
import { isVisible, safeClick, text, waitFor } from '../dom';
import type { SectionHandle, SiteDom } from './types';

// ---------------- 国聘 ----------------

function findTitleButton(sectionEl: Element, words: RegExp): HTMLElement | undefined {
  const title = sectionEl.querySelector('.section-title') ?? sectionEl;
  const cands = Array.from(title.querySelectorAll<HTMLElement>('button, a, span, div')).filter((e) => {
    const t = text(e);
    return t.length <= 6 && words.test(t) && isVisible(e) && !e.querySelector('button, a');
  });
  // 取最内层
  return cands.find((c) => !cands.some((o) => o !== c && c.contains(o)));
}

function formIsEmpty(form: Element): boolean {
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type=radio]):not([type=checkbox]):not([type=hidden]):not([type=file]), textarea'));
  const anyText = inputs.some((i) => !i.disabled && !i.closest('.ant-select-selection-search') && i.value.trim() !== '');
  const anySelect = form.querySelector('.ant-select-selection-item') !== null;
  const anyRadio = form.querySelector('.ant-radio-button-wrapper-checked, .ant-radio-wrapper-checked') !== null;
  return !anyText && !anySelect && !anyRadio;
}

export const iguopinDom: SiteDom = {
  id: 'iguopin',
  findSections() {
    const out: SectionHandle[] = [];
    document.querySelectorAll('.item-section').forEach((el) => {
      const title = text(el.querySelector('.section-title h2, .title-info h2, h2'));
      const rule = iguopinRules.sections.find((s) => s.titles.some((t) => norm(t) === norm(title)));
      if (title) out.push({ key: rule?.key ?? `unknown:${title}`, title, el, rule });
    });
    return out;
  },
  containers(sections, sectionKey) {
    return sections.filter((s) => !sectionKey || s.key === sectionKey).flatMap((s) => this.openForms(s).map((el, formIndex) => ({ section: s, formIndex, el })));
  },
  sectionOf(el, sections) {
    const sec = el.closest('.item-section');
    if (!sec) return undefined;
    return (sections ?? this.findSections()).find((s) => s.el === sec);
  },
  openForms(section) {
    return Array.from(section.el.querySelectorAll('form.ant-form')).filter(isVisible);
  },
  readSavedRecords(section) {
    const content = section.el.querySelector('.item-section-content');
    if (!content) return [];
    const blocks = Array.from(content.children).filter((c) => !c.classList.contains('edit-section') && !c.querySelector('form') && isVisible(c));
    return blocks.map((b) => text(b)).filter((t) => t.length > 0);
  },
  async openForm(section) {
    const forms = this.openForms(section);
    if (forms.length > 0) return { status: forms.some((f) => !formIsEmpty(f)) ? 'unsaved-form' : 'already-open' };
    const words = section.rule?.mode === 'repeat' ? /添加|新增/ : /编辑|添加/;
    const btn = findTitleButton(section.el, words);
    if (!btn) return { status: 'no-button' };
    safeClick(btn, { allowAddEdit: true });
    try {
      await waitFor(() => this.openForms(section)[0], 5000, '表单展开');
      return { status: 'opened' };
    } catch {
      return { status: 'timeout' };
    }
  },
  info(section) {
    const forms = this.openForms(section);
    return {
      key: section.key,
      title: section.title,
      mode: section.rule?.mode ?? 'unknown',
      manualNote: section.rule?.manualNote,
      openForms: forms.length,
      openFormEmpty: forms.length > 0 && forms.every(formIsEmpty),
      recordCount: this.readSavedRecords(section).length,
      hasAdd: !!findTitleButton(section.el, /添加|新增/),
      hasEdit: !!findTitleButton(section.el, /编辑/),
    };
  },
};
