// Zones réellement imprimées et préparation des fichiers de production.
import type { DesignDocument, Layer } from './document';
import type { PrintZone, ProductDef } from './catalog';
import { contentBounds } from './geometry2d';

export type PrintedZone = {
  zoneId: string;
  label: string;
  panel: PrintZone['panel'];
  /** Origine du contenu dans le repère de la zone (coin haut-gauche), en mm. */
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  /** Résolution cible du fichier de production. */
  dpi: number;
};

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Zones qui seront réellement imprimées : uniquement celles qui contiennent du contenu visible.
 * Les dimensions sont celles du contenu (arrondies à 0,1 mm), jamais celles de la zone maximale.
 */
export function printedZones(doc: DesignDocument, product: ProductDef, dpi = 300): PrintedZone[] {
  const out: PrintedZone[] = [];
  for (const zone of product.zones) {
    const layers: Layer[] = doc.zones[zone.id]?.layers ?? [];
    const b = contentBounds(layers);
    if (!b) continue;
    const x0 = Math.max(0, b.minX);
    const y0 = Math.max(0, b.minY);
    const x1 = Math.min(zone.widthMm, b.maxX);
    const y1 = Math.min(zone.heightMm, b.maxY);
    const widthMm = round1(x1 - x0);
    const heightMm = round1(y1 - y0);
    if (widthMm <= 0.1 || heightMm <= 0.1) continue;
    out.push({
      zoneId: zone.id,
      label: zone.label,
      panel: zone.panel,
      xMm: round1(x0),
      yMm: round1(y0),
      widthMm,
      heightMm,
      dpi,
    });
  }
  return out;
}

/** Pixels attendus pour un fichier de production (arrondi au pixel le plus proche). */
export function productionPixels(widthMm: number, heightMm: number, dpi: number): { width: number; height: number } {
  return { width: Math.round((widthMm * dpi) / 25.4), height: Math.round((heightMm * dpi) / 25.4) };
}

export const zoneOf = (product: ProductDef, zoneId: string): PrintZone | undefined =>
  product.zones.find(z => z.id === zoneId);
