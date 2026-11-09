// 文本规整：只用于判断“是否相等”，不做模糊相似度。

/** 全角转半角（含全角空格）。 */
export function toHalfWidth(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
}

/**
 * 规整：全角转半角、统一括号、去空白、去常见标点差异、英文小写。
 * “本科（普通教育） / 法学” → “本科(普通教育)/法学”
 */
export function norm(s: string | undefined | null): string {
  if (!s) return '';
  return toHalfWidth(String(s))
    .replace(/[【〔［]/g, '(')
    .replace(/[】〕］]/g, ')')
    .replace(/[“”"'‘’]/g, '')
    .replace(/[\s ]+/g, '')
    .replace(/[：:]$/, '')
    .replace(/^\*+/, '')
    .toLowerCase();
}

/** 去掉标签里的必填星号、冒号、括号说明，得到“核心标签”。 */
export function coreLabel(label: string): string {
  const n = norm(label);
  // 去掉括号说明，例如“学校名称(此处仅填写完整学校名称...)”
  const withoutParen = n.replace(/\([^)]*\)/g, '');
  return withoutParen || n;
}

export function eqNorm(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

export function includesNorm(haystack: string, needle: string): boolean {
  const n = norm(needle);
  return n.length > 0 && norm(haystack).includes(n);
}
