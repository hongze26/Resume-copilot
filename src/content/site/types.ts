// 站点 DOM 适配的接口：区块识别、表单定位、已保存记录读取、展开新表单。
// 规则部分（字段字典等）在 src/adapters/*/rules.ts，这里只描述 DOM 操作。
import type { SectionRule } from '../../adapters/types';

export interface SectionHandle {
  key: string;
  title: string;
  el: Element;
  rule?: SectionRule;
}

export interface SectionInfo {
  key: string;
  title: string;
  mode: SectionRule['mode'] | 'unknown';
  manualNote?: string;
  openForms: number;
  openFormEmpty: boolean;
  recordCount: number;
  hasAdd: boolean;
  hasEdit: boolean;
  /** 网页上保存这份表单的按钮叫什么（智联新记录叫“添加”），侧边栏提示本人点它。 */
  saveLabel?: string;
}

/** 一份要扫描的表单区域：属于哪个区块、区块内第几份、容器元素。 */
export interface FormContainer {
  section?: SectionHandle;
  formIndex: number;
  el: Element;
}

export interface SiteDom {
  id: string;
  findSections(): SectionHandle[];
  /** 本次要扫描的表单区域。sectionKey 只扫描该区块。 */
  containers(sections: SectionHandle[], sectionKey?: string): FormContainer[];
  /** 元素所在区块。sections 为本次扫描已算好的区块列表（避免重复计算）。 */
  sectionOf(el: Element, sections?: SectionHandle[]): SectionHandle | undefined;
  /** 区块内当前展开的表单容器 */
  openForms(section: SectionHandle): Element[];
  /** 已保存记录的摘要文字（只在侧边栏内存中比对，不写日志）。结构【待验证】 */
  readSavedRecords(section: SectionHandle): string[];
  /** 点“添加/编辑”展开一份表单 */
  openForm(section: SectionHandle): Promise<{ status: 'opened' | 'already-open' | 'unsaved-form' | 'no-button' | 'timeout' }>;
  info(section: SectionHandle): SectionInfo;
  /** 扫描时跳过的控件（选择器）：例如网站叠在日期框上的显示用输入框、手机号前的区号。 */
  skip?: string;
  /** 控件的稳定字段名。输入框本身没有 id 时（Element 的 prop 只写在 label[for] 上）由站点提供。 */
  fieldId?(el: Element): string | undefined;
  /** 页面上“保存这份表单”的按钮（用于存回档案询问）。默认按文字“保存/确定/完成”判断。 */
  isSaveButton?(el: Element): boolean;
}
