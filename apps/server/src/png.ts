// Inspection binaire des images : aucune confiance au type MIME ni aux dimensions annoncées par le client.
import crypto from 'node:crypto';

export type ImageInfo = {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  hasAlpha: boolean;
  /** Résolution déclarée dans le fichier (pHYs PNG), si présente. */
  dpiX: number | null;
  dpiY: number | null;
};

export class ImageError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ImageError'; }
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

export type PngChunk = { type: string; data: Buffer; offset: number };

export function readPngChunks(buf: Buffer): PngChunk[] {
  if (buf.length < 33) throw new ImageError('PNG_TRUNCATED', 'Fichier PNG incomplet.');
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) throw new ImageError('NOT_PNG', 'Ce fichier n’est pas un PNG.');
  const chunks: PngChunk[] = [];
  let p = 8;
  while (p + 12 <= buf.length) {
    const len = buf.readUInt32BE(p);
    if (len > 64 * 1024 * 1024 || p + 12 + len > buf.length) throw new ImageError('PNG_CORRUPT', 'Chunk PNG invalide.');
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    const crc = buf.readUInt32BE(p + 8 + len);
    const actual = crc32(buf.subarray(p + 4, p + 8 + len));
    if (crc !== actual) throw new ImageError('PNG_CRC', `Chunk ${type} corrompu (CRC invalide).`);
    chunks.push({ type, data, offset: p });
    p += 12 + len;
    if (type === 'IEND') break;
  }
  if (!chunks.length || chunks[0].type !== 'IHDR') throw new ImageError('PNG_IHDR', 'En-tête PNG manquant.');
  return chunks;
}

function inspectPng(buf: Buffer): ImageInfo {
  const chunks = readPngChunks(buf);
  const ihdr = chunks[0].data;
  if (ihdr.length < 13) throw new ImageError('PNG_IHDR', 'En-tête PNG tronqué.');
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8], colorType = ihdr[9], interlace = ihdr[12];
  if (!width || !height || width > 20000 || height > 20000) throw new ImageError('IMAGE_SIZE', 'Dimensions d’image invalides.');
  if (![1, 2, 4, 8, 16].includes(bitDepth)) throw new ImageError('PNG_IHDR', 'Profondeur de couleur PNG invalide.');
  if (![0, 2, 3, 4, 6].includes(colorType)) throw new ImageError('PNG_IHDR', 'Type de couleur PNG invalide.');
  if (interlace > 1) throw new ImageError('PNG_IHDR', 'Entrelacement PNG invalide.');
  const trns = chunks.some(c => c.type === 'tRNS');
  const hasAlpha = colorType === 4 || colorType === 6 || trns;
  let dpiX: number | null = null, dpiY: number | null = null;
  const phys = chunks.find(c => c.type === 'pHYs');
  if (phys && phys.data.length >= 9 && phys.data[8] === 1) {
    dpiX = phys.data.readUInt32BE(0) * 0.0254;
    dpiY = phys.data.readUInt32BE(4) * 0.0254;
  }
  return { mime: 'image/png', width, height, hasAlpha, dpiX, dpiY };
}

function inspectJpeg(buf: Buffer): ImageInfo {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new ImageError('NOT_JPEG', 'Ce fichier n’est pas un JPEG.');
  let p = 2;
  while (p + 4 < buf.length) {
    if (buf[p] !== 0xff) { p++; continue; }
    const marker = buf[p + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue; }
    const len = buf.readUInt16BE(p + 2);
    if (len < 2 || p + 2 + len > buf.length) break;
    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSof && len >= 7) {
      const height = buf.readUInt16BE(p + 5), width = buf.readUInt16BE(p + 7);
      if (!width || !height) break;
      return { mime: 'image/jpeg', width, height, hasAlpha: false, dpiX: null, dpiY: null };
    }
    p += 2 + len;
  }
  throw new ImageError('JPEG_CORRUPT', 'Dimensions JPEG introuvables.');
}

