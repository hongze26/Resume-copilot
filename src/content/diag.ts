// 只读诊断：生成不含任何填写值的结构报告，用来修正适配器中【待验证】的项。
// 报告只含：字段标签、控件类型、选项文字、日期面板结构、记录列表结构（标签名/类名/子节点数，不含文字）。
import { scrubText } from '../core/profile/mask';
import { isVisible, text } from './dom';
import { probe } from './probe';
import { scan } from './scan';
import type { SiteDom } from './site';

function structureOf(el: Element, depth = 0): unknown {
  if (depth > 3) return '…';
  return {
    tag: el.tagName.toLowerCase(),
    cls: Array.from(el.classList)
      .filter((c) => !/\d{4,}/.test(c))
      .slice(0, 6)
      .join(' '),
    children: Array.from(el.children)
      .slice(0, 6)
      .map((c) => structureOf(c, depth + 1)),
    childCount: el.children.length,
  };
}

function cellTitlePattern(): string | undefined {
  const cell = document.querySelector('.ant-picker-dropdown td.ant-picker-cell[title]');
  return cell?.getAttribute('title')?.replace(/\d/g, 'D');
}

export async function diagnose(site: SiteDom, adapterId: string, version: string): Promise<unknown> {
  const fields = scan(site);
  // 只探测非远程的下拉和日期控件
  const keys = fields
    .filter((f) => (f.kind === 'select' || f.kind === 'date' || f.kind === 'date-range') && !f.disabled)
    .filter((f) => !/school|major/.test(f.id ?? ''))
    .map((f) => f.key);
  const probes = await probe(keys);
  const pmap = new Map(probes.map((p) => [p.key, p]));
  const sections = site.findSections().map((s) => {
    const info = site.info(s);
    const content = s.el.querySelector('.item-section-content');
    const recordBlocks = content
      ? Array.from(content.children)
          .filter((c) => !c.querySelector('form') && isVisible(c))
          .map((c) => structureOf(c))
      : [];
    const titleButtons = Array.from((s.el.querySelector('.section-title') ?? s.el).querySelectorAll('button, a, span'))
      .map((b) => text(b))
      .filter((t) => t.length > 0 && t.length <= 6);
    return { title: s.title, key: s.key, mode: info.mode, openForms: info.openForms, recordCount: info.recordCount, titleButtons: [...new Set(titleButtons)], recordStructure: recordBlocks };
  });
  const report = {
    tool: 'resume-copilot 扫描诊断（不含任何填写值）',
    version,
    adapter: adapterId,
    generatedAt: new Date().toISOString(),
    page: location.origin + location.pathname,
    iframes: document.querySelectorAll('iframe').length,
    antd: !!document.querySelector('[class*="ant-form"], [class*="ant-select"]'),
    datePanelCellTitlePattern: cellTitlePattern(),
    sections,
    fields: fields.map((f) => {
      const p = pmap.get(f.key);
      return {
        section: f.section,
        label: f.label,
        id: f.id,
        kind: f.kind,
        required: f.required,
        disabled: f.disabled,
        readonly: f.readonly,
        empty: f.isEmpty,
        placeholder: f.placeholder,
        options: (p?.options ?? f.options)?.slice(0, 80),
        optionsPartial: p?.optionsPartial ?? f.optionsPartial,
        datePrecision: p?.datePrecision,
        hasPresentOption: p?.hasPresentOption,
      };
    }),
  };
  // 兜底脱敏：万一标签或选项里出现长数字、手机号、邮箱
  return JSON.parse(scrubText(JSON.stringify(report)));
}
