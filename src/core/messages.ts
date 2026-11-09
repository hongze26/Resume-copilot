// 扩展内部消息。所有消息带 type 与 version，接收方做结构校验，不符合的直接丢弃。
import type { ExecItem, ExecResult, FieldDescriptor, ProbeResult } from './plan/types';

export const MSG_VERSION = 1;

export interface SectionInfoMsg {
  key: string;
  title: string;
  mode: 'single' | 'repeat' | 'manual' | 'unknown';
  manualNote?: string;
  openForms: number;
  openFormEmpty: boolean;
  recordCount: number;
  hasAdd: boolean;
  hasEdit: boolean;
  /** 网页上保存这份表单的按钮叫什么（智联新记录叫“添加”）。 */
  saveLabel?: string;
}

export type Request =
  | { type: 'rc/ping'; version: 1 }
  | { type: 'rc/scan'; version: 1; adapterId: string; sectionKey?: string }
  | { type: 'rc/probe'; version: 1; keys: string[] }
  | { type: 'rc/exec'; version: 1; runId: string; items: ExecItem[] }
  | { type: 'rc/undo'; version: 1; runId?: string }
  | { type: 'rc/sections'; version: 1; adapterId: string }
  | { type: 'rc/saved-records'; version: 1; adapterId: string; sectionKey: string }
  | { type: 'rc/open-form'; version: 1; adapterId: string; sectionKey: string }
  | { type: 'rc/highlight'; version: 1; marks: Array<{ key: string; state: 'high' | 'medium' | 'low' | 'skip' | 'none'; note?: string }> }
  | { type: 'rc/clear-highlight'; version: 1 }
  | { type: 'rc/diagnose'; version: 1; adapterId: string }
  | { type: 'rc/scroll-to'; version: 1; adapterId: string; sectionKey: string }
  | { type: 'rc/read-form'; version: 1; adapterId: string; sectionKey: string; keys: string[] };

export type Response =
  | { ok: true; type: 'rc/ping'; version: number }
  | {
      ok: true;
      type: 'rc/scan';
      fields: FieldDescriptor[];
      sections: SectionInfoMsg[];
      url: string;
      /** 页面内嵌框架：同源（已一并扫描）/ 跨域（无法读取） */
      frames?: { sameOrigin: number; crossOrigin: number };
      /** 通用识别：页面上像简历区块的标题（教育经历、工作经历…） */
      pageSections?: string[];
    }
  | { ok: true; type: 'rc/probe'; probes: ProbeResult[] }
  | { ok: true; type: 'rc/exec'; results: ExecResult[] }
  | { ok: true; type: 'rc/undo'; results: ExecResult[] }
  | { ok: true; type: 'rc/sections'; sections: SectionInfoMsg[] }
  | { ok: true; type: 'rc/saved-records'; texts: string[] }
  | { ok: true; type: 'rc/open-form'; status: 'opened' | 'already-open' | 'unsaved-form' | 'no-button' | 'timeout' }
  | { ok: true; type: 'rc/highlight' }
  | { ok: true; type: 'rc/diagnose'; report: unknown }
  | { ok: true; type: 'rc/scroll-to' }
  | { ok: true; type: 'rc/read-form'; values: FieldValueMsg[] }
  | { ok: false; error: string };

/** 页面上某个控件当前显示的内容（只在用户点“保存”时读取，用于存回档案；只发给本扩展的侧边栏）。 */
export interface FieldValueMsg {
  key: string;
  label: string;
  id?: string;
  kind: string;
  formIndex: number;
  text: string; // 页面显示的文字（下拉为选中项、级联为“省 / 市”、日期为输入框文字）
  section?: string;
  sectionKey?: string;
  placeholder?: string;
  options?: string[];
  disabled?: boolean;
}

export type PageEvent =
  | { type: 'rc/event'; version: 1; kind: 'sections-changed'; sections: SectionInfoMsg[] }
  | { type: 'rc/event'; version: 1; kind: 'section-in-view'; key: string }
  | { type: 'rc/event'; version: 1; kind: 'form-saving'; sectionKey: string; formIndex: number; values: FieldValueMsg[] }
  | { type: 'rc/event'; version: 1; kind: 'progress'; runId: string; done: number; total: number; label: string };

const REQUEST_TYPES = new Set([
  'rc/ping',
  'rc/scan',
  'rc/probe',
  'rc/exec',
  'rc/undo',
  'rc/sections',
  'rc/saved-records',
  'rc/open-form',
  'rc/highlight',
  'rc/clear-highlight',
  'rc/diagnose',
  'rc/scroll-to',
  'rc/read-form',
]);

const isStr = (v: unknown): v is string => typeof v === 'string';
const isArr = Array.isArray;

/** 运行时结构校验。 */
export function isRequest(m: unknown): m is Request {
  if (!m || typeof m !== 'object') return false;
  const r = m as Record<string, unknown>;
  if (!isStr(r.type) || !REQUEST_TYPES.has(r.type) || r.version !== MSG_VERSION) return false;
  switch (r.type) {
    case 'rc/scan':
    case 'rc/sections':
    case 'rc/diagnose':
      return isStr(r.adapterId);
    case 'rc/saved-records':
    case 'rc/open-form':
    case 'rc/scroll-to':
      return isStr(r.adapterId) && isStr(r.sectionKey);
    case 'rc/read-form':
      return isStr(r.adapterId) && isStr(r.sectionKey) && isArr(r.keys) && r.keys.every(isStr);
    case 'rc/probe':
      return isArr(r.keys) && r.keys.every(isStr);
    case 'rc/exec':
      return isStr(r.runId) && isArr(r.items) && r.items.every((i) => i && typeof i === 'object' && isStr((i as ExecItem).fieldKey) && typeof (i as ExecItem).value === 'object');
    case 'rc/highlight':
      return isArr(r.marks);
    default:
      return true;
  }
}

export function isPageEvent(m: unknown): m is PageEvent {
  if (!m || typeof m !== 'object') return false;
  const r = m as Record<string, unknown>;
  return r.type === 'rc/event' && r.version === MSG_VERSION && ['sections-changed', 'progress', 'section-in-view', 'form-saving'].includes(String(r.kind));
}
