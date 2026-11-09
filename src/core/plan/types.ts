// 扫描结果、填写计划、执行结果的共享类型。Content Script 与侧边栏都使用。
import type { DateParts } from '../normalize/date';
import type { Sensitivity } from '../profile/types';

export type ControlKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'native-select'
  | 'radio' // 原生 radio 组
  | 'checkbox'
  | 'select' // antd Select
  | 'remote-select' // 远程搜索的 antd Select（学校名称等）
  | 'cascader'
  | 'date'
  | 'date-range'
  | 'radio-button' // antd Radio.Button 组
  | 'upload'
  | 'custom-popup'
  | 'unknown';

/** 字段描述（scan 产出）。不包含页面上已有的值，只给出 isEmpty。 */
export interface FieldDescriptor {
  key: string; // 本次扫描内唯一
  label: string;
  id?: string; // 已剥离站点后缀
  rawId?: string;
  name?: string;
  placeholder?: string;
  section?: string; // 最近的区块标题文字
  sectionKey?: string; // 适配器识别出的区块键
  formIndex: number; // 区块内第几个展开表单（0 起）
  itemIndex: number; // 表单内第几个表单项
  kind: ControlKind;
  required: boolean;
  disabled: boolean;
  readonly: boolean;
  isEmpty: boolean;
  options?: string[]; // 可见选项文字（原生 select / radio 组，或 probe 得到）
  optionsPartial?: boolean;
  datePrecision?: 'year' | 'month' | 'day'; // probe 得到的日期面板粒度
  hasPresentOption?: boolean; // 结束时间是否有“至今”
  visible: boolean;
}

export type FillValue =
  | { t: 'text'; text: string }
  | { t: 'option'; text: string; search?: string; match?: 'exact' | 'suffix'; accept?: string[] }
  | { t: 'remote-option'; query: string; accept: string[] }
  | { t: 'cascade'; path: string[] }
  /** 多选地区弹窗（期望城市）：逐个选择后点弹窗的“确定” */
  | { t: 'cascade-multi'; paths: string[][] }
  | { t: 'date'; date: DateParts | 'present' }
  | { t: 'date-range'; start: DateParts; end: DateParts | 'present' }
  | { t: 'radio'; text: string; accept?: string[] }
  | { t: 'checkbox'; checked: boolean }
  /** 分类弹窗（国聘证书）：左侧分类、右侧证书项。path 为“分类 / 证书”时直接按路径选择。 */
  | { t: 'popup-pick'; names: string[]; categories?: string[]; path?: [string, string] };

export type Level = 'high' | 'medium' | 'low' | 'skip';

export type SkipReason =
  | 'locked' // 网站已锁定（disabled）
  | 'has-value' // 已有值，默认不覆盖
  | 'low-confidence'
  | 'no-option' // 选项中没有对应项
  | 'timeout'
  | 'verify-failed'
  | 'manual' // 需本人完成（上传、签名、声明、长文本无模板、P1 弹窗等）
  | 'no-profile-value' // 档案中没有这个值
  | 'unrecognized' // 不认识这个字段
  | 'not-supported' // 当前版本不支持的控件
  | 'sensitive-ambiguous' // 敏感字段取值不唯一
  | 'aborted'
  | 'duplicate'; // 同一字段的另一个输入框

export const SKIP_REASON_ZH: Record<SkipReason, string> = {
  locked: '网站不允许修改',
  'has-value': '网页上已经有内容，没有覆盖',
  'low-confidence': '不确定对应档案哪一项，没填',
  'no-option': '网页的选项里没有档案里的值',
  timeout: '网页没有反应',
  'verify-failed': '填了，但网页上没显示出来',
  manual: '需要你自己填',
  'no-profile-value': '档案里没有这一项',
  unrecognized: '找不到这一栏',
  'not-supported': '这种输入框工具还不会填',
  'sensitive-ambiguous': '个人敏感信息对不准，没填',
  aborted: '已停止',
  duplicate: '和上一栏是同一项，只填一次',
};

export interface Candidate {
  value: FillValue;
  display: string;
}

export interface PlanItem {
  fieldKey: string;
  label: string;
  section?: string;
  path?: string; // 档案路径，如 basic.ethnicity、education[edu-1].school
  recordId?: string;
  level: Level;
  reasons: string[]; // 可解释的依据
  value?: FillValue; // 高置信时的写入值
  display?: string; // 值的显示文字
  candidates?: Candidate[]; // 中置信：用户必须选定
  needsDetail?: 'day'; // 日期需要用户补充“日”
  skipReason?: SkipReason;
  sensitivity: Sensitivity;
  longtext?: boolean;
  dependency?: boolean; // 会改变字段集合（学历等），先执行并重新扫描
  derived?: boolean;
  order: number;
  score?: number;
  kind: FieldDescriptor['kind'];
}

/** 侧边栏 → Content Script 的执行项（只含已确认的字段和值）。 */
export interface ExecItem {
  fieldKey: string;
  label: string;
  kind: FieldDescriptor['kind'];
  value: FillValue;
  dependency?: boolean;
  allowOverwrite?: boolean;
}

export type ExecStatus = 'ok' | 'failed' | 'skipped';

export interface ExecResult {
  fieldKey: string;
  label: string;
  status: ExecStatus;
  reason?: SkipReason;
  detail?: string; // 不含值的说明
  candidates?: string[]; // 选项不唯一时的候选（页面选项文字）
  undoable?: boolean;
}

export interface ProbeResult {
  key: string;
  options?: string[];
  optionsPartial?: boolean;
  datePrecision?: 'year' | 'month' | 'day';
  hasPresentOption?: boolean;
}
