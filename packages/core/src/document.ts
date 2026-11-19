// Document de design : la SEULE source de vérité. L'éditeur le modifie, la 3D et les exports le lisent.
// Repère d'une zone : origine = coin haut-gauche de la zone imprimable, x vers la droite, y vers le bas, en mm.
// x, y = centre du calque. rotation en degrés (sens horaire).

export type LayerBase = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number; // 0..1
  visible: boolean;
  locked: boolean;
};

export type ImageLayer = LayerBase & {
  type: 'image';
  assetId: string;
  naturalWidth: number;  // px
  naturalHeight: number; // px
  flipX: boolean;
  flipY: boolean;
};

export type TextLayer = LayerBase & {
  type: 'text';
  text: string;
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  fontSize: number;      // mm
  fill: string;
  align: 'left' | 'center' | 'right';
  letterSpacing: number; // mm
  lineHeight: number;    // multiplicateur
};

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'star' | 'line';
export type ShapeLayer = LayerBase & {
  type: 'shape';
  shape: ShapeKind;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;   // mm
  cornerRadius: number;  // mm (rect)
};

export type Layer = ImageLayer | TextLayer | ShapeLayer;
export type ZoneDesign = { layers: Layer[] }; // ordre du tableau = ordre d'empilement (dernier = dessus)

export type DesignDocument = {
  version: 1;
  productId: string;
  printMethod: string;
  zones: Record<string, ZoneDesign>;
};

export const MIN_LAYER_MM = 2;

let counter = 0;
export function newId(prefix = 'l'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function emptyDocument(productId: string, zoneIds: string[], printMethod = 'dtf'): DesignDocument {
  const zones: Record<string, ZoneDesign> = {};
  for (const z of zoneIds) zones[z] = { layers: [] };
  return { version: 1, productId, printMethod, zones };
}

const base = (name: string, x: number, y: number, width: number, height: number): LayerBase => ({
  id: newId(), name, x, y, width, height, rotation: 0, opacity: 1, visible: true, locked: false,
});

export function makeShape(shape: ShapeKind, x: number, y: number, size = 60, fill = '#111827'): ShapeLayer {
  const h = shape === 'line' ? 4 : size;
  return { ...base(shape === 'rect' ? 'Rectangle' : shape === 'ellipse' ? 'Ellipse' : shape === 'triangle' ? 'Triangle' : shape === 'star' ? 'Étoile' : 'Ligne', x, y, size, h),
    type: 'shape', shape, fill: shape === 'line' ? null : fill, stroke: shape === 'line' ? fill : null, strokeWidth: shape === 'line' ? 2 : 0, cornerRadius: 0 };
}

export function makeText(text: string, x: number, y: number, fontSize = 24, fill = '#111827'): TextLayer {
  // width/height sont recalculés par l'éditeur après mesure réelle du texte
  return { ...base('Texte', x, y, Math.max(20, text.length * fontSize * 0.55), fontSize * 1.2), type: 'text', text, fontFamily: 'Inter', fontWeight: 700, italic: false, fontSize, fill, align: 'center', letterSpacing: 0, lineHeight: 1.15 };
}

export function makeImage(assetId: string, naturalWidth: number, naturalHeight: number, x: number, y: number, maxMm: number, name = 'Image'): ImageLayer {
  const ratio = naturalWidth / naturalHeight;
  const width = ratio >= 1 ? maxMm : maxMm * ratio;
  const height = ratio >= 1 ? maxMm / ratio : maxMm;
  return { ...base(name, x, y, width, height), type: 'image', assetId, naturalWidth, naturalHeight, flipX: false, flipY: false };
}

// --- Opérations immuables sur le document (chaque fonction renvoie un NOUVEAU document) ---
const mapZone = (doc: DesignDocument, zoneId: string, fn: (layers: Layer[]) => Layer[]): DesignDocument => {
  const zone = doc.zones[zoneId];
  if (!zone) return doc;
  const layers = fn(zone.layers);
  if (layers === zone.layers) return doc; // aucun changement : on garde le même objet (pas d'étape d'historique inutile)
  return { ...doc, zones: { ...doc.zones, [zoneId]: { layers } } };
};

export const addLayer = (doc: DesignDocument, zoneId: string, layer: Layer): DesignDocument => mapZone(doc, zoneId, l => [...l, layer]);
export const removeLayer = (doc: DesignDocument, zoneId: string, id: string): DesignDocument => mapZone(doc, zoneId, l => l.filter(x => x.id !== id));
export const updateLayer = (doc: DesignDocument, zoneId: string, id: string, patch: Partial<Layer>): DesignDocument =>
  mapZone(doc, zoneId, l => l.map(x => (x.id === id ? ({ ...x, ...patch } as Layer) : x)));

export function duplicateLayer(doc: DesignDocument, zoneId: string, id: string, offsetMm = 8): { doc: DesignDocument; newId: string | null } {
  const src = doc.zones[zoneId]?.layers.find(l => l.id === id);
  if (!src) return { doc, newId: null };
  const copy: Layer = { ...src, id: newId(), name: `${src.name} (copie)`, x: src.x + offsetMm, y: src.y + offsetMm, locked: false };
  return { doc: addLayer(doc, zoneId, copy), newId: copy.id };
}

/** Change l'ordre d'empilement : direction > 0 vers le dessus, < 0 vers le dessous ; 'front'/'back' aux extrémités. */
export function moveLayer(doc: DesignDocument, zoneId: string, id: string, to: 'up' | 'down' | 'front' | 'back'): DesignDocument {
  return mapZone(doc, zoneId, layers => {
    const i = layers.findIndex(l => l.id === id);
    if (i < 0) return layers;
    const j = to === 'up' ? Math.min(layers.length - 1, i + 1) : to === 'down' ? Math.max(0, i - 1) : to === 'front' ? layers.length - 1 : 0;
    if (i === j) return layers;
    const next = layers.slice();
    const [item] = next.splice(i, 1);
    next.splice(j, 0, item);
    return next;
  });
}

export const findLayer = (doc: DesignDocument, zoneId: string, id: string): Layer | undefined => doc.zones[zoneId]?.layers.find(l => l.id === id);
export const countLayers = (doc: DesignDocument): number => Object.values(doc.zones).reduce((n, z) => n + z.layers.length, 0);
