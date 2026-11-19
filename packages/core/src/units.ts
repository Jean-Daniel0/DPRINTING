// Toutes les dimensions de design sont en millimètres (taille RÉELLE sur le produit). Les pixels n'existent qu'au moment du rendu.
export const MM_PER_INCH = 25.4;

/** Pixels par millimètre pour un DPI donné (300 DPI = 11,811 px/mm). */
export const ppmFromDpi = (dpi: number): number => dpi / MM_PER_INCH;
export const dpiFromPpm = (ppm: number): number => ppm * MM_PER_INCH;
export const mmToPx = (mm: number, dpi: number): number => (mm * dpi) / MM_PER_INCH;
export const pxToMm = (px: number, dpi: number): number => (px * MM_PER_INCH) / dpi;

/** Résolution effective d'une image placée : pixels de l'image par pouce imprimé. */
export function effectiveDpi(imagePx: number, printedMm: number): number {
  if (!(printedMm > 0)) return Infinity;
  return imagePx / (printedMm / MM_PER_INCH);
}

export type PrintQuality = 'good' | 'acceptable' | 'low';
/** >= 200 DPI : bon ; >= 120 : acceptable ; en dessous : l'impression sera floue. */
export function printQuality(dpi: number): PrintQuality {
  return dpi >= 200 ? 'good' : dpi >= 120 ? 'acceptable' : 'low';
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
export const degToRad = (d: number): number => (d * Math.PI) / 180;
export const roundTo = (v: number, step: number): number => Math.round(v / step) * step;
