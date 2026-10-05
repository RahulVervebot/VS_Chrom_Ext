// Generates simple PNG icons (no image dependencies): a rounded blue tile with a white node graph.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c; let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const px = Buffer.alloc(size * size * 4);
  const nodes = [[0.5, 0.25], [0.25, 0.72], [0.75, 0.72]].map(([x, y]) => [x * size, y * size]);
  const r = size * 0.11;
  const lineD = (x, y, a, b) => { const [x1, y1] = a; const [x2, y2] = b; const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2))); return Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1))); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const cx = Math.min(x, size - 1 - x); const cy = Math.min(y, size - 1 - y); const rad = size * 0.2;
    const inTile = !(cx < rad && cy < rad && Math.hypot(rad - cx, rad - cy) > rad);
    if (!inTile) { px[i + 3] = 0; continue; }
    let white = nodes.some(([nx, ny]) => Math.hypot(x - nx, y - ny) <= r) || lineD(x, y, nodes[0], nodes[1]) < size * 0.035 || lineD(x, y, nodes[0], nodes[2]) < size * 0.035;
    px[i] = white ? 255 : 14; px[i + 1] = white ? 255 : 99; px[i + 2] = white ? 255 : 156; px[i + 3] = 255;
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const dir = path.join(__dirname, '../public/icons');
fs.mkdirSync(dir, { recursive: true });
for (const s of [16, 48, 128]) fs.writeFileSync(path.join(dir, `icon${s}.png`), png(s));
