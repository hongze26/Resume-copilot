// 备份文件的打包与拆包（纯函数）。
// 备份文件 = 档案本身（顶层结构不变，旧版本和其他工具仍能读）+ 一个附加键 BACKUP_EXTRA_KEY，
// 里面放定制适配器和侧边栏设置。API 密钥等会话数据不进备份。
import { sanitizeCustomDefs, type CustomAdapterDef } from '../../adapters/custom';
import type { Profile } from '../../core/profile/types';
import { DEFAULT_SETTINGS, type Settings } from './storage';

export const BACKUP_EXTRA_KEY = 'x-backup';

export interface BackupExtras {
  customAdapters: CustomAdapterDef[];
  settings: Partial<Settings>;
}

export function packBackup(profile: Profile, customAdapters: CustomAdapterDef[], settings: Settings): Record<string, unknown> {
  return { ...profile, [BACKUP_EXTRA_KEY]: { formatVersion: 1, customAdapters, settings } };
}

/** 把导入的文件拆成“档案部分”（交给迁移与校验）和附加内容（校验后才使用）。 */
export function unpackBackup(obj: unknown): { profile: unknown; extras: BackupExtras } {
  const none: BackupExtras = { customAdapters: [], settings: {} };
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !(BACKUP_EXTRA_KEY in obj)) return { profile: obj, extras: none };
  const { [BACKUP_EXTRA_KEY]: extra, ...profile } = obj as Record<string, unknown>;
  if (!extra || typeof extra !== 'object') return { profile, extras: none };
  const e = extra as Record<string, unknown>;
  const settings: Partial<Settings> = {};
  if (e.settings && typeof e.settings === 'object') {
    for (const k of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
      const v = (e.settings as Record<string, unknown>)[k];
      if (typeof v === 'boolean') settings[k] = v;
    }
  }
  return { profile, extras: { customAdapters: sanitizeCustomDefs(e.customAdapters), settings } };
}
