import assert from 'node:assert/strict';
import {
  ppmFromDpi, mmToPx, pxToMm, effectiveDpi, printQuality, emptyDocument, addLayer, removeLayer, updateLayer, duplicateLayer, moveLayer, findLayer, countLayers,
  makeShape, makeText, makeImage, layerCorners, layerBounds, pointInLayer, hitTest, constrainToZone, handlePoint, resizeFromHandle, rotationFromPointer,
  snapLayer, History, layoutText, renderLayers, printMethodAvailability, TSHIRT, luminance, Layer, TextLayer,
} from '../src/index';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

t('unités : 300 DPI, millimètres et résolution effective', () => {
  near(ppmFromDpi(300), 11.811023622, 1e-6);
  near(mmToPx(25.4, 300), 300); near(pxToMm(300, 300), 25.4);
  near(effectiveDpi(1000, 100), 254);            // 1000 px sur 100 mm = 254 DPI
  assert.equal(printQuality(254), 'good'); assert.equal(printQuality(150), 'acceptable'); assert.equal(printQuality(72), 'low');
  assert.equal(effectiveDpi(500, 0), Infinity);
});

t('document : ajout, modification, duplication, ordre, suppression (immuable)', () => {
  const d0 = emptyDocument('tshirt', ['front', 'back']);
  const a = makeShape('rect', 100, 100), b = makeShape('ellipse', 150, 150);
  const d1 = addLayer(addLayer(d0, 'front', a), 'front', b);
  assert.equal(countLayers(d0), 0, 'le document source ne change pas'); assert.equal(countLayers(d1), 2);
  assert.equal(addLayer(d0, 'inconnue', a), d0);
  const d2 = updateLayer(d1, 'front', a.id, { opacity: 0.5 });
  assert.equal(findLayer(d2, 'front', a.id)!.opacity, 0.5); assert.equal(findLayer(d1, 'front', a.id)!.opacity, 1);
  const dup = duplicateLayer(d2, 'front', a.id); assert.equal(countLayers(dup.doc), 3);
  const copy = findLayer(dup.doc, 'front', dup.newId!)!; assert.notEqual(copy.id, a.id); assert.equal(copy.x, a.x + 8);
  const d3 = moveLayer(d1, 'front', a.id, 'front'); assert.equal(d3.zones.front.layers[1].id, a.id);
  assert.equal(moveLayer(d3, 'front', a.id, 'front'), d3, 'déjà au dessus : inchangé');
  assert.equal(moveLayer(d3, 'front', a.id, 'back').zones.front.layers[0].id, a.id);
  assert.equal(countLayers(removeLayer(d1, 'front', a.id)), 1);
  assert.equal(duplicateLayer(d0, 'front', 'x').newId, null);
});

t('image : conserve le rapport largeur/hauteur', () => {
  const wide = makeImage('a', 2000, 1000, 0, 0, 100); near(wide.width, 100); near(wide.height, 50);
  const tall = makeImage('b', 1000, 2000, 0, 0, 100); near(tall.width, 50); near(tall.height, 100);
});

t('géométrie : coins, rectangle englobant et sélection avec rotation', () => {
  const l = { x: 100, y: 100, width: 60, height: 40, rotation: 90 };
  const b = layerBounds(l); near(b.minX, 80); near(b.maxX, 120); near(b.minY, 70); near(b.maxY, 130);
  assert.equal(layerCorners({ ...l, rotation: 0 }).length, 4);
  assert.ok(pointInLayer(l, 100, 125)); assert.ok(!pointInLayer(l, 125, 100), 'hors du rectangle tourné');
  const layers = [makeShape('rect', 100, 100, 50), makeShape('rect', 110, 110, 50)];
  assert.equal(hitTest(layers, 112, 112)!.id, layers[1].id, 'le calque du dessus gagne');
  assert.equal(hitTest(layers, 300, 300), null);
  layers[1].visible = false; assert.equal(hitTest(layers, 112, 112)!.id, layers[0].id, 'masqué : ignoré');
});

t('zone imprimable : un calque ne peut jamais en sortir', () => {
  const zone = { widthMm: 300, heightMm: 400 };
  const out = constrainToZone({ x: 10, y: 395, width: 100, height: 50, rotation: 0 }, zone);
  near(out.x, 50); near(out.y, 375);
  const big = constrainToZone({ x: 150, y: 200, width: 600, height: 200, rotation: 0 }, zone);
  const bb = layerBounds(big); assert.ok(bb.minX >= -1e-9 && bb.maxX <= 300 + 1e-9); near(big.width / big.height, 3, 1e-9);
  const rotated = constrainToZone({ x: 0, y: 0, width: 100, height: 100, rotation: 45 }, zone);
  const rb = layerBounds(rotated); assert.ok(rb.minX >= -1e-9 && rb.minY >= -1e-9);
});

