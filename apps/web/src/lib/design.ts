import {
  PRINT_METHODS, printedZones, productionPixels, quote, renderLayers, type DesignDocument,
  type PrintedZone, type PrintMethodId, type ProductDef, type PrintZone, type ZoneDesign,
} from '@dprinting/core';
import { peekImage, registerAsset } from './images';

/** Dessine une zone complète (toute la surface imprimable) dans un canvas, en px/mm. */
export function paintZone(
  canvas: HTMLCanvasElement,
  zone: PrintZone,
  design: ZoneDesign | undefined,
  ppm: number,
  urls: Record<string, string> = {},
): void {
  const w = Math.max(1, Math.round(zone.widthMm * ppm));
  const h = Math.max(1, Math.round(zone.heightMm * ppm));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.scale(1, 1);
  renderLayers(ctx, design?.layers ?? [], id => {
    if (urls[id]) registerAsset(id, urls[id]);
    return peekImage(id) ?? null;
  }, ppm);
  ctx.restore();
}

export function createPrintCanvas(zone: PrintZone, ppm = 4): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(zone.widthMm * ppm));
  c.height = Math.max(1, Math.round(zone.heightMm * ppm));
  return c;
}

export function emptyDocumentFor(product: ProductDef): DesignDocument {
  const zones: Record<string, ZoneDesign> = {};
  for (const z of product.zones) zones[z.id] = { layers: [] };
  return { version: 1, productId: product.id, printMethod: firstOrderableMethod(product) ?? 'dtf', zones };
}

export function firstOrderableMethod(product: ProductDef): PrintMethodId | null {
  return product.methods.find(m => PRINT_METHODS[m].productionReady && product.pricing.methods[m]) ?? null;
}

/** Estimation « à partir de » pour le catalogue : une impression 100 × 100 mm, une unité. */
export function fromPriceCents(product: ProductDef): number | null {
  const method = firstOrderableMethod(product);
  const zone = product.zones[0];
  if (!method || !zone) return null;
  const sizeId = product.sizes.length ? product.sizes[Math.min(2, product.sizes.length - 1)] : null;
  const color = product.colors[0];
  try {
    const q = quote({
      product, printMethod: method, material: product.defaultMaterial,
      variants: [{ colorId: color.id, sizeId, quantity: 1 }],
      zones: [{ zoneId: zone.id, widthMm: Math.min(100, zone.widthMm), heightMm: Math.min(100, zone.heightMm) }],
    });
    return q.totalCents;
  } catch {
    return null;
  }
}

export function zonesForPricing(document: DesignDocument, product: ProductDef): PrintedZone[] {
  const method = PRINT_METHODS[(document.printMethod as PrintMethodId)] ?? PRINT_METHODS.dtf;
  return printedZones(document, product, method.minDpi);
}

// ---------------------------------------------------------------------------
// PNG : ajout du chunk pHYs pour que le DPI soit réellement inscrit dans le fichier
// ---------------------------------------------------------------------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Insère (ou remplace) pHYs juste après IHDR. Les CRC de tous les chunks sont recalculés. */
export function withPngDpi(input: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const out: Uint8Array[] = [input.subarray(0, 8)];
  const enc = new TextEncoder();
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const head = new Uint8Array(8);
    new DataView(head.buffer).setUint32(0, data.length);
    head.set(enc.encode(type), 4);
    const td = new Uint8Array(4 + data.length);
    td.set(head.subarray(4), 0); td.set(data, 4);
    const crc = new Uint8Array(4);
    new DataView(crc.buffer).setUint32(0, crc32(td));
    return new Uint8Array([...head, ...data, ...crc]);
  };
  const phys = new Uint8Array(9);
  const dv = new DataView(phys.buffer);
  dv.setUint32(0, ppm); dv.setUint32(4, ppm); phys[8] = 1;

  let p = 8;
  let inserted = false;
  while (p + 12 <= input.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(input[p + 4], input[p + 5], input[p + 6], input[p + 7]);
    const total = 12 + len;
    if (type !== 'pHYs') out.push(input.subarray(p, p + total));
    if (!inserted && type !== 'IHDR') { out.push(chunk('pHYs', phys)); inserted = true; }
    p += total;
    if (type === 'IEND') break;
  }
  if (!inserted) out.push(chunk('pHYs', phys));
  const size = out.reduce((s, b) => s + b.length, 0);
  const merged = new Uint8Array(size);
  let o = 0;
  for (const b of out) { merged.set(b, o); o += b.length; }
  return merged;
}

/** Rendu d'un fichier de production : dimensions physiques exactes, transparence, DPI réel. */
export async function renderProductionPng(
  doc: DesignDocument,
  product: ProductDef,
  zone: PrintedZone,
  urls: Record<string, string>,
  dpi?: number,
): Promise<{ blob: Blob; width: number; height: number; dpi: number }> {
  const resolution = dpi ?? zone.dpi;
  const px = productionPixels(zone.widthMm, zone.heightMm, resolution);
  if (px.width * px.height > 42_000_000) {
    throw new Error(`Le fichier de production serait trop grand (${px.width}×${px.height} px). Réduisez le design ou la résolution.`);
  }
  await (globalThis.document as Document).fonts?.ready;
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = px.width; canvas.height = px.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible.');
  ctx.clearRect(0, 0, px.width, px.height);
  const ppm = resolution / 25.4;
  ctx.save();
  ctx.translate(-zone.xMm * ppm, -zone.yMm * ppm);
  renderLayers(ctx, doc.zones[zone.zoneId]?.layers ?? [], id => {
    if (urls[id]) registerAsset(id, urls[id]);
    return peekImage(id) ?? null;
  }, ppm);
  ctx.restore();
  const raw = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b: Blob | null) => b ? resolve(b) : reject(new Error('Encodage PNG impossible.')), 'image/png'));
  const bytes = new Uint8Array(await raw.arrayBuffer());
  const withDpi = withPngDpi(bytes, resolution);
  const copy = new Uint8Array(withDpi.byteLength);
  copy.set(withDpi);
  return { blob: new Blob([copy.buffer as ArrayBuffer], { type: 'image/png' }), width: px.width, height: px.height, dpi: resolution };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadUrl(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(String(res.status));
    downloadBlob(await res.blob(), filename);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

