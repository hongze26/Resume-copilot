// Moka（app.mokahr.com 及用 Moka 搭的企业招聘站）。组件是自研的，类名前缀 sd-，带 CSS Modules 哈希后缀。
// 表单结构（2026-11-12 在一家企业的校招申请页上只读核对）：
//   apply-block-* > blockTitle-*（区块标题，里面还有“添加”和说明）
//                 > apply-fields-*（一条记录）> apply-field-* <类型>（表单项）> title-*（字段名）+ ctrl-*（控件）
// 类型写在表单项的类名里：string_info、text_info、Select、select_info、date_info（年 + 月下拉）、
// day_info（日历）、location_info（省市县面板）、file_*（上传）、confirm_info（声明）。
import type { ItemClass, PlatformHints } from './types';

const has = (el: Element, word: RegExp) => word.test(String(el.getAttribute('class') ?? ''));

function classify(item: Element): ItemClass | undefined {
  if (has(item, /(^|\s)day_info/)) return { manual: '这一栏是日历，请自己在网页上选' };
  if (has(item, /(^|\s)location_info/)) return { manual: '这一栏要一级一级选地区，请自己在网页上选' };
  if (has(item, /(^|\s)(portrait_upload|file_upload|custom_file_upload|file_info)/)) return { manual: '附件需本人上传' };
  if (has(item, /(^|\s)(confirm_info|signature_info)/)) return { manual: '声明和签名需本人确认' };
  if (has(item, /(^|\s)date_info/)) return { kind: 'ym' };
  if (has(item, /(^|\s)(Select|select_info)/)) return { kind: 'select' };
  if (has(item, /(^|\s)string_info/)) return { kind: 'remote-select' };
  return undefined;
}

export const mokaHints: PlatformHints = {
  id: 'moka',
  name: 'Moka',
  detect: (doc, url) => {
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      /* 没有网址的框架 */
    }
    if (/(^|\.)mokahr\.com$/.test(host)) return true;
    return !!doc.querySelector('[class*="apply-field-"]') && !!doc.querySelector('[class*="sd-Select-container"], [class*="sd-Input-container"]');
  },
  section: '[class*="apply-block-"]',
  sectionTitle: '[class*="blockTitle-"]',
  group: '[class*="apply-fields-"]',
  item: '[class*="apply-field-"]:not([class*="apply-fields-"])',
  title: ':scope > [class*="title-"]',
  popup: '[class*="sd-Dropdown-dropdown"]',
  option: '[class*="sd-Menu-content-item"]',
  classify,
  notes: ['Moka 上传简历后会重新解析并覆盖已填内容：请先上传简历，等十几秒解析完，再扫描填写。', '多条经历排在同一页：第 N 份表单对应档案第 N 条；不够时先在网页上点“添加”，再重新扫描。'],
};
