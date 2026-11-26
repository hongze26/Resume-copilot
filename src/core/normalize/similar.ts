// 字面相似度：只在“完全相等”和“包含关系”都对不上时用，结果一律需要本人确认。
import { norm } from './text';

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i + 1 < s.length; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** 规整后按相邻两字的重合程度打分（Dice 系数），0–1。不足两个字时只有完全相等才算。 */
export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const A = bigrams(x);
  const B = bigrams(y);
  let common = 0;
  for (const [g, n] of A) common += Math.min(n, B.get(g) ?? 0);
  return (2 * common) / (x.length - 1 + (y.length - 1));
}

function scored(targets: string[], options: string[]): Array<{ option: string; score: number }> {
  return [...new Set(options)]
    .map((option) => ({ option, score: Math.max(0, ...targets.map((t) => similarity(t, option))) }))
    .sort((p, q) => q.score - p.score);
}

/** 最接近的一个选项：分数最高、达到 min，且没有并列。否则返回 undefined。 */
export function closest(targets: string[], options: string[], min = 0.6): { option: string; score: number } | undefined {
  const [first, second] = scored(targets, options);
  if (!first || first.score < min) return undefined;
  if (second && first.score - second.score < 1e-9) return undefined;
  return first;
}

/** 按相似度从高到低排列的选项（给用户挑选时把像的排在前面）。 */
export function ranked(targets: string[], options: string[]): string[] {
  return scored(targets, options).map((s) => s.option);
}
