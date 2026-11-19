import assert from 'node:assert/strict';
import {
  TSHIRT, emptyDocument, addLayer, makeShape, makeText, printedZones, productionPixels,
  validateDesign, designAssetIds, makeImage, updateLayer, Layer,
} from '../src/index';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const base = () => emptyDocument('tshirt', ['front', 'back']);

t('zones imprimées : uniquement le contenu visible, pas la zone maximale', () => {
  const doc = base();
  assert.deepEqual(printedZones(doc, TSHIRT), []);
  const withShape = addLayer(doc, 'front', makeShape('rect', 50, 100, 60)); // bbox 20,70 → 80,130
  const zones = printedZones(withShape, TSHIRT);
  assert.equal(zones.length, 1);
  const z = zones[0];
  assert.equal(z.zoneId, 'front');
  assert.equal(z.xMm, 20); assert.equal(z.yMm, 70);
  assert.equal(z.widthMm, 60); assert.equal(z.heightMm, 60);
  assert.equal(z.dpi, 300);
  assert.deepEqual(printedZones(withShape, TSHIRT, 200)[0].dpi, 200);
});

t('zones imprimées : calques masqués, transparents ou vides ignorés', () => {
  const doc = base();
  const hidden = { ...makeShape('rect', 50, 50, 40), visible: false };
  const transparent = { ...makeShape('rect', 100, 100, 40), opacity: 0 };
  const ok = makeShape('ellipse', 150, 150, 40);
  const zones = printedZones(addLayer(addLayer(addLayer(doc, 'front', hidden as Layer), 'front', transparent as Layer), 'front', ok), TSHIRT);
  assert.equal(zones.length, 1);
  assert.equal(zones[0].xMm, 130); assert.equal(zones[0].widthMm, 40);
});

t('zones imprimées : rotation, union de plusieurs calques et plusieurs zones', () => {
  const a = makeShape('rect', 100, 100, 40);
  const b = { ...makeShape('rect', 150, 150, 40), rotation: 45 };
  const doc = addLayer(addLayer(addLayer(base(), 'front', a), 'front', b), 'back', makeText('DPRINTING', 150, 200, 30));
  const zones = printedZones(doc, TSHIRT);
  assert.equal(zones.length, 2);
  const front = zones.find(z => z.zoneId === 'front')!;
  assert.ok(front.widthMm > 70 && front.widthMm < 130, `largeur union ${front.widthMm}`);
  assert.ok(front.yMm < 120 && front.heightMm > 70);
  assert.ok(zones.find(z => z.zoneId === 'back'));
});

t('fichiers de production : dimensions en pixels exactes au DPI demandé', () => {
  assert.deepEqual(productionPixels(300, 400, 300), { width: 3543, height: 4724 });
  assert.deepEqual(productionPixels(25.4, 25.4, 300), { width: 300, height: 300 });
  assert.deepEqual(productionPixels(100, 50, 200), { width: 787, height: 394 });
});

t('validation : un document correct passe', () => {
  const doc = addLayer(addLayer(base(), 'front', makeText('Bonjour', 150, 100, 28)), 'back', makeShape('star', 150, 200, 80));
  const r = validateDesign(doc, TSHIRT);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  if (r.ok) assert.equal(r.document.zones.front.layers.length, 1);
});

t('validation : produit, zone, calque et couleurs incohérents sont refusés', () => {
  const wrongProduct = { ...base(), productId: 'mug' };
  assert.equal(validateDesign(wrongProduct, TSHIRT).ok, false);
  const unknownZone = base();
  unknownZone.zones.col = { layers: [] };
  assert.equal(validateDesign(unknownZone, TSHIRT).ok, false);
  const badType = base(); (badType.zones.front.layers as unknown[]) = [{ type: 'video' }];
  assert.equal(validateDesign(badType, TSHIRT).ok, false);
  const badColor = addLayer(base(), 'front', { ...makeText('x', 100, 100, 20), fill: 'url(javascript:alert(1))' } as Layer);
  assert.equal(validateDesign(badColor, TSHIRT).ok, false);
  const nan = addLayer(base(), 'front', { ...makeShape('rect', 10, 10, 20), x: Number.NaN } as Layer);
  assert.equal(validateDesign(nan, TSHIRT).ok, false);
  const dup = addLayer(addLayer(base(), 'front', makeShape('rect', 20, 20, 10)), 'front', makeShape('rect', 30, 30, 10));
  dup.zones.front.layers[1] = { ...dup.zones.front.layers[1], id: dup.zones.front.layers[0].id };
  assert.equal(validateDesign(dup, TSHIRT).ok, false);
});

t('validation : un calque qui sort de la zone est refusé (tolérance 0,6 mm)', () => {
  const doc = base();
  const outside = { ...makeShape('rect', 20, 20, 60), x: 0 };
  const bad = addLayer(doc, 'front', outside as Layer);
  const r = validateDesign(bad, TSHIRT);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some(e => /sort de la zone/.test(e)));
  const inside = addLayer(doc, 'front', { ...outside, x: 30.4, y: 30.4 } as Layer);
  assert.ok(validateDesign(inside, TSHIRT).ok);
});

t('validation : texte et image contrôlés', () => {
  const doc = base();
  const longText = addLayer(doc, 'front', makeText('x'.repeat(600), 100, 100, 20));
  assert.equal(validateDesign(longText, TSHIRT).ok, false);
  const img = makeImage('asset-1', 1000, 800, 150, 150, 80);
  const withImg = addLayer(doc, 'front', img);
  assert.ok(validateDesign(withImg, TSHIRT).ok);
  assert.deepEqual(designAssetIds(withImg), ['asset-1']);
  const badImg = addLayer(doc, 'front', { ...img, naturalWidth: 0 } as Layer);
  assert.equal(validateDesign(badImg, TSHIRT).ok, false);
});

t('validation : limite du nombre de calques', () => {
  let doc = base();
  for (let i = 0; i < 61; i++) doc = addLayer(doc, 'front', makeShape('rect', 50 + (i % 10), 50, 4));
  const r = validateDesign(doc, TSHIRT);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some(e => /60 calques/.test(e)));
});

t('validation : les opérations du studio restent valides après déplacement', () => {
  const doc = addLayer(base(), 'front', makeShape('rect', 150, 200, 100));
  const moved = updateLayer(doc, 'front', doc.zones.front.layers[0].id, { x: 200, y: 300, rotation: 30 });
  assert.ok(validateDesign(moved, TSHIRT).ok);
});

console.log(`\n${n} tests impression/validation OK`);
