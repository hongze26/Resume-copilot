// 构建期网络入口与权限检查：
// 1. 我们自己的源码（src/）仅允许 ai-client.ts（档案页简历识别）与 ai-chat.ts（侧边栏生成定制适配器）使用网络 API，且都只在用户确认后调用。
// 2. 发布产物 manifest 的 CSP 仅允许自身、HTTPS 和本机 HTTP 连接，
//    且没有 host_permissions / externally_connectable。
// 3. 列出产物中出现的外部 URL 字符串（第三方库里的命名空间、文档链接等），只用于人工复核。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
let failed = false;
const fail = (m) => {
  failed = true;
  console.error('✗ ' + m);
};

function walk(dir, exts) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

// 1. 源码
const ALLOWED_NET = new Set(['src/pages/profile/ai-client.ts', 'src/pages/shared/ai-chat.ts']);
const NET = /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts\s*\()/;
for (const f of walk('src', ['.ts'])) {
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (line.trim().startsWith('//')) return;
      if (NET.test(line) && !ALLOWED_NET.has(f.replaceAll('\\', '/'))) fail(`${f}:${i + 1} 出现网络 API：${line.trim()}`);
      const url = line.match(/https?:\/\/[^\s'"`)]+/);
      if (url && !/^https?:\/\/\*\//.test(url[0])) fail(`${f}:${i + 1} 出现外部地址：${url[0]}`);
    });
}

// 2. manifest
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const csp = manifest.content_security_policy?.extension_pages ?? '';
const connect = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('connect-src '));
if (connect !== "connect-src 'self' https: http://localhost:* http://127.0.0.1:* http://[::1]:*") fail(`CSP 连接范围不符合发布配置：${connect}`);
if (/unsafe-eval|unsafe-inline/.test(csp)) fail('CSP 不允许 unsafe-eval / unsafe-inline');
if (manifest.host_permissions?.length) fail(`发布产物不应包含 host_permissions：${manifest.host_permissions}`);
if (manifest.externally_connectable) fail('不应声明 externally_connectable');
if (JSON.stringify(manifest.permissions).includes('<all_urls>')) fail('不应申请 <all_urls>');

// 3. 产物中的 URL 字符串（人工复核用）
const hosts = new Map();
for (const f of walk(dist, ['.js', '.mjs', '.html'])) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) hosts.set(m[1], (hosts.get(m[1]) ?? 0) + 1);
}
console.log(`产物中出现的外部域名字符串（第三方库命名空间/注释，不代表运行时请求）：`);
for (const [h, n] of [...hosts].sort((a, b) => b[1] - a[1])) console.log(`  ${h} ×${n}`);

if (failed) {
  console.error('网络检查未通过');
  process.exit(1);
}
console.log(`✓ 网络检查通过：仅 ai-client / ai-chat 在用户确认后发出显式 API 请求；CSP=${csp}`);
