import type { Profile } from './types';

export function emptyProfile(now = new Date()): Profile {
  const t = now.toISOString();
  return {
    schemaVersion: 1,
    meta: { createdAt: t, updatedAt: t, reviewedAt: null, source: 'manual' },
    basic: { name: '' },
    contact: {},
    education: [],
    work: [],
    projects: [],
    studentLeadership: [],
    socialPractice: [],
    languages: [],
    computerSkills: [],
    certificates: [],
    skills: [],
    honors: [],
    family: [],
    intention: {},
    declarations: {},
    textTemplates: [],
    custom: [],
  };
}

/** 生成符合 Schema recordId 规则（^[a-z0-9-]{4,40}$）的记录 ID。 */
export function newRecordId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `${prefix}-${Date.now().toString(36)}-${rand}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
}
