import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import {
  formatMoney, designAssetIds, quote, validateDesign,
  type CheckoutPayload, type ProductDef, type QuotePayload,
} from '@dprinting/core';
import type { AppConfig } from './config';
import { adminGuard, clearSessionCookie, rateLimit, setSessionCookie, signSession, verifyPassword } from './auth';
import { assetUrl, createAsset, sourceUrls } from './assets';
import { newId, type Sql } from './db';
import { badRequest, errorHandler, HttpError, notFound } from './errors';
import { adminGetOrder, adminListOrders, createOrder, getOrderForCustomer, orderStats, updateOrderStatus } from './orders';
import { getProduct, listProducts, saveProduct, disableProduct } from './products';
import { adminLoginSchema, assetUploadSchema, checkoutPayloadSchema, designPayloadSchema, orderPatchSchema, quotePayloadSchema } from './schemas';
import { LocalStorage, type Storage } from './storage';

export type Deps = { config: AppConfig; sql: Sql; storage: Storage };

const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

export function buildApp({ config, sql, storage }: Deps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (config.nodeEnv === 'production' && (req.secure || req.headers['x-forwarded-proto'] === 'https')) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(express.json({ limit: '2mb' }));

  // ---------- santé ----------
  // Ping ultra-léger pour les keep-alive externes : aucune requête base de données.
  app.get('/api/ping', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await sql.query('select 1');
      res.json({ ok: true, db: sql.driver, storage: storage.driver, version: 2, time: new Date().toISOString() });
    } catch {
      res.status(503).json({ ok: false, db: sql.driver, storage: storage.driver });
    }
  });

  // ---------- catalogue ----------
  app.get('/api/catalog', async (_req, res) => {
    const products = await listProducts(sql);
    res.json({ products });
  });

  app.get('/api/products/:id', async (req, res) => {
    const product = await getProduct(sql, req.params.id);
    res.json({ product });
  });

  // ---------- devis (jamais un prix fourni par le client) ----------
  app.post('/api/quotes', rateLimit(180, 60_000), async (req, res) => {
    const body = quotePayloadSchema.parse(req.body) as QuotePayload;
    const product = await getProduct(sql, body.productId);
    const result = quoteFor(product, body);
    res.json(result);
  });

  function quoteFor(product: ProductDef, body: QuotePayload) {
    const result = quote({
      product, printMethod: body.printMethod, material: body.material, variants: body.variants, zones: body.zones,
    });
    return {
      ...result,
      productId: product.id,
      printMethod: body.printMethod,
      material: body.material,
      zones: body.zones,
      display: { unitLabel: formatMoney(result.unitPriceCents), totalLabel: formatMoney(result.totalCents) },
    };
  }

  // ---------- fichiers sources ----------
  const upload = (req: Request) => {
    const kind = String(req.query.kind ?? req.body?.kind ?? 'source');
    const limit = kind === 'production' ? config.limits.productionBytes : kind === 'preview' ? config.limits.previewBytes : config.limits.sourceBytes;
    return multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: limit, fields: 12 } }).single('file');
  };

  app.post('/api/assets', rateLimit(60, 60_000), (req, res, next) => {
    upload(req)(req, res, (err: unknown) => {
      if (err) { next(err); return; }
      (async () => {
        if (!req.file) throw badRequest('FILE_REQUIRED', 'Aucun fichier reçu.');
        const meta = assetUploadSchema.parse({
          kind: req.query.kind ?? req.body.kind,
          view: req.body.view || undefined,
          zoneId: req.body.zoneId || undefined,
          widthMm: req.body.widthMm || undefined,
          heightMm: req.body.heightMm || undefined,
          dpi: req.body.dpi || undefined,
          designId: req.body.designId || undefined,
        });
        const asset = await createAsset(sql, storage, config, {
          kind: meta.kind, buffer: req.file!.buffer, view: meta.view, zoneId: meta.zoneId,
          widthMm: meta.widthMm, heightMm: meta.heightMm, dpi: meta.dpi, designId: meta.designId,
        });
        res.status(201).json({
          id: asset.id, url: await assetUrl(storage, asset, 24 * 3600),
          width: asset.width, height: asset.height, bytes: asset.bytes, mime: asset.mime,
        });
      })().catch(next);
    });
  });

  // ---------- designs ----------
  app.post('/api/designs', rateLimit(60, 60_000), async (req, res) => {
    const body = designPayloadSchema.parse(req.body);
    const product = await getProduct(sql, body.productId);
    const check = validateDesign(body.document, product);
    if (!check.ok) throw badRequest('DESIGN_INVALID', 'Design invalide.', check.errors);
    if (!product.methods.includes(check.document.printMethod as never)) {
      throw badRequest('METHOD', 'Méthode d’impression incompatible avec ce produit.');
    }
    const ids = designAssetIds(check.document);
    if (ids.length) {
      const { rows } = await sql.query<{ id: string; kind: string }>('select id, kind from assets where id = any($1::uuid[])', [ids]);
      const found = new Map(rows.map(r => [r.id, r.kind]));
      for (const id of ids) {
        if (!found.has(id)) throw badRequest('ASSET_UNKNOWN', `Image source introuvable : ${id}.`);
        if (found.get(id) !== 'source') throw badRequest('ASSET_KIND', 'Seules les images importées peuvent être utilisées dans un design.');
      }
    }
    const id = newId();
    await sql.query('insert into designs (id, product_id, document) values ($1, $2, $3::jsonb)', [id, product.id, JSON.stringify(check.document)]);
    res.status(201).json({
      id, productId: product.id, document: check.document,
      createdAt: new Date().toISOString(),
      assetUrls: await sourceUrls(sql, storage, ids),
    });
  });

  app.get('/api/designs/:id', async (req, res) => {
    const { rows } = await sql.query<{ id: string; product_id: string; document: unknown; created_at: string }>(
      'select id, product_id, document, created_at from designs where id = $1', [req.params.id],
    );
    const row = rows[0];
    if (!row) throw notFound('Design introuvable.');
    const doc = row.document as { zones?: Record<string, { layers?: { type?: string; assetId?: string }[] }> };
    const ids = new Set<string>();
    for (const z of Object.values(doc.zones ?? {})) for (const l of z.layers ?? []) if (l.type === 'image' && l.assetId) ids.add(l.assetId);
    res.json({
      id: row.id, productId: row.product_id, document: row.document,
      createdAt: new Date(row.created_at).toISOString(),
      assetUrls: await sourceUrls(sql, storage, [...ids]),
    });
  });

  // ---------- commandes ----------
  app.post('/api/orders', rateLimit(20, 60_000), async (req, res) => {
    const body = checkoutPayloadSchema.parse(req.body) as CheckoutPayload;
    const { order, accessToken } = await createOrder(sql, storage, config, body);
    res.status(201).json({ order, accessToken });
  });

  app.get('/api/orders/:id', async (req, res) => {
    const token = String(req.query.access ?? '');
    if (token.length < 20) throw notFound('Commande introuvable.');
    const order = await getOrderForCustomer(sql, storage, req.params.id, token);
    // Les fichiers de production ne sont jamais exposés au client.
    const clean = { ...order, items: order.items.map(i => ({ ...i, zones: i.zones.map(z => ({ ...z, productionAssetId: undefined })) })) };
    res.json({ order: clean });
  });

  // ---------- fichiers locaux signés (développement) ----------
  if (storage instanceof LocalStorage) {
    app.use('/api/files', async (req, res, next) => {
      try {
        const key = decodeURIComponent(req.path.replace(/^\/+/, ''));
        const exp = Number(req.query.exp), sig = String(req.query.sig ?? '');
        if (!storage.verifyUrl(key, exp, sig)) throw notFound('Fichier introuvable.');
        const buf = await storage.get(key);
        res.setHeader('Content-Type', MIME_BY_EXT[key.split('.').pop() ?? ''] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.end(buf);
      } catch (err) { next(err); }
    });
  }

  // ---------- administration ----------
  const loginLimiter = rateLimit(10, 60_000);
  const secureCookie = config.publicUrl.startsWith('https://');

  app.post('/api/admin/login', loginLimiter, async (req, res) => {
    const body = adminLoginSchema.parse(req.body);
    const ok = body.email.trim().toLowerCase() === config.adminEmail && verifyPassword(body.password, config.adminPasswordHash);
    // Délai constant grossier pour limiter l'énumération.
    if (!ok) { await new Promise(r => setTimeout(r, 250)); throw new HttpError(401, 'INVALID_CREDENTIALS', 'Identifiants invalides.'); }
    setSessionCookie(res, signSession(config.sessionSecret, config.adminEmail), secureCookie);
    res.json({ email: config.adminEmail });
  });

  app.post('/api/admin/logout', (_req, res) => {
    clearSessionCookie(res, secureCookie);
    res.json({ ok: true });
  });

  const guard = adminGuard(config.sessionSecret);
  app.get('/api/admin/session', guard, (req, res) => {
    const admin = (req as Request & { admin?: { email: string } }).admin;
    res.json({ email: admin?.email ?? config.adminEmail });
  });

  // Protection CSRF : les mutations admin exigent un en-tête personnalisé, impossible à envoyer depuis un simple formulaire.
  const csrf = (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET' || req.method === 'HEAD') { next(); return; }
    if (req.headers['x-dprinting-csrf'] !== '1') {
      res.status(403).json({ error: { code: 'CSRF', message: 'En-tête de sécurité manquant.' } });
      return;
    }
    const origin = req.headers.origin;
    if (origin && !origin.startsWith(config.publicUrl) && origin !== `${req.protocol}://${req.headers.host}`) {
      res.status(403).json({ error: { code: 'CSRF', message: 'Origine non autorisée.' } });
      return;
    }
    next();
  };

  const admin = express.Router();
  admin.use(guard, csrf);
  admin.get('/products', async (_req, res) => { res.json({ products: await listProducts(sql, true) }); });
  admin.post('/products', async (req, res) => { res.status(201).json({ product: await saveProduct(sql, req.body, 'create') }); });
  admin.put('/products/:id', async (req, res) => {
    const body = { ...(req.body as Record<string, unknown>), id: req.params.id };
    res.json({ product: await saveProduct(sql, body, 'update') });
  });
  admin.delete('/products/:id', async (req, res) => { await disableProduct(sql, req.params.id); res.json({ ok: true }); });
  admin.get('/orders', async (req, res) => {
    const limit = Number(req.query.limit ?? 50), offset = Number(req.query.offset ?? 0);
    res.json({ orders: await adminListOrders(sql, Number.isFinite(limit) ? limit : 50, Number.isFinite(offset) ? offset : 0) });
  });
  admin.get('/orders/:id', async (req, res) => { res.json({ order: await adminGetOrder(sql, storage, req.params.id) }); });
  admin.patch('/orders/:id', async (req, res) => {
    const body = orderPatchSchema.parse(req.body);
    await updateOrderStatus(sql, req.params.id, body.status);
    res.json({ ok: true });
  });
  admin.get('/stats', async (_req, res) => { res.json(await orderStats(sql)); });
  app.use('/api/admin', admin);

  // ---------- interface web ----------
  if (fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist, {
      index: false,
      maxAge: '1h',
      setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); },
    }));
    app.get(/^(?!\/api\/).*/, (_req, res) => { res.sendFile(path.join(config.webDist, 'index.html')); });
  }

  app.use('/api', (_req, _res) => { throw notFound('Route API inconnue.'); });
  app.use(errorHandler);
  return app;
}
