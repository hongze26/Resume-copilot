// 生成测试用简历文件（全部为虚构信息）：tests/resumes/*.txt → .docx（本地拼装）与 .pdf（Playwright Chromium 打印）。
//   node scripts/make-test-resumes.mjs [输出目录]   默认输出到 tests/resumes/out/
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { makeDocx } from '../tests/e2e/files.ts';

const outDir = path.resolve(process.argv[2] ?? 'tests/resumes/out');
mkdirSync(outDir, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const HEADING = /^(【.*】|教育背景|教育经历|实习经历|项目经历|校园经历|获奖情况|技能证书|自我评价|基本信息|技能|证书|求职意向|语言能力|家庭成员|社会实践)$/;
// 含这一行的简历按“左侧信息栏 + 右侧经历栏”两栏排版（Word 版仍为单栏）
const COLUMN_BREAK = '=====右栏=====';

function block(lines, first) {
  return lines
    .map((l, i) => {
      if (first && i === 0) return `<h1>${esc(l)}</h1>`;
      if (HEADING.test(l.trim())) return `<h2>${esc(l)}</h2>`;
      return `<p>${esc(l) || '&nbsp;'}</p>`;
    })
    .join('\n');
}

function html(lines, title) {
  const cut = lines.indexOf(COLUMN_BREAK);
  const body =
    cut < 0
      ? block(lines, true)
      : `<div class="cols"><aside>${block(lines.slice(0, cut), true)}</aside><main>${block(lines.slice(cut + 1), false)}</main></div>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font: 11pt/1.55 "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif; margin: 0; color: #222; }
  h1 { font-size: 20pt; margin: 0 0 6pt; }
  h2 { font-size: 12.5pt; margin: 12pt 0 4pt; padding-bottom: 2pt; border-bottom: 1px solid #b42318; color: #b42318; }
  p { margin: 0; white-space: pre-wrap; }
  .cols { display: grid; grid-template-columns: 32% 1fr; gap: 9mm; }
  aside { background: #f4f5f7; padding: 4mm; }
</style></head><body>${body}</body></html>`;
}

const files = readdirSync('tests/resumes').filter((f) => f.endsWith('.txt'));
const browser = await chromium.launch();
const page = await browser.newPage();
for (const f of files) {
  const lines = readFileSync(path.join('tests/resumes', f), 'utf8').split(/\r?\n/).filter((l, i, a) => !(l === '' && i === a.length - 1));
  const base = f.replace(/\.txt$/, '');
  writeFileSync(path.join(outDir, `${base}.docx`), makeDocx(lines.filter((l) => l !== COLUMN_BREAK)));
  await page.setContent(html(lines, base));
  await page.pdf({ path: path.join(outDir, `${base}.pdf`), format: 'A4', margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' }, printBackground: true });
  console.log(`✓ ${base}.docx / ${base}.pdf`);
}
await browser.close();
console.log(`输出目录：${outDir}`);
