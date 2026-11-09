// 本地夹具静态服务器：只监听 127.0.0.1。
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = normalize(join(process.cwd(), 'tests/fixtures/dist'));
const port = Number(process.env.FIXTURE_PORT ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  let p = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!p.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(p));
}).listen(port, '127.0.0.1', () => console.log(`fixtures on http://127.0.0.1:${port}/`));
