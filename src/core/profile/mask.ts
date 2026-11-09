// 统一脱敏。日志原则上只记字段路径、动作、结果和原因，不记值；这里用于必须展示摘要的场合。

export function maskIdNumber(v: string): string {
  if (v.length <= 5) return '*'.repeat(v.length);
  return v.slice(0, 3) + '*'.repeat(v.length - 5) + v.slice(-2);
}

export function maskMobile(v: string): string {
  if (v.length < 7) return '*'.repeat(v.length);
  return v.slice(0, 3) + '*'.repeat(v.length - 7) + v.slice(-4);
}

export function maskName(v: string): string {
  const chars = Array.from(v);
  if (chars.length <= 1) return '*';
  return chars[0] + '*'.repeat(chars.length - 1);
}

export function maskEmail(v: string): string {
  const at = v.indexOf('@');
  if (at <= 0) return '***';
  return v[0] + '***' + v.slice(at);
}

const ID_RE = /[0-9]{17}[0-9Xx]/g;
const MOBILE_RE = /1[3-9][0-9]{9}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LONG_DIGITS_RE = /[0-9]{6,}/g;

/** 自由文本脱敏（诊断报告等）：证件号、手机号、邮箱、长数字串。 */
export function scrubText(s: string): string {
  return s
    .replace(ID_RE, (m) => maskIdNumber(m))
    .replace(MOBILE_RE, (m) => maskMobile(m))
    .replace(EMAIL_RE, (m) => maskEmail(m))
    .replace(LONG_DIGITS_RE, (m) => '#'.repeat(m.length));
}

export type MaskHint = 'id' | 'mobile' | 'name' | 'email';

/** 按敏感级别给出可显示的掩码摘要。 */
export function maskBySensitivity(value: string, sensitivity: 'low' | 'medium' | 'high', hint?: MaskHint): string {
  if (sensitivity === 'low') return value;
  switch (hint) {
    case 'id':
      return maskIdNumber(value);
    case 'mobile':
      return maskMobile(value);
    case 'name':
      return maskName(value);
    case 'email':
      return maskEmail(value);
    default:
      return sensitivity === 'high' ? '•'.repeat(Math.min(6, Math.max(2, Array.from(value).length))) : value;
  }
}
