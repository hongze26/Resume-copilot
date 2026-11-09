// chrome.storage.local 读写（不使用 storage.sync）。
import type { Profile } from '../../core/profile/types';
import type { CustomAdapterDef } from '../../adapters/custom';

const PROFILE_KEY = 'profile';
const SETTINGS_KEY = 'settings';
const CUSTOM_KEY = 'customAdapters';

export interface Settings {
  allowOverwrite: boolean; // 默认 false：不覆盖已有值
  highlightOnPage: boolean;
  /** 在网页上点“保存”时询问是否把页面内容存回档案 */
  writebackPrompt: boolean;
  /** 侧边栏跟随网页滚动到对应区块 */
  followPage: boolean;
}

export const DEFAULT_SETTINGS: Settings = { allowOverwrite: false, highlightOnPage: true, writebackPrompt: true, followPage: true };

export async function loadProfile(): Promise<Profile | null> {
  const r = await chrome.storage.local.get(PROFILE_KEY);
  return (r[PROFILE_KEY] as Profile | undefined) ?? null;
}

export async function saveProfile(p: Profile): Promise<void> {
  await chrome.storage.local.set({ [PROFILE_KEY]: p });
}

export async function loadSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...((r[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {}) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}

/** 删除全部本地数据（档案、设置、会话）。 */
export async function clearAll(): Promise<void> {
  await chrome.storage.local.clear();
  await chrome.storage.session?.clear().catch(() => undefined);
}

/** 只更新档案中的一部分（读最新 → 修改 → 写回），避免覆盖档案页同时做的修改。 */
export async function updateProfile(fn: (p: Profile) => Profile): Promise<Profile> {
  const cur = await loadProfile();
  if (!cur) throw new Error('还没有已保存的档案');
  const next = fn(cur);
  await saveProfile(next);
  return next;
}

export function onProfileChanged(cb: (p: Profile | null) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && PROFILE_KEY in changes) cb((changes[PROFILE_KEY].newValue as Profile | undefined) ?? null);
  });
}

// ---------------- 定制适配器 ----------------

export async function loadCustomAdapters(): Promise<CustomAdapterDef[]> {
  const r = await chrome.storage.local.get(CUSTOM_KEY);
  const v = r[CUSTOM_KEY];
  return Array.isArray(v) ? (v as CustomAdapterDef[]) : [];
}

export async function saveCustomAdapters(defs: CustomAdapterDef[]): Promise<void> {
  await chrome.storage.local.set({ [CUSTOM_KEY]: defs });
}

export function onCustomAdaptersChanged(cb: (defs: CustomAdapterDef[]) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && CUSTOM_KEY in changes) {
      const v = changes[CUSTOM_KEY].newValue;
      cb(Array.isArray(v) ? (v as CustomAdapterDef[]) : []);
    }
  });
}
