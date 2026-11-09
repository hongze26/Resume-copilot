// 档案记录：重复区块（教育、工作…）的记录排序、标题、是否已在页面上、当前绑定哪一条。
import { certAliases, matchCertLeaves } from '../../core/normalize/cert';
import { norm } from '../../core/normalize/text';
import type { RecordCollection } from '../../core/profile/types';
import { CERT_STATUS_ZH, EDU_ZH, LANG_ZH } from './labels';
import { state } from './state';

// ---------------- 档案记录 ----------------

export function sectionCollection(key: string): RecordCollection | undefined {
  const c = state.adapter?.sections.find((s) => s.key === key)?.collection;
  return c && c !== 'single' ? c : undefined;
}

export function orderedRecords(col: RecordCollection): Array<Record<string, unknown> & { id: string }> {
  const arr = ((state.profile as unknown as Record<string, unknown[]>)?.[col] ?? []) as Array<Record<string, unknown> & { id: string }>;
  return state.adapter?.orderRecords ? state.adapter.orderRecords(col, arr) : arr;
}

export function recordTitle(col: RecordCollection, r: Record<string, unknown>): string {
  switch (col) {
    case 'education':
      return `${EDU_ZH[String(r.level)] ?? r.level} · ${r.school ?? ''}`;
    case 'work':
      return `${r.company ?? ''} · ${r.title ?? ''}`;
    case 'languages':
      return `${LANG_ZH[String(r.certificate)] ?? r.certificate ?? ''}${r.score ? ` · ${r.score}` : ''}`;
    case 'certificates':
      return `${r.name ?? ''}${CERT_STATUS_ZH[String(r.status)] ? `（${CERT_STATUS_ZH[String(r.status)]}，默认不填）` : ''}`;
    default:
      return String(r.name ?? r.id);
  }
}

export function recordOnPage(sectionKey: string, col: RecordCollection, r: Record<string, unknown>): boolean {
  const texts = state.savedTexts.get(sectionKey) ?? [];
  const keys = state.adapter?.recordKeys?.(col, r) ?? [];
  if (keys.length === 0) return false;
  if (col === 'certificates') {
    // 网站上的证书名可能是别名（“初级会计职称”），按证书别名比对
    return texts.some((t) => matchCertLeaves([{ category: '', name: t }], certAliases(keys[0])).exact.length > 0 || norm(t).includes(norm(keys[0])));
  }
  return texts.some((t) => keys.every((k) => norm(t).includes(norm(k))));
}

export function recordStatus(sectionKey: string, col: RecordCollection, r: Record<string, unknown> & { id: string }): 'done' | 'on-page' | 'pending' {
  if (state.doneRecords.has(r.id)) return 'done';
  if (recordOnPage(sectionKey, col, r)) return 'on-page';
  return 'pending';
}

export function boundRecord(sectionKey: string): (Record<string, unknown> & { id: string }) | undefined {
  const col = sectionCollection(sectionKey);
  if (!col) return undefined;
  const recs = orderedRecords(col);
  const active = state.activeRecord.get(sectionKey);
  if (active) {
    const r = recs.find((x) => x.id === active);
    // 已保存（本次或页面上已存在）的记录不再绑定
    if (r && recordStatus(sectionKey, col, r) === 'pending') return r;
    state.activeRecord.delete(sectionKey);
  }
  return recs.find((r) => recordStatus(sectionKey, col, r) === 'pending');
}

