/**
 * 生成 Audio Studio 桌面版图标（纯 Node，无依赖）：
 *   src-tauri/icons/32x32.png
 *   src-tauri/icons/128x128.png
 *   src-tauri/icons/128x128@2x.png (256)
 *   src-tauri/icons/icon.png (256)
 *   src-tauri/icons/icon.ico  (PNG-in-ICO，Vista+ 支持)
 *
 * 设计：深色圆角底 + 青色音波圆（纯色绘制，可后续用 `tauri icon` 替换）。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// ---- PNG 编码（RGBA, 8bit） ----
function encodePng(size, pixelFn) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    const row = y * stride;
    raw[row] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const o = row + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 绘制 ----
function pixel(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const nx = (x - cx) / (size / 2);
  const ny = (y - cy) / (size / 2);
  const d = Math.sqrt(nx * nx + ny * ny);

  // 圆角方形背景
  const r = 0.86; // 边界比例
  const corner = 0.22;
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  let inBg = ax <= r && ay <= r;
  if (ax > r - corner && ay > r - corner) {
    const dx = ax - (r - corner);
    const dy = ay - (r - corner);
    inBg = dx * dx + dy * dy <= corner * corner;
  }
  if (!inBg) return [0, 0, 0, 0];

  // 背景渐变（深蓝灰）
  const t = (ny + 1) / 2;
  let br = Math.round(15 + 24 * t);
  let bg = Math.round(23 + 34 * t);
  let bb = Math.round(42 + 48 * t);

  // 青色圆盘
  if (d <= 0.62) {
    br = 56; bg = 189; bb = 248;
    // 内部白色音波（三条竖杠）
    const w = Math.abs(nx);
    const bar = (Math.abs(Math.abs(nx) - 0.0) < 0.07 && Math.abs(ny) < 0.34)
      || (w > 0.16 && w < 0.24 && Math.abs(ny) < 0.26)
      || (w > 0.32 && w < 0.40 && Math.abs(ny) < 0.16);
    if (bar && d <= 0.55) { br = 255; bg = 255; bb = 255; }
    // 边缘高光
    if (d > 0.55 && d <= 0.62) { br = 125; bg = 211; bb = 252; }
  }
  return [br, bg, bb, 255];
}

function encodeIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + count * 16;
  for (const { size, png } of pngBuffers) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; // palette
    e[3] = 0;
    e.writeUInt16LE(1, 4);  // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...pngBuffers.map((x) => x.png)]);
}

const outDir = path.join(__dirname, '..', 'src-tauri', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const png256 = encodePng(256, pixel);
const png128 = encodePng(128, pixel);
const png32 = encodePng(32, pixel);

fs.writeFileSync(path.join(outDir, '32x32.png'), png32);
fs.writeFileSync(path.join(outDir, '128x128.png'), png128);
fs.writeFileSync(path.join(outDir, '128x128@2x.png'), png256);
fs.writeFileSync(path.join(outDir, 'icon.png'), png256);
fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeIco([
  { size: 16, png: encodePng(16, pixel) },
  { size: 32, png: png32 },
  { size: 48, png: encodePng(48, pixel) },
  { size: 64, png: encodePng(64, pixel) },
  { size: 128, png: png128 },
  { size: 256, png: png256 },
]));

console.log('icons generated in', outDir);
