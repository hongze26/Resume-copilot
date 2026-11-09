// 侧边栏状态：当前标签页的扫描结果、计划与记录绑定；适配器选择；通用页面的规则组装。
import { adapterById, adapterFor, ADAPTERS } from '../../adapters/registry';
import { isCustomId, type CustomAdapterDef } from '../../adapters/custom';
import { composeRules } from '../../adapters/dynamic';
import { genericRules } from '../../adapters/generic/rules';
import type { AdapterRules } from '../../adapters/types';
import type { SectionInfoMsg } from '../../core/messages';
import type { ExecResult, FieldDescriptor, FillValue, PlanItem } from '../../core/plan/types';
import type { Profile } from '../../core/profile/types';
import type { Settings } from '../shared/storage';

const params = new URLSearchParams(location.search);
/** 测试与独立窗口：?tabId= 固定绑定一个标签页 */
export const fixedTabId = params.get('tabId') ? Number(params.get('tabId')) : undefined;

export interface Choice {
  checked: boolean;
  value?: FillValue;
}

export interface FormPlan {
  id: string; // sectionKey:formIndex
  sectionKey: string;
  formIndex: number;
  record?: Record<string, unknown> & { id: string };
  items: PlanItem[];
  choices: Map<string, Choice>;
  state: 'preview' | 'running' | 'done';
  results?: ExecResult[];
  autoAdded?: string[];
  runIds: string[];
  progress?: { done: number; total: number; label: string };
  stopped?: string;
}

export function initialState() { return {
  tabId: undefined as number | undefined,
  url: '',
  urlBlocked: false,
  adapter: undefined as AdapterRules | undefined,
  /** 内置适配器在本页没找到它认识的简历区块时，改用通用识别 */
  fallbackGeneric: false,
  frames: undefined as { sameOrigin: number; crossOrigin: number } | undefined,
  pageSections: [] as string[],
  profile: null as Profile | null,
  settings: undefined as Settings | undefined,
  scanned: false,
  busy: false,
  error: '',
  sections: [] as SectionInfoMsg[],
  fields: [] as FieldDescriptor[],
  plans: new Map<string, FormPlan>(),
  savedTexts: new Map<string, string[]>(),
  activeRecord: new Map<string, string>(), // sectionKey → recordId
  doneRecords: new Set<string>(),
  diagReport: '' as string,
  pageNote: '',
  pageRevision: 0,
}; }
/** 当前标签页的状态。切换标签页时整体替换（setState），其他模块通过 import 读到的是最新值。 */
export let state = initialState();
export type PanelState = ReturnType<typeof initialState>;
export function setState(s: PanelState): void {
  state = s;
}
/** 本机保存的定制适配器 */
export let customDefs: CustomAdapterDef[] = [];
export function setCustomDefs(defs: CustomAdapterDef[]): void {
  customDefs = defs;
}
/** 用户在侧边栏顶部手动选择的适配器（按标签页） */
export const adapterOverride = new Map<number, string>();

export function pickAdapter(url: string, tabId: number | undefined): AdapterRules {
  const o = tabId !== undefined ? adapterOverride.get(tabId) : undefined;
  if (o) return adapterById(o, customDefs);
  return adapterFor(url, customDefs);
}

export const isCustom = () => isCustomId(state.adapter?.id);
export const currentDef = () => customDefs.find((d) => d.id === state.adapter?.id);
export const builtinAdapter = () => ADAPTERS.find((a) => a.id === state.adapter?.id);

/**
 * 本页是否走“通用页面”流程：没有内置适配器（通用识别、定制适配器），或内置适配器在本页找不到区块。
 * 通用流程的区块来自页面扫描，规则由 composeRules 按区块临时组装；之后的计划、记录绑定、填写与内置适配器相同。
 */
export const isGenericFlow = () => !builtinAdapter() || state.fallbackGeneric;
/** 发给页面的 DOM 适配 id（content/site/index.ts 的 siteDomFor）。 */
export const domId = () => (isGenericFlow() ? 'generic' : state.adapter!.id);

/** 用页面上报的区块更新状态；通用流程同时重新组装规则（区块可能因弹窗、翻页而变化）。 */
export function applySections(list: SectionInfoMsg[]): void {
  if (isGenericFlow()) {
    const base = pickAdapter(state.url, state.tabId);
    const shell = state.fallbackGeneric ? { ...genericRules, id: base.id, name: base.name, version: base.version, verifiedAt: base.verifiedAt } : base;
    state.adapter = composeRules(shell, list, currentDef());
  }
  state.sections = list.map((sec) => {
    const rule = state.adapter!.sections.find((x) => x.key === sec.key);
    return rule ? { ...sec, mode: rule.mode, manualNote: rule.manualNote } : sec;
  });
}

/** 计划分组 id = 区块键:表单序号（区块键本身可能含冒号，如 t:基本信息）。 */
export function splitGroupId(id: string): [string, number] {
  const i = id.lastIndexOf(':');
  return [id.slice(0, i), Number(id.slice(i + 1))];
}
export const tabStates = new Map<number, PanelState>();
export const scrollPositions = new Map<number, number>();
export const working = () => state.busy || [...state.plans.values()].some((p) => p.state === 'running');

export function resetPageState(note: string) {
  state.pageRevision++;
  state.scanned = false;
  state.fallbackGeneric = false;
  state.frames = undefined;
  state.pageSections = [];
  state.plans.clear();
  state.sections = [];
  state.savedTexts.clear();
  state.activeRecord.clear();
  state.doneRecords.clear();
  state.fields = [];
  state.error = '';
  state.diagReport = '';
  state.pageNote = note;
}
