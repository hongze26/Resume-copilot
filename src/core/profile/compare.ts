// 与键顺序无关的比较。chrome.storage 读回的对象键会按字母排序，不能直接比 JSON.stringify。

export function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.keys(val as Record<string, unknown>).sort().map((k) => [k, (val as Record<string, unknown>)[k]]));
    }
    return val;
  });
}

export function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
