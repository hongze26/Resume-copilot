// 跨平台设置浏览器后运行 Playwright：node scripts/run-e2e.mjs [msedge|chromium]
import { spawnSync } from 'node:child_process';
const browser = process.argv[2] ?? 'chromium';
const r = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(3)], { stdio: 'inherit', shell: true, env: { ...process.env, E2E_BROWSER: browser } });
process.exit(r.status ?? 1);
