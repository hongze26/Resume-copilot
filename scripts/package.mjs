// 打包发布 zip：release/resume-copilot-v<版本>.zip（内容为 dist/ 目录下的文件）。
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const src = 'dist';
const out = `release/resume-copilot-v${pkg.version}.zip`;

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const locals = [];
const centrals = [];
let offset = 0;
for (const file of walk(src).sort()) {
  const name = Buffer.from(relative(src, file).split('\\').join('/'), 'utf8');
  const data = readFileSync(file);
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0x0800, 6);
  lh.writeUInt16LE(8, 8);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(name.length, 26);
  locals.push(lh, name, comp);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0x0800, 8);
  ch.writeUInt16LE(8, 10);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(comp.length, 20);
  ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(name.length, 28);
  ch.writeUInt32LE(offset, 42);
  centrals.push(ch, name);
  offset += 30 + name.length + comp.length;
}
const cd = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(centrals.length / 2, 8);
end.writeUInt16LE(centrals.length / 2, 10);
end.writeUInt32LE(cd.length, 12);
end.writeUInt32LE(offset, 16);
mkdirSync('release', { recursive: true });
writeFileSync(out, Buffer.concat([...locals, cd, end]));
console.log(`packaged → ${out} (${centrals.length / 2} files)`);
