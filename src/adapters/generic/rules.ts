// 通用规则：没有内置适配器、也没有定制适配器的网站使用。
// 区块与字段在扫描时由 adapters/dynamic.ts 按页面临时组装；这里只提供名称、权限和说明。
// 2026-11-08 起允许在预览确认后填写（此前为“只预览”）：工具只填写，从不点击保存、提交或投递。
import type { AdapterRules } from '../types';

export const genericRules: AdapterRules = {
  id: 'generic',
  name: '通用识别',
  version: '0.2.0',
  verifiedAt: '—',
  matches: () => true,
  origins: (url) => {
    const u = new URL(url);
    return [`${u.protocol}//${u.host}/*`];
  },
  allowExecute: true,
  sections: [],
  fields: [],
  notes: [
    '通用识别：按字段名称对应档案，预览确认后才填写；工具只填写，不点击保存、提交或投递。',
    '“我的简历”分成多个子页面（基本信息、教育背景…）的网站：每个子页面分别扫描、填写，并由你在页面上点保存，最后再去投递。',
    '经历类记录在“添加”弹窗里填写：可以点区块里的“添加并准备”，也可以自己点开弹窗后再扫描。',
  ],
};
