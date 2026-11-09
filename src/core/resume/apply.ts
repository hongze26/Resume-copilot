// 把本人勾选的解析结果写入档案草稿。默认不覆盖已有值；重复的经历不重复添加。
import { newRecordId } from '../profile/empty';
import type { Profile } from '../profile/types';
import type { ParsedCollection, ParsedField, ParsedRecord } from './parse';

type Obj = Record<string, unknown>;

const ID_PREFIX: Record<ParsedCollection, string> = {
  education: 'edu',
  work: 'work',
  projects: 'proj',
  studentLeadership: 'lead',
  socialPractice: 'prac',
  languages: 'lang',
  computerSkills: 'comp',
  certificates: 'cert',
  skills: 'skill',
  honors: 'honor',
  textTemplates: 'tpl',
  family: 'fam',
};

export const COLLECTION_ZH: Record<ParsedCollection, string> = {
  education: '教育经历',
  work: '工作/实习经历',
  projects: '项目经历',
  studentLeadership: '学生干部经历',
  socialPractice: '社会实践',
  languages: '语言能力',
  computerSkills: '计算机能力',
  certificates: '证书与职业资格',
  skills: '技能',
  honors: '荣誉奖励',
  textTemplates: '长文本模板',
  family: '家庭成员',
};

export function getIn(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const k of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Obj)[k];
  }
  return cur;
}

function setPath(obj: Obj, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]] as Obj;
  }
  cur[keys[keys.length - 1]] = value;
}

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as Obj).length === 0;
  return false;
}

const n = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toLowerCase();

/** 判断档案中是否已有“同一条”记录。 */
export function sameRecord(col: ParsedCollection, a: Obj, b: Obj): boolean {
  switch (col) {
    case 'education':
      return n(a.school) !== '' && n(a.school) === n(b.school) && n(a.start) === n(b.start);
    case 'work':
      return n(a.company) !== '' && n(a.company) === n(b.company) && n(a.start) === n(b.start);
    case 'projects':
      return n(a.name) !== '' && n(a.name) === n(b.name) && (!a.start || !b.start || n(a.start) === n(b.start));
    case 'honors':
    case 'computerSkills':
    case 'skills':
      return n(a.name) !== '' && n(a.name) === n(b.name);
    case 'certificates':
      return n(a.name) !== '' && n(a.name) === n(b.name);
    case 'studentLeadership':
    case 'socialPractice':
      return n(a.organization) === n(b.organization) && n(a.role) === n(b.role);
    case 'languages':
      return n(a.certificate) === n(b.certificate) && n(a.language) === n(b.language);
    case 'textTemplates':
      return n(a.body) === n(b.body);
    case 'family':
      return n(a.relation) === n(b.relation) && n(a.name) === n(b.name);
  }
}

export interface ApplyResult {
  /** 写入的字段路径（如 basic.name、education.2） */
  applied: string[];
  /** 因已有值而跳过的字段 */
  keptExisting: string[];
  /** 因重复而跳过的记录 */
  duplicates: string[];
  /** 新增记录的 id */
  newRecordIds: string[];
}

/**
 * 原地修改 draft（档案页的表单控件绑定在 draft 上）。
 * overwrite=false 时，档案已有值的字段保持不变。
 */
export function applyParsed(draft: Profile, fields: ParsedField[], records: ParsedRecord[], opts: { overwrite?: boolean } = {}): ApplyResult {
  const root = draft as unknown as Obj;
  const res: ApplyResult = { applied: [], keptExisting: [], duplicates: [], newRecordIds: [] };
  for (const f of fields) {
    // “custom:体重(kg)”：写到档案“自定义字段”里同名的一项（没有就新建）
    if (f.path.startsWith('custom:')) {
      const label = f.path.slice('custom:'.length);
      if (!Array.isArray(root.custom)) root.custom = [];
      const list = root.custom as Obj[];
      const hit = list.find((x) => n(x.label) === n(label) || (Array.isArray(x.aliases) && x.aliases.some((a) => n(a) === n(label))));
      if (hit && !isEmptyValue(hit.value) && !opts.overwrite) {
        res.keptExisting.push(f.path);
        continue;
      }
      if (hit) hit.value = String(f.value);
      else list.push({ id: newRecordId('cf'), label, value: String(f.value) });
      res.applied.push(f.path);
      continue;
    }
    const cur = getIn(root, f.path);
    if (!isEmptyValue(cur) && !opts.overwrite) {
      res.keptExisting.push(f.path);
      continue;
    }
    setPath(root, f.path, structuredClone(f.value));
    res.applied.push(f.path);
  }
  for (const r of records) {
    if (!Array.isArray(root[r.collection])) root[r.collection] = [];
    const arr = root[r.collection] as Obj[];
    const index = arr.findIndex((x) => sameRecord(r.collection, x, r.record));
    if (index >= 0) {
      const existing = arr[index];
      let changed = false;
      for (const [key, value] of Object.entries(r.record)) {
        if (key === 'id' || isEmptyValue(value)) continue;
        if ((isEmptyValue(existing[key]) || existing[key] === 'unset' || opts.overwrite) && JSON.stringify(existing[key]) !== JSON.stringify(value)) {
          existing[key] = structuredClone(value);
          changed = true;
        }
      }
      if (changed) res.applied.push(`${r.collection}.${index}`);
      else res.duplicates.push(r.display);
      continue;
    }
    const id = newRecordId(ID_PREFIX[r.collection]);
    arr.push({ id, ...structuredClone(r.record) });
    res.newRecordIds.push(id);
    res.applied.push(`${r.collection}.${arr.length - 1}`);
  }
  if (res.applied.length) draft.meta.source = 'resume-parse';
  return res;
}
