// Tests d'intégration de l'API : vraie base PostgreSQL (PGlite), vrai stockage disque, vraies requêtes HTTP.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { once } from 'node:events';
import { TSHIRT, emptyDocument, addLayer, makeShape, makeImage, printedZones, productionPixels } from '@dprinting/core';
import { buildApp } from '../src/app';
import { hashPassword } from '../src/auth';
import { loadConfig } from '../src/config';
import { migrate, openDatabase, seedProducts } from '../src/db';
import { crc32, inspectImage, withPngDpi } from '../src/png';
import { createStorage } from '../src/storage';

let n = 0;
const t = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

// ---------- fabrique de PNG réels (avec CRC et pHYs) ----------
function png(w: number, h: number, opts: { dpi?: number; color?: [number, number, number, number] } = {}): Buffer {
  const [r, g, b, a] = opts.color ?? [30, 90, 200, 255];
  const row = Buffer.alloc(1 + w * 4);
  for (let x = 0; x < w; x++) {
    row[1 + x * 4] = r; row[2 + x * 4] = g; row[3 + x * 4] = b; row[4 + x * 4] = a;
  }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const base = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return opts.dpi ? withPngDpi(base, opts.dpi) : base;
}

// ---------- démarrage ----------
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dprinting-test-'));
const adminPassword = 'mot-de-passe-test';
const config = loadConfig({
  NODE_ENV: 'test',
  DATA_DIR: tmp,
  PGLITE_DIR: ':memory:',
  STORAGE_DRIVER: 'local',
  SESSION_SECRET: 'secret-de-test-uniquement',
  ADMIN_EMAIL: 'admin@test.local',
  ADMIN_PASSWORD_HASH: hashPassword(adminPassword),
  PUBLIC_URL: 'http://127.0.0.1:3999',
});
const sql = await openDatabase(config);
await migrate(sql);
await seedProducts(sql);
const storage = createStorage(config);
await storage.ensureReady();
const app = buildApp({ config, sql, storage });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const addr = server.address();
if (!addr || typeof addr === 'string') throw new Error('écoute impossible');
const base = `http://127.0.0.1:${addr.port}`;

