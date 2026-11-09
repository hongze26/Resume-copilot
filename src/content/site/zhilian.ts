// 智联校园网申“我的简历”（xiaoyuan.zhaopin.com/scrd/resume2）的 DOM 适配。
// 依据：登录后页面编辑态的结构（2026-11-09 核对），Vue 2 + Element UI 2.x。
//
// 页面形态：右侧导航切换区块，一次只显示一个 .apply-module。
//   区块标题 h6.form-content--title（含“必填”标记）；经历类标题栏有“添加”（.icon-box）。
//   每份内容是一个 .apply-form：里面的 form 有输入控件 = 正在编辑；只有文字（.labelOnly-text / --）= 已保存的展示。
//   展示态右侧有“编辑”（.icon-box）。编辑表单底部 .btn-box 的主按钮是“保 存”（单项）或“添 加”（新记录），由本人点。
//   字段名只写在 label[for] 上（Element 的 prop），输入框本身没有 id。
import { norm } from '../../core/normalize/text';
import { zhilianRules } from '../../adapters/zhilian/rules';
import { isVisible, safeClick, text, waitFor } from '../dom';
import type { SectionHandle, SiteDom } from './types';

const CONTROL_SEL = 'input:not([type=hidden]):not([type=file]), textarea, .el-select, .el-checkbox-group, .el-upload';

function titleOf(module: Element): string {
  const h = module.querySelector('.form-content--title');
  if (!h) return '';
  const c = h.cloneNode(true) as Element;
  c.querySelectorAll('.form-content--required').forEach((x) => x.remove());
  return text(c).replace(/\s+/g, '');
}

/** 区块标题栏或记录旁的图标按钮（“添加”“编辑”）。不可用（icon-box-disabled）的不算。 */
function iconButton(scope: Element, word: RegExp, onlyOwn = false): HTMLElement | undefined {
  return Array.from(scope.querySelectorAll<HTMLElement>('.icon-box')).find(
    (b) => (!onlyOwn || b.parentElement === scope) && word.test(text(b)) && isVisible(b) && !b.classList.contains('icon-box-disabled'),
  );
}

function addButton(section: SectionHandle): HTMLElement | undefined {
  const box = section.el.querySelector('.form-content--title-box');
  return box ? iconButton(box, /添加/) : undefined;
}

/** 某份 .apply-form 是否处于编辑状态（有可操作的控件）。 */
function isEditing(applyForm: Element): boolean {
  return Array.from(applyForm.querySelectorAll(CONTROL_SEL)).some(isVisible);
}

function applyForms(section: SectionHandle): Element[] {
  // 语言能力里的“语言证书”是嵌在表单里的小表单（.apply-form 里还有 .apply-form，可添加多张证书），不是另一条记录
  return Array.from(section.el.querySelectorAll('.apply-form')).filter((a) => isVisible(a) && !a.parentElement?.closest('.apply-form'));
}

function formIsEmpty(form: Element): boolean {
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type=radio]):not([type=checkbox]):not([type=hidden]):not([type=file]), textarea'));
  // 手机号前的区号默认就是 86，不算填写过
  const anyText = inputs.some((i) => !i.disabled && !i.closest('.el-input-group__prepend') && i.value.trim() !== '');
  const anyCheck = form.querySelector('.el-checkbox.is-checked, .el-radio.is-checked') !== null;
  return !anyText && !anyCheck;
}

/** 表单底部主按钮的文字：编辑已有内容是“保 存”，新加一条是“添 加”。 */
function saveButtonLabel(form: Element): string | undefined {
  const box = form.closest('.apply-form') ?? form;
  const b = Array.from(box.querySelectorAll('.btn-box button')).find((x) => /primary/.test(String((x as HTMLElement).className)) && isVisible(x));
  return b ? norm(text(b)) : undefined;
}

export const zhilianDom: SiteDom = {
  id: 'zhilian',
  skip: '.apply-form-date-now__ipt, .el-input-group__prepend .el-select, .el-input-group__prepend input',
  fieldId(el) {
    const item = el.closest('.el-form-item');
    return item?.querySelector(':scope > label.el-form-item__label')?.getAttribute('for') || undefined;
  },
  isSaveButton(el) {
    return !!el.closest('.btn-box') && /primary/.test(String((el as HTMLElement).className)) && /^(保存|添加)$/.test(norm(text(el)));
  },
  findSections() {
    const out: SectionHandle[] = [];
    document.querySelectorAll('.apply-module').forEach((el) => {
      if (!isVisible(el)) return;
      const title = titleOf(el);
      if (!title) return;
      const rule = zhilianRules.sections.find((s) => s.titles.some((t) => norm(t) === norm(title)));
      out.push({ key: rule?.key ?? `unknown:${title}`, title, el, rule });
    });
    return out;
  },
  containers(sections, sectionKey) {
    return sections.filter((s) => !sectionKey || s.key === sectionKey).flatMap((s) => this.openForms(s).map((el, formIndex) => ({ section: s, formIndex, el })));
  },
  sectionOf(el, sections) {
    const mod = el.closest('.apply-module');
    if (!mod) return undefined;
    return (sections ?? this.findSections()).find((s) => s.el === mod);
  },
  openForms(section) {
    return applyForms(section)
      .filter(isEditing)
      .map((a) => a.querySelector('form') ?? a);
  },
  readSavedRecords(section) {
    return applyForms(section)
      .filter((a) => !isEditing(a))
      .map((a) => text(a.querySelector('form') ?? a))
      .filter((t) => t.length > 0);
  },
  async openForm(section) {
    const forms = this.openForms(section);
    if (forms.length > 0) return { status: forms.some((f) => !formIsEmpty(f)) ? 'unsaved-form' : 'already-open' };
    // 经历类：标题栏“添加”新开一条；单项：展示态旁的“编辑”
    const btn = section.rule?.mode === 'repeat' ? addButton(section) : (applyForms(section).map((a) => iconButton(a, /编辑/, true)).find(Boolean) ?? addButton(section));
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
      recordCount: section.rule?.mode === 'repeat' ? this.readSavedRecords(section).length : 0,
      hasAdd: !!addButton(section),
      hasEdit: applyForms(section).some((a) => !!iconButton(a, /编辑/, true)),
      saveLabel: forms[0] ? saveButtonLabel(forms[0]) : undefined,
    };
  },
};
