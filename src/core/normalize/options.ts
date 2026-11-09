import { norm } from './text';

export type OptionMatch =
  | { status: 'exact'; option: string; via: string }
  | { status: 'multiple'; candidates: string[]; why: string }
  | { status: 'contains'; candidates: string[]; why: string }
  | { status: 'none' }
  | { status: 'unknown' }; // 页面选项未知（未展开或虚拟列表只显示了一部分）

/**
 * 把档案值的别名集合与页面选项逐一比对（7.1 节）：
 * - 恰好一个“完全相等/别名相等” → exact
 * - 多个完全相等 → multiple
 * - 只有包含关系 → contains（中置信，列候选）
 * - 没有候选 → none（或在选项不完整时 unknown）
 *
 * excludeAliases：其他规范键的别名。若某选项与其他键完全相等，就不能作为包含关系候选
 * （例如档案是“硕士”，选项“博士研究生”包含“研究生”，但它明确属于博士）。
 */
export function matchOptions(
  aliases: string[],
  options: string[] | undefined,
  opts: { partial?: boolean; excludeAliases?: string[]; allowContains?: boolean } = {},
): OptionMatch {
  if (!options || options.length === 0) return { status: 'unknown' };
  const aliasN = aliases.map(norm).filter(Boolean);
  const exclude = new Set((opts.excludeAliases ?? []).map(norm));
  const exact: string[] = [];
  for (const o of options) {
    if (aliasN.includes(norm(o))) exact.push(o);
  }
  const uniqExact = [...new Set(exact)];
  if (uniqExact.length === 1) return { status: 'exact', option: uniqExact[0], via: aliases.find((a) => norm(a) === norm(uniqExact[0])) ?? uniqExact[0] };
  if (uniqExact.length > 1) return { status: 'multiple', candidates: uniqExact, why: '网页上有好几个选项都和档案里的值一样' };
  if (opts.allowContains !== false) {
    const contains = options.filter((o) => {
      const on = norm(o);
      if (!on || exclude.has(on)) return false;
      return aliasN.some((a) => a.length >= 2 && on.length >= 2 && (on.includes(a) || a.includes(on)));
    });
    const uniq = [...new Set(contains)];
    if (uniq.length > 0) return { status: 'contains', candidates: uniq, why: '网页选项和档案里的值不完全一样，选了最接近的' };
  }
  return opts.partial ? { status: 'unknown' } : { status: 'none' };
}

/** 选项路径后缀匹配（专业分类“本科（普通教育）/ 管理学 / 工商管理类”）。 */
export function matchPathSuffix(segments: string[], options: string[] | undefined): OptionMatch {
  if (!options || options.length === 0) return { status: 'unknown' };
  const suffix = segments.map(norm).join('/');
  const hits = options.filter((o) => {
    const on = norm(o).split('/').filter(Boolean).join('/');
    return on === suffix || on.endsWith('/' + suffix);
  });
  if (hits.length === 1) return { status: 'exact', option: hits[0], via: segments.join('/') };
  if (hits.length > 1) return { status: 'multiple', candidates: hits, why: '网页上有好几个分类都能对上这个专业' };
  return { status: 'none' };
}
