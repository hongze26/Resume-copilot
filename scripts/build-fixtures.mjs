// 构建本地测试夹具到 tests/fixtures/dist/
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const out = 'tests/fixtures/dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/gp-like`, { recursive: true });
await build({
  entryPoints: ['tests/fixtures/gp-like/app.tsx'],
  outfile: `${out}/gp-like/app.js`,
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'warning',
  sourcemap: false,
});
// 真实 Element UI 1.x / 2.x（Vue 2）夹具：仿企业招聘平台“我的简历”分页面
for (const v of ['el1', 'el2']) {
  mkdirSync(`${out}/${v}`, { recursive: true });
  await build({
    entryPoints: [`tests/fixtures/el-real/entry-${v}.js`],
    outfile: `${out}/${v}/app.js`,
    bundle: true,
    format: 'iife',
    target: 'chrome116',
    loader: { '.woff': 'dataurl', '.ttf': 'dataurl', '.eot': 'dataurl', '.svg': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning',
  });
  cpSync('tests/fixtures/el-real/index.html', `${out}/${v}/index.html`);
}
// 智联校园“我的简历”（Vue 2 + Element UI 2.x）：仿 xiaoyuan.zhaopin.com/scrd/resume2，测试构建把 /zl-like/ 视为智联
mkdirSync(`${out}/zl-like`, { recursive: true });
await build({
  entryPoints: ['tests/fixtures/zl-real/entry.js'],
  outfile: `${out}/zl-like/app.js`,
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  loader: { '.woff': 'dataurl', '.ttf': 'dataurl', '.eot': 'dataurl', '.svg': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'warning',
});
cpSync('tests/fixtures/zl-real/index.html', `${out}/zl-like/index.html`);
cpSync('tests/fixtures/gp-like/index.html', `${out}/gp-like/index.html`);
cpSync('tests/fixtures/gp-like/fixture.css', `${out}/gp-like/fixture.css`);
cpSync('tests/fixtures/native', `${out}/native`, { recursive: true });
cpSync('tests/fixtures/el-like', `${out}/el-like`, { recursive: true });
// 测试构建把 /gp-like/ 视为国聘：同一份通用页面放在这里，用来测“国聘适配器找不到区块时改用通用识别”
cpSync('tests/fixtures/el-like/index.html', `${out}/gp-like/other.html`);
cpSync('tests/fixtures/el-like/frame.html', `${out}/gp-like/frame.html`);
console.log('fixtures built');
