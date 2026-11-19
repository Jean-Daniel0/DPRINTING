// Moteur de tarification : calcul déterministe en centimes entiers.
// Il est utilisé par le serveur (source de vérité) et par l'interface (affichage).
// Aucun prix envoyé par le client n'est jamais accepté : le serveur recalcule tout.
import { PRINT_METHODS, type MaterialId, type PrintMethodId, type ProductDef } from './catalog';

export type PrintMethodPricing = {
  /** Coût fixe par ligne de commande (réglage de la machine, film, cadre…), en centimes. */
  setupCents: number;
  /** Coût de base par zone imprimée, en centimes. */
  baseCents: number;
  /** Coût par dm² (100 cm²) de zone imprimée, en centimes. */
  perDm2Cents: number;
};

export type QuantityTier = { minQty: number; discountPct: number };

export type PricingRules = {
  currency: 'EUR';
  /** Prix du produit nu, taille de référence. */
  basePriceCents: number;
  /** Supplément par taille (centimes). Absent = 0. */
  sizeSurchargeCents: Record<string, number>;
  /** Supplément par couleur (centimes). Absent = 0. */
  colorSurchargeCents: Record<string, number>;
  methods: Partial<Record<PrintMethodId, PrintMethodPricing>>;
  /** Paliers dégressifs, triés par minQty croissant. Le pourcentage s'applique hors frais de mise en route. */
  tiers: QuantityTier[];
  minQty: number;
  maxQty: number;
  /** Nombre maximum de zones imprimées simultanément pour une ligne. */
  maxZones: number;
};

export type QuoteVariant = { colorId: string; sizeId: string | null; quantity: number };
export type QuoteZone = { zoneId: string; widthMm: number; heightMm: number };

export type QuoteRequest = {
  product: ProductDef;
  printMethod: PrintMethodId;
  material: MaterialId;
  variants: QuoteVariant[];
  zones: QuoteZone[];
};

export type VariantQuote = QuoteVariant & {
  unitPriceCents: number;
  lineTotalCents: number;
};

export type QuoteBreakdownLine = { label: string; amountCents: number };

export type QuoteResult = {
  currency: 'EUR';
  quantity: number;
  variants: VariantQuote[];
  unitBaseCents: number;
  printCentsPerUnit: number;
  unitPriceCents: number;
  setupCents: number;
  subtotalCents: number;
  discountPct: number;
  discountCents: number;
  totalCents: number;
  breakdown: QuoteBreakdownLine[];
  warnings: string[];
};

export type PricingErrorCode =
  | 'EMPTY_VARIANTS'
  | 'INVALID_QUANTITY'
  | 'UNKNOWN_COLOR'
  | 'UNKNOWN_SIZE'
  | 'MATERIAL_NOT_AVAILABLE'
  | 'METHOD_NOT_AVAILABLE'
  | 'METHOD_NOT_PRICED'
  | 'ZONE_UNKNOWN'
  | 'ZONE_TOO_LARGE'
  | 'TOO_MANY_ZONES'
  | 'NO_ZONE';

