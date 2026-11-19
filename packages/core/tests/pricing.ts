import assert from 'node:assert/strict';
import { TSHIRT, PricingError, ProductDef, quote, discountPctFor, areaDm2, formatMoney } from '../src/index';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const zone = (id = 'front', widthMm = 300, heightMm = 400) => ({ zoneId: id, widthMm, heightMm });
const base = (over: Partial<Parameters<typeof quote>[0]> = {}) => ({
  product: TSHIRT,
  printMethod: 'dtf' as const,
  material: 'cotton' as const,
  variants: [{ colorId: 'white', sizeId: 'M', quantity: 1 }],
  zones: [zone()],
  ...over,
});
const fails = (code: string, fn: () => unknown) => {
  try { fn(); assert.fail(`aurait dû échouer : ${code}`); }
  catch (e) { assert.ok(e instanceof PricingError, String(e)); assert.equal((e as PricingError).code, code); }
};

t('une unité : prix produit + impression, sans remise', () => {
  const q = quote(base());
  // 300 × 400 mm = 12 dm² → 12 × 22 = 264 centimes ; + 180 de base = 444 ; + 1190 = 1634
  assert.equal(areaDm2(300, 400), 12);
  assert.equal(q.printCentsPerUnit, 444);
  assert.equal(q.unitPriceCents, 1634);
  assert.equal(q.setupCents, 0);
  assert.equal(q.subtotalCents, 1634);
  assert.equal(q.discountPct, 0);
  assert.equal(q.totalCents, 1634);
  assert.equal(q.quantity, 1);
});

t('suppléments de taille et de couleur, calculés par variante', () => {
  const q = quote(base({ variants: [
    { colorId: 'white', sizeId: 'M', quantity: 1 },
    { colorId: 'black', sizeId: 'L', quantity: 1 },
  ] }));
  const [m, l] = q.variants;
  assert.equal(m.unitPriceCents, 1634);
  assert.equal(l.unitPriceCents, 1734); // +100 pour la taille L
  assert.equal(q.subtotalCents, 3368);
});

t('deux zones imprimées : le coût d\'impression s\'additionne', () => {
  const q = quote(base({ zones: [zone('front'), zone('back')] }));
  // deux fois (180 + 264) = 888
  assert.equal(q.printCentsPerUnit, 888);
  assert.equal(q.totalCents, 1190 + 888);
});

t('paliers dégressifs : seuils exacts et quantité totale de la ligne', () => {
  assert.equal(discountPctFor(TSHIRT.pricing.tiers, 1), 0);
  assert.equal(discountPctFor(TSHIRT.pricing.tiers, 5), 0);
  assert.equal(discountPctFor(TSHIRT.pricing.tiers, 6), 8);
  assert.equal(discountPctFor(TSHIRT.pricing.tiers, 12), 8);
  assert.equal(discountPctFor(TSHIRT.pricing.tiers, 13), 12);
  assert.equal(discountPctFor(TSHIRT.pricing.tiers, 24), 12);
  assert.equal(discountPctFor(TSHIRT.pricing.tiers, 25), 18);
  assert.equal(discountPctFor(TSHIRT.pricing.tiers, 500), 22);

  const q = quote(base({ variants: [{ colorId: 'white', sizeId: 'M', quantity: 6 }] }));
  assert.equal(q.subtotalCents, 9804);
  assert.equal(q.discountCents, 784); // 8 % de 9804 = 784,32 → arrondi au centime
  assert.equal(q.totalCents, 9020);
});

t('la remise porte sur la quantité totale, pas sur chaque variante isolément', () => {
  const two = quote(base({ variants: [{ colorId: 'white', sizeId: 'M', quantity: 2 }, { colorId: 'black', sizeId: 'L', quantity: 4 }] }));
  assert.equal(two.quantity, 6);
  assert.equal(two.discountPct, 8);
  assert.equal(two.subtotalCents, 3268 + 6936);
  assert.equal(two.discountCents, 816);
  assert.equal(two.totalCents, 9388);

  const three = quote(base({ variants: [{ colorId: 'white', sizeId: 'M', quantity: 3 }, { colorId: 'black', sizeId: 'L', quantity: 3 }] }));
  assert.equal(three.discountPct, 8, '6 unités au total');
  const one = quote(base({ variants: [{ colorId: 'white', sizeId: 'M', quantity: 2 }, { colorId: 'black', sizeId: 'L', quantity: 3 }] }));
  assert.equal(one.discountPct, 0, '5 unités au total');
});