t('redimensionnement : le côté opposé reste fixe (sans rotation)', () => {
  const l = { x: 100, y: 100, width: 60, height: 40, rotation: 0 };
  const r = resizeFromHandle(l, 'se', { x: 180, y: 150 });
  near(r.width, 110); near(r.height, 70); near(r.x, 125); near(r.y, 115);
  const e = resizeFromHandle(l, 'e', { x: 150, y: 999 }); near(e.width, 80); near(e.height, 40); near(e.x, 110);
  const w = resizeFromHandle(l, 'w', { x: 50, y: 0 }); near(w.width, 80); near(w.x, 90);
  const min = resizeFromHandle(l, 'e', { x: 0, y: 0 }); assert.ok(min.width >= 2);
});

t('redimensionnement avec rotation de 90°', () => {
  const l = { x: 100, y: 100, width: 60, height: 40, rotation: 90 };
  const hp = handlePoint(l, 'e'); near(hp.x, 100); near(hp.y, 130);
  const r = resizeFromHandle(l, 'e', { x: 100, y: 150 }); near(r.width, 80); near(r.x, 100); near(r.y, 110);
});

t('redimensionnement proportionnel (poignée de coin) et depuis le centre', () => {
  const l = { x: 100, y: 100, width: 60, height: 40, rotation: 0 };
  const r = resizeFromHandle(l, 'se', { x: 190, y: 120 }, { keepAspect: true });
  near(r.width / r.height, 1.5, 1e-9); near(r.width, 120); near(r.height, 80); near(r.x, 130); near(r.y, 120);
  const c = resizeFromHandle(l, 'e', { x: 150, y: 100 }, { fromCenter: true }); near(c.width, 100); near(c.x, 100);
});

t('rotation : 0° vers le haut, aimantation tous les 15°', () => {
  const c = { x: 0, y: 0 };
  near(rotationFromPointer(c, { x: 0, y: -10 }), 0); near(rotationFromPointer(c, { x: 10, y: 0 }), 90);
  near(rotationFromPointer(c, { x: 0, y: 10 }), 180); near(rotationFromPointer(c, { x: -10, y: 0 }), -90);
  near(rotationFromPointer(c, { x: 10, y: -9 }, true) % 15, 0);
});

t('guides : aimantation sur le centre de la zone, ses bords et les autres calques', () => {
  const zone = { widthMm: 300, heightMm: 400 };
  const m = makeShape('rect', 148, 120, 50); // centre x = 148 -> aimanté sur 150
  const s = snapLayer(m, zone, [], 3); near(s.dx, 2); near(s.dy, 0); assert.equal(s.guides.length, 1); assert.equal(s.guides[0].kind, 'zone-center');
  const far = snapLayer(makeShape('rect', 120, 120, 50), zone, [], 3); assert.equal(far.dx, 0); assert.equal(far.guides.length, 0);
  const edge = snapLayer(makeShape('rect', 26, 200, 50), zone, [], 3); near(edge.dx, -1); // bord gauche (1) -> 0
  const other = makeShape('rect', 200, 300, 40);
  const lay = snapLayer(makeShape('rect', 202, 100, 40), zone, [other], 3); near(lay.dx, -2); assert.equal(lay.guides[0].kind, 'layer');
  const hidden = { ...other, visible: false }; assert.equal(snapLayer(makeShape('rect', 202, 100, 40), zone, [hidden], 1).dx, 0);
});

t('historique : annuler, rétablir, fusion des changements rapprochés, limite', () => {
  const h = new History(0, 3, 1000);
  h.commit(1, undefined, 0); h.commit(2, undefined, 10); assert.equal(h.present, 2);
  assert.equal(h.undo(), 1); assert.equal(h.undo(), 0); assert.equal(h.undo(), 0, 'rien à annuler'); assert.equal(h.canUndo, false);
  assert.equal(h.redo(), 1); assert.equal(h.redo(), 2); assert.equal(h.canRedo, false);
  h.undo(); h.commit(9, undefined, 20); assert.equal(h.canRedo, false, 'un nouveau changement efface le « rétablir »');
  const s = new History(0, 10, 1000);
  s.commit(1, 'slider', 0); s.commit(2, 'slider', 100); s.commit(3, 'slider', 200);
  assert.equal(s.undo(), 0, 'un seul pas pour tout le glissement');
  s.commit(5, 'slider', 5000); s.commit(6, 'slider', 9000); assert.equal(s.undo(), 5, 'trop espacés : deux pas');
  const lim = new History(0, 2); for (let i = 1; i <= 5; i++) lim.commit(i, undefined, i * 5000);
  lim.undo(); lim.undo(); assert.equal(lim.undo(), 3, 'limite de 2 étapes');
  assert.equal(h.commit(h.present), h.present);
  const r = new History(1); r.commit(2); r.reset(7); assert.equal(r.canUndo, false); assert.equal(r.present, 7);
});