function inspectWebp(buf: Buffer): ImageInfo {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new ImageError('NOT_WEBP', 'Ce fichier n’est pas un WebP.');
  }
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') {
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) throw new ImageError('WEBP_CORRUPT', 'Image WebP invalide.');
    const w = buf.readUInt16LE(26) & 0x3fff, h = buf.readUInt16LE(28) & 0x3fff;
    return { mime: 'image/webp', width: w, height: h, hasAlpha: false, dpiX: null, dpiY: null };
  }
  if (kind === 'VP8L') {
    if (buf[20] !== 0x2f) throw new ImageError('WEBP_CORRUPT', 'Image WebP sans perte invalide.');
    const b = buf.readUInt32LE(21);
    return { mime: 'image/webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, hasAlpha: true, dpiX: null, dpiY: null };
  }
  if (kind === 'VP8X') {
    const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    const flags = buf[20];
    return { mime: 'image/webp', width: w, height: h, hasAlpha: Boolean(flags & 0x10), dpiX: null, dpiY: null };
  }
  throw new ImageError('WEBP_CORRUPT', 'Format WebP non pris en charge.');
}

export function inspectImage(buf: Buffer): ImageInfo {
  if (buf.length < 12) throw new ImageError('IMAGE_TOO_SMALL', 'Fichier image trop petit.');
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return inspectPng(buf);
  if (buf[0] === 0xff && buf[1] === 0xd8) return inspectJpeg(buf);
  if (buf.toString('ascii', 0, 4) === 'RIFF') return inspectWebp(buf);
  throw new ImageError('IMAGE_UNSUPPORTED', 'Format non pris en charge : utilisez PNG, JPEG ou WebP.');
}

/** Vérifie qu'un fichier de production correspond exactement à la géométrie attendue. */
export function assertProductionPng(buf: Buffer, expected: { width: number; height: number; dpi: number }): ImageInfo {
  const info = inspectImage(buf);
  if (info.mime !== 'image/png') throw new ImageError('PRODUCTION_PNG', 'Le fichier de production doit être un PNG.');
  if (Math.abs(info.width - expected.width) > 2 || Math.abs(info.height - expected.height) > 2) {
    throw new ImageError('PRODUCTION_SIZE', `Dimensions ${info.width}×${info.height} px au lieu de ${expected.width}×${expected.height} px.`);
  }
  if (info.dpiX == null || info.dpiY == null) {
    throw new ImageError('PRODUCTION_DPI', 'Le PNG doit déclarer sa résolution (chunk pHYs).');
  }
  if (Math.abs(info.dpiX - expected.dpi) > 1 || Math.abs(info.dpiY - expected.dpi) > 1) {
    throw new ImageError('PRODUCTION_DPI', `Résolution ${info.dpiX.toFixed(0)} DPI au lieu de ${expected.dpi} DPI.`);
  }
  return info;
}

/**
 * Ajoute (ou remplace) le chunk pHYs d'un PNG. Utilisé par le navigateur pour que les fichiers
 * de production portent réellement leur DPI, et par les tests.
 */
export function withPngDpi(buf: Buffer, dpi: number): Buffer {
  const chunks = readPngChunks(buf);
  const ppm = Math.round(dpi / 0.0254);
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(ppm, 0); phys.writeUInt32BE(ppm, 4); phys[8] = 1;
  const makeChunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const out: Buffer[] = [buf.subarray(0, 8)];
  let inserted = false;
  for (const c of chunks) {
    if (c.type === 'pHYs') continue;
    if (!inserted && c.type !== 'IHDR') { out.push(makeChunk('pHYs', phys)); inserted = true; }
    out.push(buf.subarray(c.offset, c.offset + 12 + c.data.length));
  }
  if (!inserted) out.push(makeChunk('pHYs', phys));
  return Buffer.concat(out);
}

export const checksum = (buf: Buffer): string => crypto.createHash('sha256').update(buf).digest('hex');
