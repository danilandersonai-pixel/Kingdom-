// Архив для публикации на itch.io (и любом хостинге HTML5-игр):
// dist/korolevstvo-itch.zip с единственным index.html внутри.
// Пишет ZIP сам (deflate из node:zlib) — внешние архиваторы не нужны.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const name = 'index.html';
const data = readFileSync('dist/index.html');

const table = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const packed = deflateRawSync(data, { level: 9 });
const crc = crc32(data);
const fname = Buffer.from(name, 'utf8');
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

const local = Buffer.alloc(30);
local.writeUInt32LE(0x04034b50, 0);
local.writeUInt16LE(20, 4);
local.writeUInt16LE(0x0800, 6); // UTF-8 имена
local.writeUInt16LE(8, 8); // deflate
local.writeUInt16LE(dosTime, 10);
local.writeUInt16LE(dosDate, 12);
local.writeUInt32LE(crc, 14);
local.writeUInt32LE(packed.length, 18);
local.writeUInt32LE(data.length, 22);
local.writeUInt16LE(fname.length, 26);
local.writeUInt16LE(0, 28);

const central = Buffer.alloc(46);
central.writeUInt32LE(0x02014b50, 0);
central.writeUInt16LE(20, 4);
central.writeUInt16LE(20, 6);
central.writeUInt16LE(0x0800, 8);
central.writeUInt16LE(8, 10);
central.writeUInt16LE(dosTime, 12);
central.writeUInt16LE(dosDate, 14);
central.writeUInt32LE(crc, 16);
central.writeUInt32LE(packed.length, 20);
central.writeUInt32LE(data.length, 24);
central.writeUInt16LE(fname.length, 28);
central.writeUInt32LE(0, 42); // смещение локального заголовка

const cdOffset = local.length + fname.length + packed.length;
const cdSize = central.length + fname.length;
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(1, 8);
end.writeUInt16LE(1, 10);
end.writeUInt32LE(cdSize, 12);
end.writeUInt32LE(cdOffset, 16);

const zip = Buffer.concat([local, fname, packed, central, fname, end]);
writeFileSync('dist/korolevstvo-itch.zip', zip);
console.log('dist/korolevstvo-itch.zip', Math.round(zip.length / 1024) + ' KB (index.html ' + Math.round(data.length / 1024) + ' KB)');
