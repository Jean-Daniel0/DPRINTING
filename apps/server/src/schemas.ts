import { z } from 'zod';

const slug = z.string().min(1).max(60).regex(/^[a-z0-9][a-z0-9-]*$/, 'identifiant en minuscules, chiffres et tirets');
const hex = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, 'couleur hexadécimale attendue');
const uuid = z.string().uuid();
const cents = z.number().int().min(0).max(10_000_000);

export const printMethodEnum = z.enum(['dtf', 'dtg', 'sublimation', 'screen', 'vinyl', 'embroidery']);
export const materialEnum = z.enum(['cotton', 'polyester', 'blend', 'ceramic']);

export const quotePayloadSchema = z.object({
  productId: slug,
  printMethod: printMethodEnum,
  material: materialEnum,
  variants: z.array(z.object({
    colorId: slug,
    sizeId: z.string().min(1).max(10).nullable(),
    quantity: z.number().int().min(1).max(500),
  }).strict()).min(1).max(100),
  zones: z.array(z.object({
    zoneId: slug,
    widthMm: z.number().finite().positive().max(2000),
    heightMm: z.number().finite().positive().max(2000),
  }).strict()).min(1).max(6),
}).strict();

export const designPayloadSchema = z.object({
  productId: slug,
  document: z.unknown(),
}).strict();

const customerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().max(200).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'adresse e-mail invalide'),
  phone: z.string().trim().min(5).max(30),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().min(2).max(20),
  city: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(60),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export const checkoutPayloadSchema = z.object({
  customer: customerSchema,
  items: z.array(z.object({
    productId: slug,
    printMethod: printMethodEnum,
    material: materialEnum,
    designId: uuid,
    variants: z.array(z.object({
      colorId: slug,
      sizeId: z.string().min(1).max(10).nullable(),
      quantity: z.number().int().min(1).max(500),
    }).strict()).min(1).max(100),
    previewColorId: slug,
    previews: z.object({
      face: uuid, back: uuid, left: uuid, right: uuid,
    }).strict(),
    productionAssets: z.array(z.object({ zoneId: slug, assetId: uuid }).strict()).max(6),
  }).strict()).min(1).max(20),
}).strict();

const methodPricingSchema = z.object({
  setupCents: cents,
  baseCents: cents,
  perDm2Cents: cents,
}).strict();

const pricingSchema = z.object({
  currency: z.literal('EUR'),
  basePriceCents: cents,
  sizeSurchargeCents: z.record(z.string().min(1).max(10), cents),
  colorSurchargeCents: z.record(slug, cents),
  methods: z.record(printMethodEnum, methodPricingSchema),
  tiers: z.array(z.object({
    minQty: z.number().int().min(1).max(100_000),
    discountPct: z.number().min(0).max(90),
  }).strict()).min(1).max(12),
  minQty: z.number().int().min(1).max(100_000),
  maxQty: z.number().int().min(1).max(100_000),
  maxZones: z.number().int().min(1).max(12),
}).strict();

export const productSchema = z.object({
  id: slug,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(600),
  category: z.string().trim().min(1).max(60),
  model: z.literal('tshirt'),
  active: z.boolean(),
  materials: z.array(materialEnum).min(1).max(4),
  defaultMaterial: materialEnum,
  methods: z.array(printMethodEnum).min(1).max(6),
  zones: z.array(z.object({
    id: slug,
    label: z.string().trim().min(1).max(60),
    widthMm: z.number().positive().max(1000),
    heightMm: z.number().positive().max(1000),
    panel: z.enum(['front', 'back', 'sleeveL', 'sleeveR', 'surface']),
    offsetTopMm: z.number().min(0).max(1000),
  }).strict()).min(1).max(12),
  colors: z.array(z.object({
    id: slug,
    name: z.string().trim().min(1).max(60),
    hex,
  }).strict()).min(1).max(60),
  sizes: z.array(z.string().trim().min(1).max(10)).max(20),
  pricing: pricingSchema,
}).strict()
  .superRefine((p, ctx) => {
    const dup = (arr: string[]) => arr.find((v, i) => arr.indexOf(v) !== i);
    const dupZone = dup(p.zones.map(z => z.id));
    if (dupZone) ctx.addIssue({ code: 'custom', path: ['zones'], message: `zone en double : ${dupZone}` });
    const dupColor = dup(p.colors.map(c => c.id));
    if (dupColor) ctx.addIssue({ code: 'custom', path: ['colors'], message: `couleur en double : ${dupColor}` });
    const dupSize = dup(p.sizes);
    if (dupSize) ctx.addIssue({ code: 'custom', path: ['sizes'], message: `taille en double : ${dupSize}` });
    if (!p.materials.includes(p.defaultMaterial)) ctx.addIssue({ code: 'custom', path: ['defaultMaterial'], message: 'matériau par défaut absent de la liste' });
    for (const key of Object.keys(p.pricing.sizeSurchargeCents)) {
      if (!p.sizes.includes(key)) ctx.addIssue({ code: 'custom', path: ['pricing', 'sizeSurchargeCents'], message: `taille inconnue : ${key}` });
    }
    for (const key of Object.keys(p.pricing.colorSurchargeCents)) {
      if (!p.colors.some(c => c.id === key)) ctx.addIssue({ code: 'custom', path: ['pricing', 'colorSurchargeCents'], message: `couleur inconnue : ${key}` });
    }
    const sorted = [...p.pricing.tiers].sort((a, b) => a.minQty - b.minQty);
    if (JSON.stringify(sorted) !== JSON.stringify(p.pricing.tiers)) ctx.addIssue({ code: 'custom', path: ['pricing', 'tiers'], message: 'paliers non triés par quantité croissante' });
    if (p.pricing.minQty > p.pricing.maxQty) ctx.addIssue({ code: 'custom', path: ['pricing'], message: 'quantité minimum supérieure au maximum' });
    for (const m of p.methods) {
      if (!p.pricing.methods[m]) ctx.addIssue({ code: 'custom', path: ['pricing', 'methods'], message: `tarif manquant pour ${m}` });
    }
  });

export const orderStatusSchema = z.enum(['pending', 'confirmed', 'in_production', 'shipped', 'cancelled']);
export const orderPatchSchema = z.object({ status: orderStatusSchema }).strict();
export const adminLoginSchema = z.object({
  email: z.string().trim().max(200),
  password: z.string().min(1).max(200),
}).strict();

export const assetUploadSchema = z.object({
  kind: z.enum(['source', 'preview', 'production']),
  view: z.enum(['face', 'back', 'left', 'right']).optional(),
  zoneId: slug.optional(),
  widthMm: z.coerce.number().positive().max(2000).optional(),
  heightMm: z.coerce.number().positive().max(2000).optional(),
  dpi: z.coerce.number().int().min(72).max(1200).optional(),
  designId: uuid.optional(),
}).strict();
