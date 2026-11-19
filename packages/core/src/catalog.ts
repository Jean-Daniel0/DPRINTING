// Catalogue : produits, zones d'impression, couleurs, matériaux et compatibilité produit/méthode d'impression.
import type { PricingRules } from './pricing';

export type PrintMethodId = 'dtf' | 'dtg' | 'sublimation' | 'screen' | 'vinyl' | 'embroidery';
export type MaterialId = 'cotton' | 'polyester' | 'blend' | 'ceramic';

export type PrintMethodInfo = {
  id: PrintMethodId;
  name: string;
  /** Le fichier de production est réellement généré et accepté par la chaîne de fabrication. */
  productionReady: boolean;
  /** Explication affichée quand la méthode est disponible dans le catalogue mais pas encore à la commande. */
  statusNote?: string;
  minDpi: number;
  transparency: boolean;
  fullColor: boolean;
  maxColors?: number;
};

export const PRINT_METHODS: Record<PrintMethodId, PrintMethodInfo> = {
  dtf: { id: 'dtf', name: 'DTF', productionReady: true, minDpi: 300, transparency: true, fullColor: true },
  dtg: { id: 'dtg', name: 'DTG (impression directe)', productionReady: true, minDpi: 300, transparency: true, fullColor: true },
  sublimation: { id: 'sublimation', name: 'Sublimation', productionReady: true, minDpi: 300, transparency: true, fullColor: true },
  screen: { id: 'screen', name: 'Sérigraphie', productionReady: false, statusNote: 'Préparation des films de séparation en cours de développement (Phase 5).', minDpi: 300, transparency: true, fullColor: false, maxColors: 6 },
  vinyl: { id: 'vinyl', name: 'Vinyle thermocollant', productionReady: false, statusNote: 'Découpe vectorielle en cours de développement (Phase 5).', minDpi: 200, transparency: true, fullColor: false, maxColors: 3 },
  embroidery: { id: 'embroidery', name: 'Broderie', productionReady: false, statusNote: 'Conversion en points de broderie (DST) en cours de développement (Phase 5).', minDpi: 200, transparency: true, fullColor: false, maxColors: 6 },
};

export type PrintZone = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  panel: 'front' | 'back' | 'sleeveL' | 'sleeveR' | 'surface';
  /** Distance (mm, mesurée sur le tissu) entre le bas du col et le haut de la zone imprimable. */
  offsetTopMm: number;
};

export type ColorOption = { id: string; name: string; hex: string };
export type ProductDef = {
  id: string;
  name: string;
  description: string;
  category: string;
  /** Modèle 3D procédural utilisé par le studio. Les produits qui partagent un modèle n'ont besoin d'aucun code. */
  model: 'tshirt';
  active: boolean;
  materials: MaterialId[];
  defaultMaterial: MaterialId;
  methods: PrintMethodId[];
  zones: PrintZone[];
  colors: ColorOption[];
  sizes: string[];
  pricing: PricingRules;
};

export const MATERIAL_LABELS: Record<MaterialId, string> = {
  cotton: 'Coton 100 %',
  polyester: 'Polyester 100 %',
  blend: 'Mélange coton/polyester',
  ceramic: 'Céramique',
};

export const TSHIRT_COLORS: ColorOption[] = [
  { id: 'white', name: 'Blanc', hex: '#f5f5f2' }, { id: 'black', name: 'Noir', hex: '#16181d' }, { id: 'navy', name: 'Bleu marine', hex: '#1b2a4a' },
  { id: 'royal', name: 'Bleu roi', hex: '#1f4fb4' }, { id: 'red', name: 'Rouge', hex: '#c62828' }, { id: 'green', name: 'Vert', hex: '#1e7a4a' },
  { id: 'yellow', name: 'Jaune', hex: '#f2c230' }, { id: 'orange', name: 'Orange', hex: '#e8731c' }, { id: 'pink', name: 'Rose', hex: '#e58fb3' },
  { id: 'grey', name: 'Gris chiné', hex: '#9aa0a6' }, { id: 'sand', name: 'Sable', hex: '#d8c7a3' }, { id: 'purple', name: 'Violet', hex: '#6a3fa0' },
];