type Json = any;
async function call(pathname: string, opts: { method?: string; body?: unknown; cookie?: string; csrf?: boolean; raw?: boolean } = {}): Promise<{ status: number; json: Json; headers: Headers }> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.csrf) headers['x-dprinting-csrf'] = '1';
  const res = await fetch(base + pathname, {
    method: opts.method ?? 'GET', headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: Json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}

async function upload(fields: Record<string, string>, file: Buffer, type = 'image/png'): Promise<Json> {
  const qs = fields.kind ? `?kind=${encodeURIComponent(fields.kind)}` : '';
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('file', new Blob([new Uint8Array(file)], { type }), 'fichier.png');
  const res = await fetch(base + '/api/assets' + qs, { method: 'POST', body: fd });
  const json = await res.json();
  return { status: res.status, json };
}

const zone100 = { zoneId: 'front', widthMm: 100, heightMm: 100 };
const quoteBody = (over: Json = {}) => ({
  productId: 'tshirt', printMethod: 'dtf', material: 'cotton',
  variants: [{ colorId: 'white', sizeId: 'M', quantity: 1 }],
  zones: [zone100], ...over,
});

try {
  await t('santé : base et stockage réels', async () => {
    const { status, json } = await call('/api/health');
    assert.equal(status, 200); assert.equal(json.ok, true);
    assert.equal(json.db, 'pglite'); assert.equal(json.storage, 'local');
  });

  await t('catalogue : produit semé avec sa grille tarifaire', async () => {
    const { status, json } = await call('/api/catalog');
    assert.equal(status, 200);
    const tshirt = json.products.find((p: Json) => p.id === 'tshirt');
    assert.ok(tshirt);
    assert.equal(tshirt.pricing.basePriceCents, TSHIRT.pricing.basePriceCents);
    assert.equal(tshirt.zones.length, 2);
    assert.equal(json.products.find((p: Json) => !p.active), undefined);
  });

  await t('devis : recalcul serveur, remises et libellés', async () => {
    const one = await call('/api/quotes', { method: 'POST', body: quoteBody() });
    assert.equal(one.status, 200);
    // 1190 + (180 + 1 dm² × 22) = 1392
    assert.equal(one.json.unitPriceCents, 1392);
    assert.equal(one.json.totalCents, 1392);
    assert.equal(one.json.display.totalLabel.replace(/\s/g, ' '), '13,92 €');

    const six = await call('/api/quotes', { method: 'POST', body: quoteBody({ variants: [{ colorId: 'white', sizeId: 'L', quantity: 6 }] }) });
    assert.equal(six.json.discountPct, 8);
    assert.equal(six.json.totalCents, Math.round((1190 + 100 + 202) * 6 * 0.92));
  });

  await t('devis : méthode non commandable et données invalides refusées', async () => {
    const screen = await call('/api/quotes', { method: 'POST', body: quoteBody({ printMethod: 'screen' }) });
    assert.equal(screen.status, 409); assert.equal(screen.json.error.code, 'METHOD_NOT_AVAILABLE');
    const bad = await call('/api/quotes', { method: 'POST', body: { ...quoteBody(), priceCents: 1 } });
    assert.equal(bad.status, 400); assert.equal(bad.json.error.code, 'VALIDATION');
    const tooBig = await call('/api/quotes', { method: 'POST', body: quoteBody({ zones: [{ zoneId: 'front', widthMm: 400, heightMm: 400 }] }) });
    assert.equal(tooBig.status, 409); assert.equal(tooBig.json.error.code, 'ZONE_TOO_LARGE');
  });

  let sourceId = '';
  await t('import d’image : type réel vérifié, URL signée', async () => {
    const up = await upload({ kind: 'source' }, png(400, 300));
    assert.equal(up.status, 201, JSON.stringify(up.json));
    sourceId = up.json.id;
    assert.equal(up.json.width, 400); assert.equal(up.json.height, 300);
    assert.ok(new URL(up.json.url).pathname.startsWith('/api/files/source/'));
    const fake = await upload({ kind: 'source' }, Buffer.from('pas une image'));
    assert.equal(fake.status, 400);
  });

  // Document : un rectangle 100 × 100 et une image 100 × 75 centrés.
  let designId = '';
  let document: Json;
  await t('design : validation, images sources vérifiées, URLs des originaux', async () => {
    document = addLayer(
      addLayer(emptyDocument('tshirt', ['front', 'back']), 'front', makeShape('rect', 150, 200, 100)),
      'front', makeImage(sourceId, 400, 300, 150, 200, 100),
    );
    assert.equal(printedZones(document, TSHIRT)[0].widthMm, 100);
    assert.equal(printedZones(document, TSHIRT)[0].heightMm, 100);
    const ok = await call('/api/designs', { method: 'POST', body: { productId: 'tshirt', document } });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    designId = ok.json.id;
    assert.ok(ok.json.assetUrls[sourceId]);

    const outside = structuredClone(document);
    outside.zones.front.layers[0].x = 0;
    const bad = await call('/api/designs', { method: 'POST', body: { productId: 'tshirt', document: outside } });
    assert.equal(bad.status, 400); assert.equal(bad.json.error.code, 'DESIGN_INVALID');

    const unknownAsset = structuredClone(document);
    unknownAsset.zones.front.layers[1].assetId = '00000000-0000-4000-8000-000000000000';
    const badAsset = await call('/api/designs', { method: 'POST', body: { productId: 'tshirt', document: unknownAsset } });
    assert.equal(badAsset.status, 400);
  });

  const previews: Record<string, string> = {};
  await t('aperçus : quatre vues fixes, PNG contrôlés', async () => {
    const img = png(1200, 1500, { dpi: 300 });
    for (const view of ['face', 'back', 'left', 'right']) {
      const up = await upload({ kind: 'preview', view, designId }, img);
      assert.equal(up.status, 201, JSON.stringify(up.json));
      previews[view] = up.json.id;
    }
    const wrongView = await upload({ kind: 'preview', view: 'diagonale', designId }, img);
    assert.equal(wrongView.status, 400);
    const jpeg = await upload({ kind: 'preview', view: 'face', designId }, Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 0]));
    assert.equal(jpeg.status, 400);
  });

  let productionId = '';
  await t('production : dimensions physiques, DPI et pixels vérifiés', async () => {
    const px = productionPixels(100, 100, 300);
    const good = await upload({ kind: 'production', designId, zoneId: 'front', widthMm: '100', heightMm: '100', dpi: '300' }, png(px.width, px.height, { dpi: 300 }));
    assert.equal(good.status, 201, JSON.stringify(good.json));
    productionId = good.json.id;
    const info = inspectImage(await storage.get((await sql.query<Json>('select storage_key from assets where id=$1', [productionId])).rows[0].storage_key));
    assert.ok(Math.abs((info.dpiX ?? 0) - 300) < 0.01, `DPI lu : ${info.dpiX}`); assert.equal(info.width, px.width);

    const wrongDpi = await upload({ kind: 'production', designId, zoneId: 'front', widthMm: '100', heightMm: '100', dpi: '300' }, png(px.width, px.height, { dpi: 200 }));
    assert.equal(wrongDpi.status, 400); assert.equal(wrongDpi.json.error.code, 'PRODUCTION_DPI');
    const noDpi = await upload({ kind: 'production', designId, zoneId: 'front', widthMm: '100', heightMm: '100', dpi: '300' }, png(px.width, px.height));
    assert.equal(noDpi.status, 400); assert.equal(noDpi.json.error.code, 'PRODUCTION_DPI');
    const wrongSize = await upload({ kind: 'production', designId, zoneId: 'front', widthMm: '120', heightMm: '100', dpi: '300' }, png(px.width, px.height, { dpi: 300 }));
    assert.equal(wrongSize.status, 400);
  });

  const orderBody = () => ({
    customer: {
      firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+33612345678',
      addressLine1: '12 rue des Lilas', postalCode: '75011', city: 'Paris', country: 'France',
    },
    items: [{
      productId: 'tshirt', printMethod: 'dtf', material: 'cotton', designId,
      variants: [{ colorId: 'white', sizeId: 'M', quantity: 2 }],
      previewColorId: 'white', previews, productionAssets: [{ zoneId: 'front', assetId: productionId }],
    }],
  });

  let orderId = '', accessToken = '';
  await t('commande : prix recalculés, aperçus liés au design, fichiers complets', async () => {
    const created = await call('/api/orders', { method: 'POST', body: orderBody() });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const order = created.json.order;
    orderId = order.id; accessToken = created.json.accessToken;
    assert.ok(order.number >= 1);
    assert.equal(order.status, 'pending');
    assert.equal(order.items[0].quantity, 2);
    assert.equal(order.items[0].unitPriceCents, 1392);
    assert.equal(order.totalCents, 2784);
    assert.equal(order.items[0].previews.length, 4);
    assert.ok(order.items[0].previews.every((p: Json) => p.url.startsWith('http')));
    assert.equal(order.items[0].designDocument.version, 1);
    assert.equal(order.items[0].zones[0].productionAssetId, productionId);
  });

  await t('commande : fichier de production manquant ou aperçu d’un autre design refusés', async () => {
    const missing = orderBody();
    missing.items[0].productionAssets = [];
    const a = await call('/api/orders', { method: 'POST', body: missing });
    assert.equal(a.status, 400); assert.equal(a.json.error.code, 'PRODUCTION_MISSING');

    const second = await call('/api/designs', { method: 'POST', body: { productId: 'tshirt', document } });
    const foreign = await upload({ kind: 'preview', view: 'face', designId: second.json.id }, png(1200, 1500, { dpi: 300 }));
    const bad = orderBody();
    bad.items[0].previews.face = foreign.json.id;
    const b = await call('/api/orders', { method: 'POST', body: bad });
    assert.equal(b.status, 400); assert.equal(b.json.error.code, 'ASSET_DESIGN_MISMATCH');

    const priceTamper = orderBody();
    (priceTamper.items[0] as Json).unitPriceCents = 1;
    const c = await call('/api/orders', { method: 'POST', body: priceTamper });
    assert.equal(c.status, 400); assert.equal(c.json.error.code, 'VALIDATION');
  });

  await t('suivi client : jeton d’accès obligatoire, fichiers de production masqués', async () => {
    const ok = await call(`/api/orders/${orderId}?access=${encodeURIComponent(accessToken)}`);
    assert.equal(ok.status, 200);
    assert.ok(ok.json.order.number >= 1);
    assert.equal(ok.json.order.customer.email, 'ada@example.com');
    assert.equal(ok.json.order.items[0].zones[0].productionAssetId, undefined);
    const noToken = await call(`/api/orders/${orderId}`);
    assert.equal(noToken.status, 404);
    const wrong = await call(`/api/orders/${orderId}?access=${'x'.repeat(32)}`);
    assert.equal(wrong.status, 404);
  });

  let cookie = '';
  await t('admin : authentification, sessions et CSRF', async () => {
    const bad = await call('/api/admin/login', { method: 'POST', body: { email: 'admin@test.local', password: 'faux' } });
    assert.equal(bad.status, 401);
    const ok = await call('/api/admin/login', { method: 'POST', body: { email: 'admin@test.local', password: adminPassword } });
    assert.equal(ok.status, 200);
    cookie = (ok.headers.get('set-cookie') ?? '').split(';')[0];
    assert.ok(cookie.startsWith('dp_admin='));
    const session = await call('/api/admin/session', { cookie });
    assert.equal(session.status, 200); assert.equal(session.json.email, 'admin@test.local');
    const noCsrf = await call('/api/admin/products', { method: 'POST', cookie, body: {} });
    assert.equal(noCsrf.status, 403);
    const unauth = await call('/api/admin/orders');
    assert.equal(unauth.status, 401);
  });

  await t('admin : commandes, téléchargements de production, changement de statut', async () => {
    const list = await call('/api/admin/orders', { cookie });
    assert.equal(list.status, 200);
    assert.equal(list.json.orders.length, 1);
    assert.equal(list.json.orders[0].quantity, 2);
    assert.equal(list.json.orders[0].products, 'T-shirt');

    const detail = await call(`/api/admin/orders/${orderId}`, { cookie });
    assert.equal(detail.status, 200);
    assert.ok(detail.json.order.productionUrls[productionId].startsWith('http'));
    assert.ok(detail.json.order.items[0].previews[0].url.startsWith('http'));

    const patch = await call(`/api/admin/orders/${orderId}`, { method: 'PATCH', cookie, csrf: true, body: { status: 'in_production' } });
    assert.equal(patch.status, 200);
    const follow = await call(`/api/orders/${orderId}?access=${encodeURIComponent(accessToken)}`);
    assert.equal(follow.json.order.status, 'in_production');
    const invalid = await call(`/api/admin/orders/${orderId}`, { method: 'PATCH', cookie, csrf: true, body: { status: 'perdu' } });
    assert.equal(invalid.status, 400);
  });

  await t('admin : modification de prix immédiatement appliquée par le devis', async () => {
    const before = await call('/api/admin/products', { cookie });
    const product = before.json.products.find((p: Json) => p.id === 'tshirt');
    const edited = { ...product, pricing: { ...product.pricing, basePriceCents: 2000 } };
    const put = await call('/api/admin/products/tshirt', { method: 'PUT', cookie, csrf: true, body: edited });
    assert.equal(put.status, 200, JSON.stringify(put.json));
    const q = await call('/api/quotes', { method: 'POST', body: quoteBody() });
    assert.equal(q.json.unitPriceCents, 2000 + 202);
    const restore = await call('/api/admin/products/tshirt', { method: 'PUT', cookie, csrf: true, body: product });
    assert.equal(restore.status, 200);
    const again = await call('/api/quotes', { method: 'POST', body: quoteBody() });
    assert.equal(again.json.unitPriceCents, 1392);
  });

  await t('admin : une zone plus grande que le tissu est refusée', async () => {
    const all = await call('/api/admin/products', { cookie });
    const product = all.json.products.find((p: Json) => p.id === 'tshirt');
    const tooWide = { ...product, zones: [{ ...product.zones[0], widthMm: 900 }] };
    const r = await call('/api/admin/products/tshirt', { method: 'PUT', cookie, csrf: true, body: tooWide });
    assert.equal(r.status, 400); assert.equal(r.json.error.code, 'ZONE_TOO_WIDE');
  });

  await t('fichiers locaux : signature obligatoire, expiration vérifiée', async () => {
    const up = await upload({ kind: 'source' }, png(64, 64));
    const url = new URL(up.json.url);
    const ok = await fetch(base + url.pathname + url.search);
    assert.equal(ok.status, 200); assert.equal(ok.headers.get('content-type'), 'image/png');
    const tampered = await fetch(base + url.pathname + url.search.replace(/sig=[^&]+/, 'sig=invalide'));
    assert.equal(tampered.status, 404);
    const expired = new URL(up.json.url); expired.searchParams.set('exp', '1');
    assert.equal((await fetch(base + expired.pathname + expired.search)).status, 404);
  });

  await t('routes inconnues et corps invalides', async () => {
    assert.equal((await call('/api/inconnu')).status, 404);
    const res = await fetch(base + '/api/quotes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    assert.equal(res.status, 400);
  });
} finally {
  server.close();
  await sql.close();
  await fs.rm(tmp, { recursive: true, force: true });
}

console.log(`\n${n} tests d’intégration serveur OK`);
