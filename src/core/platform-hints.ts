// 平台提示里可以保存、可以随消息传递的那部分：全是 CSS 选择器字符串。
// 定制适配器可以带一份；内置平台（content/platform/*.ts）在此之上还有判断函数。
export interface SerialHints {
  /** 区块容器 */
  section?: string;
  /** 区块标题（在区块容器内查找） */
  sectionTitle?: string;
  /** 一条记录的容器：多条经历排在同一页时，每条一个 */
  group?: string;
  /** 表单项容器 */
  item?: string;
  /** 字段名（在表单项内查找，可用 :scope） */
  title?: string;
  /** 下拉弹层 */
  popup?: string;
  /** 弹层里的选项 */
  option?: string;
}

export const HINT_KEYS = ['section', 'sectionTitle', 'group', 'item', 'title', 'popup', 'option'] as const;

export const HINT_LABEL: Record<(typeof HINT_KEYS)[number], string> = {
  section: '区块容器',
  sectionTitle: '区块标题（在区块内）',
  group: '一条记录的容器',
  item: '表单项容器',
  title: '字段名（在表单项内）',
  popup: '下拉弹层',
  option: '弹层里的选项',
};

/** 只保留已知的键和像选择器的字符串（1–200 字，不含 < 和花括号；> 是子元素写法，允许）；一个都没有时返回 undefined。 */
export function sanitizeHints(v: unknown): SerialHints | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: SerialHints = {};
  for (const k of HINT_KEYS) {
    const s = (v as Record<string, unknown>)[k];
    if (typeof s !== 'string') continue;
    const t = s.trim();
    if (t.length < 1 || t.length > 200 || /[<{}]/.test(t)) continue;
    out[k] = t;
  }
  return Object.keys(out).length ? out : undefined;
}