export const TSHIRT: ProductDef = {
  id: 'tshirt',
  name: 'T-shirt',
  description: 'T-shirt unisexe en jersey peigné, col rond renforcé, coupe droite. Personnalisable sur le devant et le dos.',
  category: 'Vêtements',
  model: 'tshirt',
  active: true,
  materials: ['cotton', 'polyester', 'blend'],
  defaultMaterial: 'cotton',
  // Sérigraphie, vinyle et broderie restent au catalogue mais ne sont pas commandables tant que leur
  // fichier de production spécifique n'est pas développé (Phase 5) : aucun bouton factice.
  methods: ['dtf', 'dtg', 'sublimation', 'screen', 'vinyl', 'embroidery'],
  zones: [
    { id: 'front', label: 'Devant', widthMm: 300, heightMm: 400, panel: 'front', offsetTopMm: 70 },
    { id: 'back', label: 'Dos', widthMm: 300, heightMm: 400, panel: 'back', offsetTopMm: 60 },
  ],
  colors: TSHIRT_COLORS,
  sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
  pricing: {
    currency: 'EUR',
    basePriceCents: 1190,
    sizeSurchargeCents: { XS: 0, S: 0, M: 0, L: 100, XL: 200, '2XL': 300, '3XL': 400 },
    colorSurchargeCents: {},
    methods: {
      dtf: { setupCents: 0, baseCents: 180, perDm2Cents: 22 },
      dtg: { setupCents: 0, baseCents: 250, perDm2Cents: 28 },
      sublimation: { setupCents: 0, baseCents: 150, perDm2Cents: 18 },
      screen: { setupCents: 1500, baseCents: 120, perDm2Cents: 15 },
      vinyl: { setupCents: 300, baseCents: 100, perDm2Cents: 10 },
      embroidery: { setupCents: 900, baseCents: 300, perDm2Cents: 40 },
    },
    tiers: [
      { minQty: 1, discountPct: 0 },
      { minQty: 6, discountPct: 8 },
      { minQty: 13, discountPct: 12 },
      { minQty: 25, discountPct: 18 },
      { minQty: 50, discountPct: 22 },
    ],
    minQty: 1,
    maxQty: 500,
    maxZones: 2,
  },
};

export const PRODUCTS: Record<string, ProductDef> = { tshirt: TSHIRT };

/** Luminosité perçue 0..1 d'une couleur #rrggbb. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export type MethodAvailability = {
  method: PrintMethodId;
  /** Compatible avec ce produit, ce matériau et cette couleur. */
  ok: boolean;
  reason?: string;
  /** Le fichier de production de cette méthode est réellement pris en charge aujourd'hui. */
  orderable: boolean;
  statusNote?: string;
};

/** Quelles méthodes d'impression sont réellement possibles pour ce produit, ce matériau et cette couleur. */
export function printMethodAvailability(product: ProductDef, material: MaterialId, colorHex: string): MethodAvailability[] {
  return product.methods.map((method): MethodAvailability => {
    const info = PRINT_METHODS[method];
    const base = { orderable: info.productionReady, statusNote: info.statusNote };
    if (method === 'sublimation') {
      if (material !== 'polyester') return { ...base, method, ok: false, reason: 'La sublimation exige un tissu 100 % polyester.' };
      if (luminance(colorHex) < 0.8) return { ...base, method, ok: false, reason: 'La sublimation ne se voit que sur un tissu blanc ou très clair.' };
    }
    if (method === 'dtg' && material === 'polyester') return { ...base, method, ok: false, reason: "L'impression directe (DTG) convient au coton, pas au polyester." };
    return { ...base, method, ok: true };
  });
}
