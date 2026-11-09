// 控件驱动入口：按控件所属的组件库分派。
//
//   common.ts   原生控件（文本框、原生下拉、原生单选、复选框）与公共结果类型
//   antd.ts     antd v5（国聘等 React 网站），也是未识别组件库时的默认实现
//   element.ts  Element UI 1.x / 2.x、Element Plus（大量 Vue 企业招聘平台）
//   sui.ts      站点弹窗：智联校园的地区弹窗、语言证书弹窗、技能弹窗
//
// 新增组件库（iView、Arco…）：写一个同样导出 drive/snapshot/clear/probe 的模块，在下面的 kitOf 里登记。
// 扫描阶段如何把元素认成某种控件，见 ../scan.ts 的 LIB_ROOTS。
import type { FillValue, ProbeResult } from '../../core/plan/types';
import { clearAntd, closeSelect, driveAntd, probeAntd, snapshotAntd } from './antd';
import type { DriverResult } from './common';
import { clearElement, closeSelectEl, driveElement, fillAutocomplete, isElementControl, probeElement, snapshotElement } from './element';
import { fillSitePopup, fillSRegion, hasSRegion, isSitePopupHost } from './sui';
import { inputOf } from './common';

export type { DriverResult } from './common';
export { closeCategoryModal } from './antd';

type Kit = 'antd' | 'element';

function kitOf(el: Element): Kit {
  return isElementControl(el) ? 'element' : 'antd';
}

/** 写入一个值并核验。失败时不留下打开的浮层。 */
export function drive(el: Element, kind: string, value: FillValue): Promise<DriverResult> {
  if ((value.t === 'cascade' || value.t === 'cascade-multi') && hasSRegion(el)) return fillSRegion(el, value);
  if (value.t === 'popup-pick' && isSitePopupHost(el)) return fillSitePopup(el, value);
  if (value.t === 'text' && el.closest('.el-autocomplete')) return fillAutocomplete(el, value.text);
  return kitOf(el) === 'element' ? driveElement(el, kind, value) : driveAntd(el, kind, value);
}

/** 控件当前显示的值（撤销与核验用）。 */
export function snapshot(el: Element, kind: string): string {
  if (hasSRegion(el) || isSitePopupHost(el)) return ((inputOf(el) as HTMLInputElement | null)?.value ?? '').trim();
  return kitOf(el) === 'element' ? snapshotElement(el, kind) : snapshotAntd(el, kind);
}

/** 清空控件（撤销用）。不能安全清空时返回 false。 */
export function clearControl(el: Element, kind: string): Promise<boolean> {
  if (hasSRegion(el) || isSitePopupHost(el)) return Promise.resolve(false);
  return kitOf(el) === 'element' ? clearElement(el, kind) : clearAntd(el, kind);
}

/** 关闭这个下拉留下的浮层（执行出错时兜底）。 */
export function closeDropdownOf(el: Element): Promise<void> {
  return kitOf(el) === 'element' ? closeSelectEl(el) : closeSelect(el);
}

/** 选项探测：展开下拉读选项、读日期面板粒度，随即关闭，不选择任何值。 */
export function probeControl(el: Element, kind: string): Promise<Partial<ProbeResult>> {
  return kitOf(el) === 'element' ? probeElement(el, kind) : probeAntd(el, kind);
}

