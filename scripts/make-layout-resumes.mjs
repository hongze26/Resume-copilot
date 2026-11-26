// 生成“常见真实版式”的测试简历（全部为虚构信息），用于端到端测试简历导入：
//   resume-template.pdf：模板式——标题带英文副标题、字间空格标题、标题与内容同一行、分栏对齐的“日期  学校  专业  学历”
//   resume-table.pdf / resume-table.docx：表格式——“姓 名 | 王五 | 性别 | 男”，基本信息表里写毕业院校、专业、学历
//   node scripts/make-layout-resumes.mjs [输出目录]   默认 tests/resumes/
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { makeDocxDoc } from '../tests/e2e/files.ts';

const outDir = path.resolve(process.argv[2] ?? 'tests/resumes');
mkdirSync(outDir, { recursive: true });

const STYLE = `
  body { font: 10.5pt/1.6 "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif; margin: 0; color: #222; }
  h1 { font-size: 20pt; margin: 0 0 4pt; }
  h2 { font-size: 12pt; margin: 12pt 0 4pt; padding-bottom: 2pt; border-bottom: 2px solid #1d4ed8; color: #1d4ed8; }
  h2 small { font-size: 9pt; color: #64748b; margin-left: 6pt; letter-spacing: 1px; }
  p { margin: 0; }
  .row { display: flex; justify-content: space-between; font-weight: 600; }
  .rail { display: grid; grid-template-columns: 26mm 1fr; margin-top: 12pt; }
  .rail > b { color: #1d4ed8; font-size: 12pt; }
  .spaced { letter-spacing: 0.6em; }
  table { border-collapse: collapse; width: 100%; }
  td { border: 1px solid #94a3b8; padding: 3pt 6pt; vertical-align: top; }
  td.k { background: #f1f5f9; width: 18%; }
`;

const template = `<h1>张晓雨</h1>
<p>电话：13800001111 ｜ 邮箱：xiaoyu.zhang@example.com ｜ 求职意向：财务分析</p>
<h2>教育背景<small>EDUCATION</small></h2>
<div class="row"><span>2019.09 - 2023.06</span><span>湖南大学</span><span>会计学</span><span>本科</span></div>
<p>GPA：3.72/4.0 ｜ 专业排名：前10%</p>
<h2>实习经历<small>INTERNSHIP</small></h2>
<div class="row"><span>2022.07 - 2022.09</span><span>普华永道中天会计师事务所</span><span>审计实习生</span></div>
<p>• 参与两家上市公司年报审计，负责货币资金、应收账款底稿。</p>
<div class="rail"><b>项目经历</b><div class="row"><span>2021.03 - 2021.06</span><span>校园二手交易平台</span><span>项目负责人</span></div></div>
<p>• 带领 4 人团队完成需求调研和原型设计。</p>
<h2 class="spaced">荣誉奖励</h2>
<p>2021.10 国家奖学金</p>
<h2>技能证书<small>SKILLS</small></h2>
<p>英语六级（CET-6）、全国计算机等级考试二级</p>
<h2>自我评价<small>ABOUT ME</small></h2>
<p>认真负责，学习能力强，具备良好的沟通能力。</p>`;

// 表格式简历：PDF 与 Word 用同一份内容
const tableRows = [
  ['姓 名', '王 五', '性 别', '男'],
  ['出生年月', '1999.05', '民 族', '汉族'],
  ['政治面貌', '共青团员', '籍 贯', '湖南长沙'],
  ['联系电话', '13800002222', '电子邮箱', 'wangwu@example.com'],
  ['毕业院校', '湖南大学', '专 业', '会计学'],
  ['学 历', '本科', '毕业时间', '2023.06'],
];
const eduRows = [['起止时间', '学校', '专业', '学历'], ['2019.09-2023.06', '湖南大学', '会计学', '本科']];
const workRows = [['2022.07-2022.09', '普华永道', '审计部', '审计实习生'], ['工作内容', '负责凭证核对；\n协助编制审计底稿。']];
const selfText = '认真负责，学习能力强。';

const cells = (rows, keyCols = []) => rows.map((r) => `<tr>${r.map((c, i) => `<td class="${keyCols.includes(i) ? 'k' : ''}">${c.replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('');
const tableHtml = `<h1 style="text-align:center">个人简历</h1>
<table>${cells(tableRows, [0, 2])}</table>
<h2>教育经历</h2><table>${cells(eduRows)}</table>
<h2>实习经历</h2><table>${cells(workRows, [0])}</table>
<h2>自我评价</h2><p>${selfText}</p>`;

const page = (body) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${body}</body></html>`;

const browser = await chromium.launch();
const tab = await browser.newPage();
for (const [name, body] of [['resume-template', template], ['resume-table', tableHtml]]) {
  await tab.setContent(page(body));
  await tab.pdf({ path: path.join(outDir, `${name}.pdf`), format: 'A4', margin: { top: '16mm', bottom: '16mm', left: '16mm', right: '16mm' }, printBackground: true });
  console.log(`✓ ${name}.pdf`);
}
await browser.close();

writeFileSync(path.join(outDir, 'resume-table.docx'), makeDocxDoc(['个人简历', tableRows, '教育经历', eduRows, '实习经历', workRows, '自我评价', selfText]));
console.log('✓ resume-table.docx');
console.log(`输出目录：${outDir}`);
