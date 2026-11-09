// 日期解析与格式化。档案保留原始精度，不为凑精度补“01”日。

export interface DateParts {
  y: number;
  m?: number;
  d?: number;
}

export type DateValue = DateParts | 'present';
export type Precision = 'year' | 'month' | 'day';

const PRESENT_WORDS = ['至今', '今', '现在', 'present', 'now', '至今在职', '在读'];

export function precisionOf(d: DateParts): Precision {
  return d.d !== undefined ? 'day' : d.m !== undefined ? 'month' : 'year';
}

function valid(y: number, m?: number, d?: number): boolean {
  if (!(y >= 1900 && y <= 2100)) return false;
  if (m !== undefined && !(m >= 1 && m <= 12)) return false;
  if (d !== undefined) {
    if (m === undefined) return false;
    const days = new Date(y, m, 0).getDate();
    if (!(d >= 1 && d <= days)) return false;
  }
  return true;
}

/**
 * 接受：2024、2024-09、2024-9、2024年9月、2024年09月15日、2024/09/01、2024.9、2024.09.15、至今/present。
 * 2099-12-31 视为“至今”（国聘内部表示）。
 */
export function parseDate(input: string | undefined | null): DateValue | null {
  if (input === undefined || input === null) return null;
  const s = String(input).trim();
  if (!s) return null;
  if (PRESENT_WORDS.includes(s.toLowerCase())) return 'present';
  const m = s.match(/^(\d{4})(?:\s*[-/.年]\s*(\d{1,2})(?:\s*[-/.月]\s*(\d{1,2})\s*日?)?\s*月?)?\s*年?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = m[2] !== undefined ? Number(m[2]) : undefined;
  const d = m[3] !== undefined ? Number(m[3]) : undefined;
  if (!valid(y, mo, d)) return null;
  if (y === 2099 && mo === 12 && (d === undefined || d === 31)) return 'present';
  const out: DateParts = { y };
  if (mo !== undefined) out.m = mo;
  if (d !== undefined) out.d = d;
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 规范格式：YYYY / YYYY-MM / YYYY-MM-DD。 */
export function formatDate(d: DateValue): string {
  if (d === 'present') return 'present';
  let s = String(d.y);
  if (d.m !== undefined) s += '-' + pad(d.m);
  if (d.d !== undefined) s += '-' + pad(d.d);
  return s;
}

/** 中文显示。 */
export function displayDate(d: DateValue): string {
  if (d === 'present') return '至今';
  let s = `${d.y}年`;
  if (d.m !== undefined) s += `${d.m}月`;
  if (d.d !== undefined) s += `${d.d}日`;
  return s;
}

/** 比较两个日期在共同精度上是否相等。 */
export function sameDate(a: DateValue, b: DateValue): boolean {
  if (a === 'present' || b === 'present') return a === b;
  if (a.y !== b.y) return false;
  if (a.m !== undefined && b.m !== undefined && a.m !== b.m) return false;
  if (a.d !== undefined && b.d !== undefined && a.d !== b.d) return false;
  return true;
}

/** 从页面显示文字里提取日期（如输入框显示“2024-09”或“2024年09月”）。 */
export function extractDate(text: string): DateValue | null {
  const t = text.trim();
  if (!t) return null;
  const direct = parseDate(t);
  if (direct) return direct;
  const m = t.match(/(\d{4})\D{1,2}(\d{1,2})(?:\D{1,2}(\d{1,2}))?/);
  if (m) return parseDate(m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`);
  const y = t.match(/(\d{4})/);
  return y ? parseDate(y[1]) : null;
}

/**
 * 判断档案精度与页面粒度是否匹配。
 * - 一致 → ok
 * - 档案更精细（档案到日，页面到月）→ ok（截断是确定的）
 * - 档案更粗（档案到月，页面要求到日）→ needs-detail（按 1 日补齐、默认勾选，侧边栏可改日）
 */
export function precisionFit(profile: DateParts, page: Precision | undefined): 'ok' | 'needs-detail' | 'unknown' {
  if (!page) return 'unknown';
  const order: Precision[] = ['year', 'month', 'day'];
  const pp = order.indexOf(precisionOf(profile));
  const pg = order.indexOf(page);
  return pp >= pg ? 'ok' : 'needs-detail';
}

/** 补齐到日：只到月按 1 日，只到年按 1 月 1 日（页面要求精确到日、档案没记日时用；侧边栏提示核对）。 */
export function padToDay(d: DateParts): DateParts {
  return { y: d.y, m: d.m ?? 1, d: d.d ?? 1 };
}

export function truncate(d: DateParts, to: Precision): DateParts {
  if (to === 'year') return { y: d.y };
  if (to === 'month') return d.m !== undefined ? { y: d.y, m: d.m } : { y: d.y };
  return d;
}
