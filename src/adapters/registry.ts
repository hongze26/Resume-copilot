import { genericRules } from './generic/rules';
import { iguopinRules } from './iguopin/rules';
import { zhilianRules } from './zhilian/rules';
import type { AdapterRules } from './types';
import { customToRules, type CustomAdapterDef } from './custom';

/** 按顺序匹配；通用适配器兜底。新增站点时在这里登记。 */
export const ADAPTERS: AdapterRules[] = [iguopinRules, zhilianRules];

/** 内置适配器优先，其次本机保存的定制适配器，最后通用规则。 */
export function adapterFor(url: string, customs: CustomAdapterDef[] = []): AdapterRules {
  const builtin = ADAPTERS.find((a) => a.matches(url));
  if (builtin) return builtin;
  const c = customs.find((d) => customToRules(d).matches(url));
  return c ? customToRules(c) : genericRules;
}

export function adapterById(id: string, customs: CustomAdapterDef[] = []): AdapterRules {
  const c = customs.find((d) => d.id === id);
  if (c) return customToRules(c);
  return ADAPTERS.find((a) => a.id === id) ?? genericRules;
}
