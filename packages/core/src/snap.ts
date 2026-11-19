import { Layer } from './document';
import { layerBounds } from './geometry2d';

export type Guide = { axis: 'x' | 'y'; position: number; kind: 'zone-edge' | 'zone-center' | 'layer' };

/**
 * Guides d'alignement : aimante le calque en cours de déplacement sur les bords et le centre de la zone, et sur les
 * bords et centres des autres calques. Renvoie le décalage à appliquer (dx, dy) et les guides à afficher.
 */
export function snapLayer(moving: Layer, zone: { widthMm: number; heightMm: number }, others: Layer[], thresholdMm: number): { dx: number; dy: number; guides: Guide[] } {
  const b = layerBounds(moving);
  const mx = [b.minX, (b.minX + b.maxX) / 2, b.maxX];
  const my = [b.minY, (b.minY + b.maxY) / 2, b.maxY];
  type T = { pos: number; kind: Guide['kind'] };
  const tx: T[] = [{ pos: 0, kind: 'zone-edge' }, { pos: zone.widthMm / 2, kind: 'zone-center' }, { pos: zone.widthMm, kind: 'zone-edge' }];
  const ty: T[] = [{ pos: 0, kind: 'zone-edge' }, { pos: zone.heightMm / 2, kind: 'zone-center' }, { pos: zone.heightMm, kind: 'zone-edge' }];
  for (const o of others) {
    if (o.id === moving.id || !o.visible) continue;
    const ob = layerBounds(o);
    for (const p of [ob.minX, (ob.minX + ob.maxX) / 2, ob.maxX]) tx.push({ pos: p, kind: 'layer' });
    for (const p of [ob.minY, (ob.minY + ob.maxY) / 2, ob.maxY]) ty.push({ pos: p, kind: 'layer' });
  }
  const best = (vals: number[], targets: T[]): { d: number; t: T } | null => {
    let out: { d: number; t: T } | null = null;
    for (const v of vals) for (const t of targets) {
      const d = t.pos - v;
      if (Math.abs(d) <= thresholdMm && (!out || Math.abs(d) < Math.abs(out.d))) out = { d, t };
    }
    return out;
  };
  const sx = best(mx, tx), sy = best(my, ty);
  const guides: Guide[] = [];
  if (sx) guides.push({ axis: 'x', position: sx.t.pos, kind: sx.t.kind });
  if (sy) guides.push({ axis: 'y', position: sy.t.pos, kind: sy.t.kind });
  return { dx: sx ? sx.d : 0, dy: sy ? sy.d : 0, guides };
}
