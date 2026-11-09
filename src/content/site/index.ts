// 站点 DOM 适配入口。
//   iguopin.ts  国聘申请简历页（.item-section 区块、标题栏“添加/编辑”）
//   zhilian.ts  智联校园网申“我的简历”（.apply-module 区块、只读展示 →“编辑”/“添加”）
//   generic.ts  其他网站：按文字找区块标题、按弹窗定位经历表单（也供定制适配器使用）
// 新增内置站点：实现 types.ts 的 SiteDom，在 siteDomFor 里按适配器 id 返回。
import { genericDom } from './generic';
import { iguopinDom } from './iguopin';
import { zhilianDom } from './zhilian';
import type { SiteDom } from './types';

export type { FormContainer, SectionHandle, SectionInfo, SiteDom } from './types';
export { resumeSectionTitles } from './generic';

export function siteDomFor(adapterId: string): SiteDom {
  if (adapterId === 'iguopin') return iguopinDom;
  if (adapterId === 'zhilian') return zhilianDom;
  return genericDom;
}
