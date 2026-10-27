/** A small PNG reader for tests: 8-bit grayscale, RGB or RGBA, not interlaced (what the portrait art is). Returns one byte per channel. */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export interface Png {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function readPng(path: string | URL): Png {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error('Only 8-bit, non-interlaced PNGs are supported');
      channels = CHANNELS[body[9]!] ?? 0;
      if (channels === 0) throw new Error(`Unsupported PNG color type ${body[9]}`);
    } else if (type === 'IDAT') idat.push(body);
    pos += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= channels ? data[line + i - channels]! : 0;
      const b = y > 0 ? data[line - stride + i]! : 0;
      const c = y > 0 && i >= channels ? data[line - stride + i - channels]! : 0;
      let value: number;
      if (filter === 0) value = x;
      else if (filter === 1) value = x + a;
      else if (filter === 2) value = x + b;
      else if (filter === 3) value = x + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      data[line + i] = value & 255;
    }
  }
  return { width, height, channels, data };
}