export class PricingError extends Error {
  constructor(readonly code: PricingErrorCode, message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

export const areaDm2 = (widthMm: number, heightMm: number): number => (widthMm * heightMm) / 10_000;

/** Palier applicable : celui dont le seuil est le plus élevé sans dépasser la quantité. */
export function discountPctFor(tiers: QuantityTier[], quantity: number): number {
  let pct = 0;
  for (const t of [...tiers].sort((a, b) => a.minQty - b.minQty)) {
    if (quantity >= t.minQty) pct = t.discountPct;
  }
  return Math.min(100, Math.max(0, pct));
}

const clampInt = (v: number): number => Math.max(0, Math.round(v));

/**
 * Calcule le prix d'une ligne (un produit, une méthode, un design, plusieurs variantes).
 * La remise dégressive porte sur la quantité totale de la ligne, hors frais de mise en route.
 */
export function quote(req: QuoteRequest): QuoteResult {
  const { product, printMethod, material, variants, zones } = req;
  const rules = product.pricing;
  if (!rules) throw new PricingError('METHOD_NOT_PRICED', 'Ce produit ne possède pas de grille tarifaire.');
  if (!product.methods.includes(printMethod)) {
    throw new PricingError('METHOD_NOT_AVAILABLE', "Cette méthode d'impression n'est pas compatible avec ce produit.");
  }
  const methodInfo = PRINT_METHODS[printMethod];
  if (!methodInfo?.productionReady) {
    throw new PricingError(
      'METHOD_NOT_AVAILABLE',
      methodInfo?.statusNote ?? "Cette méthode d'impression n'est pas encore disponible à la commande.",
    );
  }
  if (product.materials.length && !product.materials.includes(material)) {
    throw new PricingError('MATERIAL_NOT_AVAILABLE', "Ce matériau n'est pas proposé pour ce produit.");
  }
  const method = rules.methods[printMethod];
  if (!method) throw new PricingError('METHOD_NOT_PRICED', "Cette méthode n'a pas encore de tarif configuré.");

  if (!variants.length) throw new PricingError('EMPTY_VARIANTS', 'Sélectionnez au moins une variante.');
  if (!zones.length) throw new PricingError('NO_ZONE', 'Le design ne contient aucune zone imprimée.');
  if (zones.length > rules.maxZones) {
    throw new PricingError('TOO_MANY_ZONES', `Ce produit accepte au maximum ${rules.maxZones} zone(s) imprimée(s).`);
  }

  let quantity = 0;
  const seen = new Set<string>();
  for (const v of variants) {
    if (!Number.isInteger(v.quantity) || v.quantity < 1 || v.quantity > rules.maxQty) {
      throw new PricingError('INVALID_QUANTITY', `La quantité doit être un entier entre 1 et ${rules.maxQty}.`);
    }
    if (!product.colors.some(c => c.id === v.colorId)) {
      throw new PricingError('UNKNOWN_COLOR', `Couleur inconnue : ${v.colorId}.`);
    }
    if (product.sizes.length) {
      if (!v.sizeId || !product.sizes.includes(v.sizeId)) {
        throw new PricingError('UNKNOWN_SIZE', `Taille inconnue : ${v.sizeId ?? '—'}.`);
      }
    } else if (v.sizeId !== null) {
      throw new PricingError('UNKNOWN_SIZE', 'Ce produit ne se décline pas en tailles.');
    }
    const key = `${v.colorId}/${v.sizeId ?? '-'}`;
    if (seen.has(key)) throw new PricingError('INVALID_QUANTITY', `Variante en double : ${key}.`);
    seen.add(key);
    quantity += v.quantity;
  }
  if (quantity < rules.minQty) {
    throw new PricingError('INVALID_QUANTITY', `La quantité minimum est de ${rules.minQty} unité(s).`);
  }
  if (quantity > rules.maxQty) {
    throw new PricingError('INVALID_QUANTITY', `La quantité maximum par ligne est de ${rules.maxQty} unités.`);
  }

  let printCentsPerUnit = 0;
  const zoneNames: string[] = [];
  for (const z of zones) {
    const zone = product.zones.find(pz => pz.id === z.zoneId);
    if (!zone) throw new PricingError('ZONE_UNKNOWN', `Zone inconnue : ${z.zoneId}.`);
    if (!(z.widthMm > 0) || !(z.heightMm > 0)) {
      throw new PricingError('ZONE_TOO_LARGE', `Dimensions invalides pour la zone ${z.zoneId}.`);
    }
    // Tolérance de 0,5 mm pour les arrondis de l'éditeur, jamais au-delà de la zone définie.
    if (z.widthMm > zone.widthMm + 0.5 || z.heightMm > zone.heightMm + 0.5) {
      throw new PricingError('ZONE_TOO_LARGE', `Le design dépasse la zone imprimable « ${zone.label} ».`);
    }
    const cost = method.baseCents + clampInt(areaDm2(z.widthMm, z.heightMm) * method.perDm2Cents);
    printCentsPerUnit += cost;
    zoneNames.push(`${zone.label} ${Math.round(z.widthMm)}×${Math.round(z.heightMm)} mm`);
  }

  // Le supplément de taille dépend de la variante : on calcule chaque variante séparément.
  const variantQuotes: VariantQuote[] = variants.map(v => {
    const sizeExtra = v.sizeId ? rules.sizeSurchargeCents[v.sizeId] ?? 0 : 0;
    const colorExtra = rules.colorSurchargeCents[v.colorId] ?? 0;
    const unitBase = rules.basePriceCents + sizeExtra + colorExtra;
    const unit = unitBase + printCentsPerUnit;
    return { ...v, unitPriceCents: unit, lineTotalCents: unit * v.quantity };
  });

  const baseTotal = variantQuotes.reduce((sum, v) => sum + v.lineTotalCents, 0);
  const setupCents = method.setupCents;
  const subtotalCents = baseTotal + setupCents;
  const discountPct = discountPctFor(rules.tiers, quantity);
  const discountCents = clampInt((baseTotal * discountPct) / 100);
  const totalCents = subtotalCents - discountCents;

  // Base « à partir de » : la variante la moins chère, hors mise en route et remise.
  const unitBaseCents = Math.min(...variantQuotes.map(v => v.unitPriceCents));

  const breakdown: QuoteBreakdownLine[] = [
    { label: `Produit (${quantity} unité${quantity > 1 ? 's' : ''})`, amountCents: baseTotal - printCentsPerUnit * quantity },
    { label: `Impression ${zoneNames.join(' + ')}`, amountCents: printCentsPerUnit * quantity },
  ];
  if (setupCents) breakdown.push({ label: "Frais de mise en route", amountCents: setupCents });
  if (discountCents) breakdown.push({ label: `Remise quantité −${discountPct} %`, amountCents: -discountCents });

  const warnings: string[] = [];
  if (quantity < 6) warnings.push('À partir de 6 unités, une remise quantité s’applique automatiquement.');

  return {
    currency: rules.currency,
    quantity,
    variants: variantQuotes,
    unitBaseCents,
    printCentsPerUnit,
    unitPriceCents: unitBaseCents,
    setupCents,
    subtotalCents,
    discountPct,
    discountCents,
    totalCents,
    breakdown,
    warnings,
  };
}

/** Formatage d'affichage uniquement ; tous les calculs restent en centimes entiers. */
export function formatMoney(cents: number, currency = 'EUR', locale = 'fr-FR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

export const sizeSurcharge = (rules: PricingRules, sizeId: string | null): number =>
  sizeId ? rules.sizeSurchargeCents[sizeId] ?? 0 : 0;
