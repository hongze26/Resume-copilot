// 选项探测：探测前先确认控件仍在页面上，具体做法按组件库分派（drivers/antd.ts、drivers/element.ts）。
import type { ProbeResult } from '../core/plan/types';
import { probeControl } from './drivers';
import { registry } from './scan';

export async function probe(keys: string[]): Promise<ProbeResult[]> {
  const out: ProbeResult[] = [];
  for (const key of keys) {
    const reg = registry.get(key);
    if (!reg || !reg.el.isConnected) continue;
    out.push({ key, ...(await probeControl(reg.el, reg.kind)) });
  }
  return out;
}
