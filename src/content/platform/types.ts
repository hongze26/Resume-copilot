// 平台提示：描述“这个招聘平台的表单长什么样”。通用引擎读到提示就按提示找字段名、弹层和选项，
// 没有提示时按结构自己判断。新增平台：照 moka.ts 写一份，在 index.ts 的 BUILTIN 里登记。
import type { SerialHints } from '../../core/platform-hints';

export interface ItemClass {
  /** 这一项里的下拉是什么：普通下拉 / 带候选的搜索框 / 年+月组合 */
  kind?: 'select' | 'remote-select' | 'ym';
  /** 这一项需要本人完成（日历、地区面板、上传、声明）时的说明 */
  manual?: string;
}

export interface PlatformHints extends SerialHints {
  id: string;
  name: string;
  detect?(doc: Document, url: string): boolean;
  classify?(item: Element): ItemClass | undefined;
  /** 侧边栏显示的提示 */
  notes?: string[];
}
