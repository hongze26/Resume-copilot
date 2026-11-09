import { CURRENT_SCHEMA_VERSION, type Profile } from './types';

/**
 * 档案版本迁移。每个迁移函数把版本 n 的档案转换成 n+1。
 * 目前只有 v1；v0 是测试用的“伪旧版本”，用来验证迁移框架本身。
 */
type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {
  // v0 → v1：v0 没有 schemaVersion/meta，教育经历字段叫 schoolName。
  0: (p) => {
    const now = new Date().toISOString();
    const out: Record<string, unknown> = { ...p, schemaVersion: 1 };
    out.meta = { createdAt: now, updatedAt: now, reviewedAt: null, source: 'json-import' };
    const edu = Array.isArray(p.education) ? (p.education as Record<string, unknown>[]) : [];
    out.education = edu.map((e) => {
      const { schoolName, ...rest } = e;
      return schoolName !== undefined && rest.school === undefined ? { ...rest, school: schoolName } : rest;
    });
    if (!out.contact) out.contact = {};
    return out;
  },
};

export class MigrationError extends Error {}

export function detectVersion(input: unknown): number {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MigrationError('文件内容不是 JSON 对象');
  const v = (input as Record<string, unknown>).schemaVersion;
  if (v === undefined) return 0;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new MigrationError('schemaVersion 不是有效版本号');
  return v;
}

/** 把任意已知版本迁移到当前版本。迁移后仍需 validateProfile。 */
export function migrateToCurrent(input: unknown): { profile: Profile; from: number; steps: number } {
  let version = detectVersion(input);
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new MigrationError(`档案版本 ${version} 比本工具支持的版本 ${CURRENT_SCHEMA_VERSION} 新，请先升级扩展`);
  }
  const from = version;
  let cur = structuredClone(input) as Record<string, unknown>;
  while (version < CURRENT_SCHEMA_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) throw new MigrationError(`缺少从版本 ${version} 升级的迁移`);
    cur = m(cur);
    version += 1;
  }
  return { profile: cur as unknown as Profile, from, steps: CURRENT_SCHEMA_VERSION - from };
}
