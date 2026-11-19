// Validation stricte d'un document de design reçu par le serveur.
// Le studio applique déjà ces règles, mais le serveur ne fait confiance à aucun client.
import type { DesignDocument, ImageLayer, Layer, ShapeLayer, TextLayer, ZoneDesign } from './document';
import type { ProductDef } from './catalog';
import { layerBounds } from './geometry2d';

export type ValidationResult =
  | { ok: true; document: DesignDocument }
  | { ok: false; errors: string[] };

const MAX_LAYERS_PER_ZONE = 60;
const MAX_TEXT_LENGTH = 500;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const isColor = (v: unknown): v is string => v === 'transparent' || (typeof v === 'string' && HEX.test(v));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

const baseErrors = (path: string, l: Layer): string[] => {
  const e: string[] = [];
  if (!isStr(l.id, 80)) e.push(`${path}.id invalide`);
  if (!isStr(l.name, 120)) e.push(`${path}.name invalide`);
  for (const k of ['x', 'y', 'width', 'height', 'rotation'] as const) if (!isNum(l[k])) e.push(`${path}.${k} invalide`);
  if (isNum(l.width) && (l.width < 2 || l.width > 5000)) e.push(`${path}.width hors limites`);
  if (isNum(l.height) && (l.height < 0.01 || l.height > 5000)) e.push(`${path}.height hors limites`);
  if (isNum(l.x) && Math.abs(l.x) > 10000) e.push(`${path}.x hors limites`);
  if (isNum(l.y) && Math.abs(l.y) > 10000) e.push(`${path}.y hors limites`);
  if (!isNum(l.opacity) || l.opacity < 0 || l.opacity > 1) e.push(`${path}.opacity invalide`);
  if (!isBool(l.visible) || !isBool(l.locked)) e.push(`${path} : visible/locked invalide`);
  return e;
};

function validateLayer(l: unknown, path: string): string[] {
  if (!l || typeof l !== 'object') return [`${path} : calque invalide`];
  const layer = l as Layer;
  if (!['image', 'text', 'shape'].includes(layer.type)) return [`${path}.type inconnu`];
  const e = baseErrors(path, layer);
  if (layer.type === 'image') {
    const i = layer as ImageLayer;
    if (!isStr(i.assetId, 80)) e.push(`${path}.assetId invalide`);
    if (!isNum(i.naturalWidth) || i.naturalWidth <= 0) e.push(`${path}.naturalWidth invalide`);
    if (!isNum(i.naturalHeight) || i.naturalHeight <= 0) e.push(`${path}.naturalHeight invalide`);
    if (!isBool(i.flipX) || !isBool(i.flipY)) e.push(`${path} : flipX/flipY invalide`);
  } else if (layer.type === 'text') {
    const tl = layer as TextLayer;
    if (typeof tl.text !== 'string' || tl.text.length > MAX_TEXT_LENGTH) e.push(`${path}.text invalide`);
    if (!isStr(tl.fontFamily, 80)) e.push(`${path}.fontFamily invalide`);
    if (!isNum(tl.fontWeight) || tl.fontWeight < 100 || tl.fontWeight > 900) e.push(`${path}.fontWeight invalide`);
    if (!isBool(tl.italic)) e.push(`${path}.italic invalide`);
    if (!isNum(tl.fontSize) || tl.fontSize < 1 || tl.fontSize > 400) e.push(`${path}.fontSize invalide`);
    if (!isColor(tl.fill)) e.push(`${path}.fill invalide`);
    if (!['left', 'center', 'right'].includes(tl.align)) e.push(`${path}.align invalide`);
    if (!isNum(tl.letterSpacing) || Math.abs(tl.letterSpacing) > 50) e.push(`${path}.letterSpacing invalide`);
    if (!isNum(tl.lineHeight) || tl.lineHeight < 0.5 || tl.lineHeight > 4) e.push(`${path}.lineHeight invalide`);
  } else {
    const s = layer as ShapeLayer;
    if (!['rect', 'ellipse', 'triangle', 'star', 'line'].includes(s.shape)) e.push(`${path}.shape invalide`);
    if (s.fill !== null && !isColor(s.fill)) e.push(`${path}.fill invalide`);
    if (s.stroke !== null && !isColor(s.stroke)) e.push(`${path}.stroke invalide`);
    if (!isNum(s.strokeWidth) || s.strokeWidth < 0 || s.strokeWidth > 100) e.push(`${path}.strokeWidth invalide`);
    if (!isNum(s.cornerRadius) || s.cornerRadius < 0 || s.cornerRadius > 500) e.push(`${path}.cornerRadius invalide`);
  }
  return e;
}

/** Vérifie le document complet contre le produit réel (zones, bornes, types, couleurs). */
export function validateDesign(input: unknown, product: ProductDef): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['Document absent ou invalide.'] };
  const doc = input as DesignDocument;
  if (doc.version !== 1) errors.push('Version de document non prise en charge.');
  if (doc.productId !== product.id) errors.push('Le document ne correspond pas au produit sélectionné.');
  if (!isStr(doc.printMethod, 40)) errors.push('Méthode d’impression invalide.');
  if (!doc.zones || typeof doc.zones !== 'object') return { ok: false, errors: [...errors, 'Zones absentes.'] };

  for (const zoneId of Object.keys(doc.zones)) {
    if (!product.zones.some(z => z.id === zoneId)) { errors.push(`Zone inconnue : ${zoneId}.`); continue; }
  }
  for (const zone of product.zones) {
    const z = doc.zones[zone.id] as ZoneDesign | undefined;
    if (!z) continue;
    if (!Array.isArray(z.layers)) { errors.push(`Zone ${zone.id} : calques invalides.`); continue; }
    if (z.layers.length > MAX_LAYERS_PER_ZONE) errors.push(`Zone ${zone.id} : ${MAX_LAYERS_PER_ZONE} calques maximum.`);
    const ids = new Set<string>();
    z.layers.forEach((layer, i) => {
      const path = `${zone.id}[${i}]`;
      errors.push(...validateLayer(layer, path));
      if (layer && typeof layer === 'object') {
        if (ids.has(layer.id)) errors.push(`${path} : identifiant de calque en double.`);
        ids.add(layer.id);
        if (layer.type === 'image' && !isStr((layer as ImageLayer).assetId, 80)) {
          // déjà signalé, mais on évite un accès non contrôlé plus bas
        }
        if (isNum(layer.x) && isNum(layer.y) && isNum(layer.width) && isNum(layer.height) && isNum(layer.rotation)) {
          const b = layerBounds(layer);
          const tol = 0.6;
          if (b.minX < -tol || b.minY < -tol || b.maxX > zone.widthMm + tol || b.maxY > zone.heightMm + tol) {
            errors.push(`${path} : le calque sort de la zone imprimable.`);
          }
        }
      }
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, document: doc };
}

/** Identifiants d'images référencés par un document (pour vérifier leur existence). */
export function designAssetIds(doc: DesignDocument): string[] {
  const ids = new Set<string>();
  for (const zone of Object.values(doc.zones)) {
    for (const l of zone.layers ?? []) if (l.type === 'image' && l.assetId) ids.add(l.assetId);
  }
  return [...ids];
}
