// Catalogue : produits, zones d'impression, couleurs, matériaux et compatibilité produit/méthode d'impression.
export type PrintMethodId = 'dtf' | 'dtg' | 'sublimation' | 'screen' | 'vinyl' | 'embroidery';
export type MaterialId = 'cotton' | 'polyester' | 'blend' | 'ceramic';

export type PrintMethodInfo = { id: PrintMethodId; name: string; minDpi: number; transparency: boolean; fullColor: boolean; maxColors?: number };
export const PRINT_METHODS: Record<PrintMethodId, PrintMethodInfo> = {
  dtf: { id: 'dtf', name: 'DTF', minDpi: 300, transparency: true, fullColor: true },
  dtg: { id: 'dtg', name: 'DTG (impression directe)', minDpi: 300, transparency: true, fullColor: true },
  sublimation: { id: 'sublimation', name: 'Sublimation', minDpi: 300, transparency: false, fullColor: true },
  screen: { id: 'screen', name: 'Sérigraphie', minDpi: 300, transparency: true, fullColor: false, maxColors: 6 },
  vinyl: { id: 'vinyl', name: 'Vinyle thermocollant', minDpi: 200, transparency: true, fullColor: false, maxColors: 3 },
  embroidery: { id: 'embroidery', name: 'Broderie', minDpi: 200, transparency: false, fullColor: false, maxColors: 6 },
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
  category: string;
  model: 'tshirt';
  materials: MaterialId[];
  defaultMaterial: MaterialId;
  methods: PrintMethodId[];
  zones: PrintZone[];
  colors: ColorOption[];
  sizes: string[];
};

export const TSHIRT_COLORS: ColorOption[] = [
  { id: 'white', name: 'Blanc', hex: '#f5f5f2' }, { id: 'black', name: 'Noir', hex: '#16181d' }, { id: 'navy', name: 'Bleu marine', hex: '#1b2a4a' },
  { id: 'royal', name: 'Bleu roi', hex: '#1f4fb4' }, { id: 'red', name: 'Rouge', hex: '#c62828' }, { id: 'green', name: 'Vert', hex: '#1e7a4a' },
  { id: 'yellow', name: 'Jaune', hex: '#f2c230' }, { id: 'orange', name: 'Orange', hex: '#e8731c' }, { id: 'pink', name: 'Rose', hex: '#e58fb3' },
  { id: 'grey', name: 'Gris chiné', hex: '#9aa0a6' }, { id: 'sand', name: 'Sable', hex: '#d8c7a3' }, { id: 'purple', name: 'Violet', hex: '#6a3fa0' },
];

export const TSHIRT: ProductDef = {
  id: 'tshirt', name: 'T-shirt', category: 'Vêtements', model: 'tshirt',
  materials: ['cotton', 'polyester', 'blend'], defaultMaterial: 'cotton',
  methods: ['dtf', 'dtg', 'screen', 'vinyl', 'embroidery', 'sublimation'],
  zones: [
    { id: 'front', label: 'Devant', widthMm: 300, heightMm: 400, panel: 'front', offsetTopMm: 70 },
    { id: 'back', label: 'Dos', widthMm: 300, heightMm: 400, panel: 'back', offsetTopMm: 60 },
  ],
  colors: TSHIRT_COLORS,
  sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
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

export type MethodAvailability = { method: PrintMethodId; ok: boolean; reason?: string };

/** Quelles méthodes d'impression sont réellement possibles pour ce produit, ce matériau et cette couleur. */
export function printMethodAvailability(product: ProductDef, material: MaterialId, colorHex: string): MethodAvailability[] {
  return product.methods.map((method): MethodAvailability => {
    if (method === 'sublimation') {
      if (material !== 'polyester') return { method, ok: false, reason: 'La sublimation exige un tissu 100 % polyester.' };
      if (luminance(colorHex) < 0.8) return { method, ok: false, reason: 'La sublimation ne se voit que sur un tissu blanc ou très clair.' };
    }
    if (method === 'dtg' && material === 'polyester') return { method, ok: false, reason: "L'impression directe (DTG) convient au coton, pas au polyester." };
    return { method, ok: true };
  });
}
