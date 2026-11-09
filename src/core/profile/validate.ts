import validateGenerated from './validate.generated.cjs';
import type { Profile } from './types';

export interface ValidationIssue {
  path: string;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const KEYWORD_ZH: Record<string, string> = {
  required: '缺少必填项',
  type: '类型不正确',
  enum: '取值不在允许范围内',
  const: '取值不正确',
  pattern: '格式不正确',
  additionalProperties: '包含未定义的字段',
  minimum: '数值过小',
  maxLength: '内容过长',
  multipleOf: '数值步长不正确',
  oneOf: '取值格式不正确',
};

function describe(e: { instancePath: string; keyword: string; params: Record<string, unknown>; message?: string }): ValidationIssue {
  let path = e.instancePath || '/';
  let message = KEYWORD_ZH[e.keyword] ?? e.message ?? e.keyword;
  if (e.keyword === 'required' && typeof e.params.missingProperty === 'string') {
    path = `${e.instancePath}/${e.params.missingProperty}`;
  }
  if (e.keyword === 'additionalProperties' && typeof e.params.additionalProperty === 'string') {
    message = `包含未定义的字段“${e.params.additionalProperty}”`;
  }
  return { path, message };
}

/** 校验档案。返回问题列表；空数组表示通过。 */
export function validateProfile(data: unknown): ValidationIssue[] {
  const ok = validateGenerated(data);
  const issues: ValidationIssue[] = [];
  if (!ok) {
    const seen = new Set<string>();
    for (const e of validateGenerated.errors ?? []) {
      const d = describe(e);
      const k = d.path + '|' + d.message;
      if (!seen.has(k)) {
        seen.add(k);
        issues.push(d);
      }
    }
    return issues;
  }
  const p = data as Profile;
  if (p.contact?.email && !EMAIL_RE.test(p.contact.email)) issues.push({ path: '/contact/email', message: '邮箱格式不正确' });
  for (const k of ['createdAt', 'updatedAt', 'reviewedAt'] as const) {
    const v = p.meta?.[k];
    if (typeof v === 'string' && !DATETIME_RE.test(v)) issues.push({ path: `/meta/${k}`, message: '时间格式不正确' });
  }
  const ids = new Set<string>();
  const collections = ['education', 'work', 'projects', 'studentLeadership', 'socialPractice', 'languages', 'computerSkills', 'certificates', 'skills', 'honors', 'family', 'textTemplates', 'custom'] as const;
  for (const c of collections) {
    const arr = (p as unknown as Record<string, Array<{ id: string }> | undefined>)[c];
    arr?.forEach((r, i) => {
      if (ids.has(r.id)) issues.push({ path: `/${c}/${i}/id`, message: `记录 ID“${r.id}”重复` });
      ids.add(r.id);
    });
  }
  return issues;
}

export function isValidProfile(data: unknown): data is Profile {
  return validateProfile(data).length === 0;
}
