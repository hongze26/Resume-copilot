// 站点适配器的“规则”部分：纯数据和纯函数，侧边栏用它生成计划。
// DOM 操作部分在 content/site/*.ts 中，按适配器 id 选择。
import type { ControlKind } from '../core/plan/types';
import type { RecordCollection } from '../core/profile/types';

export interface FieldRule {
  section: string; // 区块键
  id?: string; // 已剥离站点后缀的 id
  label?: string; // 规整后的核心标签（完全相等）
  path?: string; // 语义规则 key，如 basic.ethnicity / education.school
  manual?: string; // 需要本人完成的原因
  locked?: boolean; // 实名锁定
  dependency?: boolean;
  kind?: ControlKind; // 覆盖扫描得到的控件类型
  knownOptions?: string[];
  optionsPartial?: boolean;
  note?: string;
}

export interface SectionRule {
  key: string;
  titles: string[]; // 区块标题（完全相等，规整后）
  mode: 'single' | 'repeat' | 'manual';
  collection?: RecordCollection | 'single';
  manualNote?: string;
}

export interface AdapterRules {
  id: string;
  name: string;
  version: string;
  verifiedAt: string; // 最近验证日期
  matches(url: string): boolean;
  /** 需要申请的站点权限 */
  origins(url: string): string[];
  /** 是否允许在该站点执行填写（决策 3：非国聘只扫描预览） */
  allowExecute: boolean;
  sections: SectionRule[];
  fields: FieldRule[];
  notes: string[];
  /** 重复区块的填写顺序 */
  orderRecords?<T extends { id: string }>(collection: RecordCollection, records: T[]): T[];
  /** 用于和页面已保存记录比对的关键文字 */
  recordKeys?(collection: RecordCollection, record: Record<string, unknown>): string[];
  /** 学历 → 专业分类前缀（国聘） */
  majorCategoryPrefix?(level: string): string[];
}
