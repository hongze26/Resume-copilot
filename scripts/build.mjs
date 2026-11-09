// 构建：esbuild 多入口，直接产出可加载的 MV3 目录。
//   node scripts/build.mjs          → dist/
//   node scripts/build.mjs --test   → dist-test/（额外授予 127.0.0.1 权限，本地夹具 /gp-like/ 视为国聘）
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const TEST = process.argv.includes('--test');
const out = new URL(TEST ? '../dist-test/' : '../dist/', import.meta.url);
const outDir = out.pathname.replace(/^\/([A-Za-z]:)/, '$1');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const define = {
  __TEST__: JSON.stringify(TEST),
  __VERSION__: JSON.stringify(pkg.version),
};

const common = {
  bundle: true,
  target: 'chrome116',
  define,
  legalComments: 'none',
  logLevel: 'warning',
  minify: !TEST,
  sourcemap: false,
  charset: 'utf8',
};

// Content Script 必须是经典脚本（executeScript 注入），用 IIFE
await build({ ...common, entryPoints: { content: 'src/content/index.ts' }, outdir: outDir, format: 'iife' });
// Service Worker（type: module）
await build({ ...common, entryPoints: { background: 'src/background/index.ts' }, outdir: outDir, format: 'esm' });
// 扩展页面：ESM + 代码分割，PDF.js / mammoth 按需加载
await build({
  ...common,
  entryPoints: { panel: 'src/pages/panel/panel.ts', profile: 'src/pages/profile/profile.ts' },
  outdir: outDir,
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  loader: { '.json': 'json' },
  platform: 'browser',
});

// 静态文件
for (const f of ['pages/panel/panel.html', 'pages/panel/panel.css', 'pages/profile/profile.html', 'pages/profile/profile.css', 'pages/shared/shared.css']) {
  cpSync(`src/${f}`, `${outDir}/${f.split('/').pop()}`);
}
cpSync('src/icons', `${outDir}/icons`, { recursive: true });
cpSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', `${outDir}/pdf.worker.min.mjs`);

const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
manifest.version = pkg.version;
if (TEST) {
  manifest.name += '（测试构建）';
  manifest.host_permissions = [...(manifest.host_permissions ?? []), 'http://127.0.0.1/*', 'http://localhost/*'];
}
writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`built → ${outDir}`);
