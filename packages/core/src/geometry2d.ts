import { Layer, MIN_LAYER_MM } from './document';
import { clamp, degToRad } from './units';

export type Point = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type Box = Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>;

const rot = (px: number, py: number, deg: number): Point => {
  const r = degToRad(deg), c = Math.cos(r), s = Math.sin(r);
  return { x: px * c - py * s, y: px * s + py * c };
};

/** Coins du calque après rotation (ordre : haut-gauche, haut-droite, bas-droite, bas-gauche). */
export function layerCorners(l: Box): Point[] {
  const hw = l.width / 2, hh = l.height / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([px, py]) => {
    const p = rot(px, py, l.rotation);
    return { x: l.x + p.x, y: l.y + p.y };
  });
}

export function layerBounds(l: Box): Bounds {
  const c = layerCorners(l);
  return { minX: Math.min(...c.map(p => p.x)), minY: Math.min(...c.map(p => p.y)), maxX: Math.max(...c.map(p => p.x)), maxY: Math.max(...c.map(p => p.y)) };
}

/** Point (en mm, repère de la zone) dans le calque tourné ? (pour la sélection au doigt/souris) */
export function pointInLayer(l: Box, px: number, py: number, pad = 0): boolean {
  const local = rot(px - l.x, py - l.y, -l.rotation);
  return Math.abs(local.x) <= l.width / 2 + pad && Math.abs(local.y) <= l.height / 2 + pad;
}

/** Le calque le plus haut sous le point (les calques masqués ou verrouillés sont ignorés si demandé). */
export function hitTest(layers: Layer[], px: number, py: number, pad = 1): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (!l.visible) continue;
    if (pointInLayer(l, px, py, pad)) return l;
  }
  return null;
}

/** Garde le calque entièrement dans la zone imprimable : réduit s'il est trop grand, puis le déplace. */
export function constrainToZone<T extends Box>(l: T, zone: { widthMm: number; heightMm: number }): T {
  let out = { ...l };
  let b = layerBounds(out);
  const bw = b.maxX - b.minX, bh = b.maxY - b.minY;
  const k = Math.min(1, zone.widthMm / bw, zone.heightMm / bh);
  if (k < 1) { out = { ...out, width: Math.max(MIN_LAYER_MM, out.width * k), height: Math.max(0.01, out.height * k) }; b = layerBounds(out); }
  let dx = 0, dy = 0;
  if (b.minX < 0) dx = -b.minX; else if (b.maxX > zone.widthMm) dx = zone.widthMm - b.maxX;
  if (b.minY < 0) dy = -b.minY; else if (b.maxY > zone.heightMm) dy = zone.heightMm - b.maxY;
  return dx || dy ? { ...out, x: out.x + dx, y: out.y + dy } : out;
}

/** Position d'un point de poignée dans le repère local (non tourné) du calque, relatif au centre. */
const handleVec: Record<Handle, [number, number]> = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
export const handlePoint = (l: Box, h: Handle): Point => {
  const [hx, hy] = handleVec[h];
  const p = rot((hx * l.width) / 2, (hy * l.height) / 2, l.rotation);
  return { x: l.x + p.x, y: l.y + p.y };
};

/**
 * Redimensionne en tirant une poignée vers le pointeur (mm). Le côté/coin opposé reste fixe.
 * keepAspect : conserve le rapport largeur/hauteur (poignées de coin). Le calcul se fait dans le repère tourné du calque.
 */
export function resizeFromHandle(l: Box, handle: Handle, pointer: Point, opts: { keepAspect?: boolean; fromCenter?: boolean } = {}): Pick<Layer, 'x' | 'y' | 'width' | 'height'> {
  const [hx, hy] = handleVec[handle];
  const local = rot(pointer.x - l.x, pointer.y - l.y, -l.rotation); // pointeur dans le repère du calque (centre = 0,0)
  const w0 = l.width, h0 = l.height;
  let w = w0, h = h0, cx = 0, cy = 0; // nouveau centre local

  if (opts.fromCenter) {
    if (hx !== 0) w = Math.abs(local.x) * 2;
    if (hy !== 0) h = Math.abs(local.y) * 2;
  } else {
    // bord fixe = opposé à la poignée
    if (hx !== 0) { const fixed = (-hx * w0) / 2; w = Math.abs(local.x - fixed); cx = (fixed + local.x) / 2; }
    if (hy !== 0) { const fixed = (-hy * h0) / 2; h = Math.abs(local.y - fixed); cy = (fixed + local.y) / 2; }
  }
  if (opts.keepAspect && hx !== 0 && hy !== 0) {
    const ratio = w0 / Math.max(h0, 0.0001);
    // on suit la dimension la plus « tirée »
    if (w / w0 >= h / h0) h = w / ratio; else w = h * ratio;
    if (!opts.fromCenter) { cx = (-hx * w0) / 2 + (hx * w) / 2; cy = (-hy * h0) / 2 + (hy * h) / 2; }
  }
  w = Math.max(MIN_LAYER_MM, w);
  h = Math.max(h0 < MIN_LAYER_MM ? 0.01 : MIN_LAYER_MM, h);
  const c = rot(cx, cy, l.rotation);
  return { x: l.x + c.x, y: l.y + c.y, width: w, height: h };
}

/** Angle (degrés) du centre du calque vers le pointeur, avec « 0° » vers le haut. Aimantation tous les 15° si snap. */
export function rotationFromPointer(center: Point, pointer: Point, snap = false): number {
  let a = (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI + 90;
  a = ((a % 360) + 360) % 360;
  if (snap) a = Math.round(a / 15) * 15 % 360;
  if (a > 180) a -= 360;
  return a;
}

export const clampOpacity = (v: number): number => clamp(v, 0, 1);
