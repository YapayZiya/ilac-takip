const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICONS_DIR = path.join(__dirname, '..', 'www', 'icons');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c;
    }
    crc32.table = table;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const width = size;
  const height = size;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const off = y * (1 + width * 4) + 1 + x * 4;
      const px = x / size;
      const py = y / size;
      const cx = 0.5;
      const cy = 0.5;
      const rx = 0.35;
      const ry = 0.20;
      const dx = px - cx;
      const dy = py - cy;
      let inside = false;
      if (Math.abs(dy) <= ry) {
        const half = rx - ry;
        if (Math.abs(dx) <= half) {
          inside = true;
        } else {
          const ex = Math.sign(dx) * half;
          const exx = (Math.abs(dx) - half) * size;
          const eyy = Math.abs(dy) * size;
          if (exx * exx + eyy * eyy <= ry * ry * size * size) {
            inside = true;
          }
        }
      }
      const r = inside ? 0xFF : 0x14;
      const g = inside ? 0xFF : 0xB8;
      const b = inside ? 0xFF : 0xA6;
      const a = 255;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

[96, 192, 512].forEach(function (s) {
  const p = path.join(ICONS_DIR, 'icon-' + s + '.png');
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, makePng(s));
    console.log('Oluşturuldu: ' + p);
  } else {
    console.log('Zaten var: ' + p);
  }
});

console.log('İkonlar tamam.');