t('frais de mise en route : facturés une fois, jamais remisés', () => {
  const product: ProductDef = {
    ...TSHIRT,
    pricing: {
      ...TSHIRT.pricing,
      methods: { ...TSHIRT.pricing.methods, dtf: { setupCents: 500, baseCents: 180, perDm2Cents: 22 } },
    },
  };
  const q = quote(base({ product, variants: [{ colorId: 'white', sizeId: 'M', quantity: 10 }] }));
  assert.equal(q.setupCents, 500);
  assert.equal(q.subtotalCents, 16340 + 500);
  assert.equal(q.discountCents, Math.round((16340 * 8) / 100));
  assert.equal(q.totalCents, 16340 + 500 - q.discountCents);
  assert.ok(q.breakdown.some(b => b.amountCents === 500 && /mise en route/.test(b.label)));
});

t('la méthode doit être compatible, tarifée et réellement disponible', () => {
  fails('METHOD_NOT_AVAILABLE', () => quote(base({ printMethod: 'screen' }))); // compatible mais pas encore commandable
  fails('METHOD_NOT_AVAILABLE', () => quote(base({ product: { ...TSHIRT, methods: ['dtg'] } })));
  const withoutPrice: ProductDef = { ...TSHIRT, pricing: { ...TSHIRT.pricing, methods: {} } };
  fails('METHOD_NOT_PRICED', () => quote(base({ product: withoutPrice })));
  fails('MATERIAL_NOT_AVAILABLE', () => quote(base({ product: { ...TSHIRT, materials: ['cotton'] }, material: 'polyester' })));
});

t('variantes, quantités et zones sont validées côté moteur', () => {
  fails('EMPTY_VARIANTS', () => quote(base({ variants: [] })));
  fails('NO_ZONE', () => quote(base({ zones: [] })));
  fails('UNKNOWN_COLOR', () => quote(base({ variants: [{ colorId: 'fluo', sizeId: 'M', quantity: 1 }] })));
  fails('UNKNOWN_SIZE', () => quote(base({ variants: [{ colorId: 'white', sizeId: 'XXXL', quantity: 1 }] })));
  fails('INVALID_QUANTITY', () => quote(base({ variants: [{ colorId: 'white', sizeId: 'M', quantity: 0 }] })));
  fails('INVALID_QUANTITY', () => quote(base({ variants: [{ colorId: 'white', sizeId: 'M', quantity: 1.5 }] })));
  fails('INVALID_QUANTITY', () => quote(base({ variants: [
    { colorId: 'white', sizeId: 'M', quantity: 2 },
    { colorId: 'white', sizeId: 'M', quantity: 3 },
  ] })));
  fails('ZONE_UNKNOWN', () => quote(base({ zones: [zone('col')] })));
  fails('ZONE_TOO_LARGE', () => quote(base({ zones: [zone('front', 301, 400)] })));
  fails('TOO_MANY_ZONES', () => quote(base({ product: { ...TSHIRT, pricing: { ...TSHIRT.pricing, maxZones: 1 } }, zones: [zone('front'), zone('back')] })));
  // tolérance d'arrondi : 0,4 mm de dépassement accepté
  const ok = quote(base({ zones: [zone('front', 300.4, 400)] }));
  assert.ok(ok.totalCents > 0);
});

t('un produit sans taille et une variante unique', () => {
  const noSize: ProductDef = {
    ...TSHIRT, sizes: [], pricing: { ...TSHIRT.pricing, sizeSurchargeCents: {} },
  };
  const q = quote(base({ product: noSize, variants: [{ colorId: 'white', sizeId: null, quantity: 2 }] }));
  assert.equal(q.totalCents, 1634 * 2);
  fails('UNKNOWN_SIZE', () => quote(base({ product: noSize, variants: [{ colorId: 'white', sizeId: 'M', quantity: 1 }] })));
});

t('détail du prix cohérent avec le total et formatage', () => {
  const q = quote(base({ variants: [{ colorId: 'white', sizeId: 'M', quantity: 30 }] }));
  const sum = q.breakdown.reduce((s, b) => s + b.amountCents, 0);
  assert.equal(sum, q.totalCents);
  assert.equal(q.discountPct, 18);
  assert.equal(q.totalCents, Math.round(1634 * 30 * 0.82));
  assert.equal(formatMoney(1634), '16,34 €');
});

console.log(`\n${n} tests de tarification OK`);