// Faux contexte de dessin pour tester la mise en page du texte et l'ordre de rendu sans navigateur
function fakeCtx() {
  const calls: string[] = [];
  const ctx: any = {
    calls, font: '', globalAlpha: 1, letterSpacing: '0px',
    save() { calls.push('save'); }, restore() { calls.push('restore'); },
    translate(x: number, y: number) { calls.push(`translate ${x.toFixed(1)},${y.toFixed(1)}`); }, rotate(a: number) { calls.push(`rotate ${a.toFixed(3)}`); }, scale() {},
    measureText(s: string) { return { width: s.length * 10 }; }, // 10 px par caractère à 10 px/mm : 1 mm par caractère
    beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, closePath() {}, ellipse() { calls.push('ellipse'); }, fill() { calls.push('fill'); }, stroke() { calls.push('stroke'); },
    fillText(s: string) { calls.push(`text ${s}`); }, drawImage() { calls.push('image'); },
  };
  return ctx;
}

t('texte : retours à la ligne dans la largeur du calque', () => {
  const l = { ...makeText('bonjour le monde', 100, 100, 10), width: 10, fontSize: 10, lineHeight: 1.2 } as TextLayer;
  const lay = layoutText(fakeCtx(), l);
  assert.deepEqual(lay.lines, ['bonjour le', 'monde']);
  near(lay.heightMm, 24);
  const one = layoutText(fakeCtx(), { ...l, width: 1000 }); assert.deepEqual(one.lines, ['bonjour le monde']);
  const nl = layoutText(fakeCtx(), { ...l, width: 1000, text: 'a\nb' }); assert.deepEqual(nl.lines, ['a', 'b']);
  const longWord = layoutText(fakeCtx(), { ...l, width: 3, text: 'abcdefghij' }); assert.ok(longWord.lines.length >= 3 && longWord.lines.every(x => x.length <= 3));
});

t('rendu : ordre des calques, calques masqués et opacité', () => {
  const a = makeShape('ellipse', 50, 60), b = makeShape('rect', 10, 10); b.visible = false;
  const c = makeText('X', 20, 30, 10);
  const ctx = fakeCtx();
  renderLayers(ctx, [a, b, c] as Layer[], () => null, 2);
  const tr = ctx.calls.filter((s: string) => s.startsWith('translate'));
  assert.deepEqual(tr, ['translate 100.0,120.0', 'translate 40.0,60.0'], 'x,y en mm × pixels par mm ; le masqué est sauté');
  assert.ok(ctx.calls.indexOf('ellipse') < ctx.calls.findIndex((s: string) => s.startsWith('text')));
  const im = makeImage('missing', 10, 10, 0, 0, 10); const ctx2 = fakeCtx(); renderLayers(ctx2, [im], () => null, 1); assert.ok(!ctx2.calls.includes('image'));
});

t('catalogue : compatibilité produit / matériau / couleur / méthode', () => {
  const ok = (m: string, mat: any, hex: string) => printMethodAvailability(TSHIRT, mat, hex).find(x => x.method === m)!;
  assert.equal(ok('dtf', 'cotton', '#16181d').ok, true);
  assert.equal(ok('sublimation', 'cotton', '#ffffff').ok, false);
  assert.equal(ok('sublimation', 'polyester', '#16181d').ok, false, 'trop foncé');
  assert.equal(ok('sublimation', 'polyester', '#f5f5f2').ok, true);
  assert.equal(ok('dtg', 'polyester', '#ffffff').ok, false);
  assert.ok(ok('sublimation', 'cotton', '#fff').reason);
  assert.ok(luminance('#ffffff') > 0.99 && luminance('#000000') < 0.01);
  for (const z of TSHIRT.zones) assert.ok(z.widthMm > 0 && z.heightMm > 0);
});

console.log(`\n${n} tests OK`);
