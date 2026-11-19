import crypto from 'node:crypto';
import {
  PRINT_METHODS, PREVIEW_VIEWS, printedZones, productionPixels, quote, validateDesign,
  type CheckoutPayload, type DesignDocument, type OrderItemSnapshot, type OrderRecord, type OrderStatus,
  type PreviewView, type ProductDef, type QuoteResult,
} from '@dprinting/core';
import type { AppConfig } from './config';
import { newId, type Sql } from './db';
import { badRequest, notFound } from './errors';
import { assertBelongsToDesign, assetUrl, getAsset, type AssetRow } from './assets';
import { getProduct } from './products';
import type { Storage } from './storage';

type OrderRow = {
  id: string; number: string | number; status: OrderStatus; email: string; customer: unknown;
  items: StoredItem[]; totals: StoredTotals; access_token_hash: string;
  created_at: string | Date; updated_at: string | Date;
};

type StoredTotals = { subtotalCents: number; discountCents: number; shippingCents: number; totalCents: number; currency: 'EUR' };
type StoredItem = Omit<OrderItemSnapshot, 'previews' | 'zones'> & {
  previews: { view: PreviewView; assetId: string }[];
  zones: (OrderItemSnapshot['zones'][number])[];
};

const tokenHash = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

export async function createOrder(sql: Sql, storage: Storage, config: AppConfig, payload: CheckoutPayload): Promise<{ order: OrderRecord; accessToken: string }> {
  const items: OrderItemSnapshot[] = [];
  const usedAssetIds: string[] = [];

  for (const item of payload.items) {
    const design = await sql.query<{ id: string; product_id: string; document: DesignDocument }>(
      'select id, product_id, document from designs where id = $1', [item.designId],
    );
    const designRow = design.rows[0];
    if (!designRow) throw notFound('Design introuvable.');
    if (designRow.product_id !== item.productId) throw badRequest('DESIGN_PRODUCT', 'Le design ne correspond pas au produit commandé.');

    const product = await getProduct(sql, item.productId, true);
    const check = validateDesign(designRow.document, product);
    if (!check.ok) throw badRequest('DESIGN_INVALID', 'Le design enregistré est invalide.', check.errors);
    const document = check.document;

    if (!product.colors.some(c => c.id === item.previewColorId)) throw badRequest('PREVIEW_COLOR', 'Couleur d’aperçu inconnue.');
    if (item.material && !product.materials.includes(item.material)) throw badRequest('MATERIAL', 'Matériau incompatible.');

    const methodInfo = PRINT_METHODS[item.printMethod];
    if (!methodInfo?.productionReady) throw badRequest('METHOD', methodInfo?.statusNote ?? 'Méthode non disponible.');

    const zones = printedZones(document, product, methodInfo.minDpi);
    if (!zones.length) throw badRequest('NO_PRINT', 'Le design ne contient aucun élément imprimable.');
    const pricing: QuoteResult = quote({
      product,
      printMethod: item.printMethod,
      material: item.material,
      variants: item.variants,
      zones: zones.map(z => ({ zoneId: z.zoneId, widthMm: z.widthMm, heightMm: z.heightMm })),
    });

    // --- Aperçus : exactement quatre vues fixes, toutes liées à ce design ---
    const previews: { view: PreviewView; assetId: string }[] = [];
    const previewRows: AssetRow[] = [];
    for (const view of PREVIEW_VIEWS) {
      const assetId = item.previews[view];
      const asset = await getAsset(sql, assetId);
      if (asset.kind !== 'preview') throw badRequest('PREVIEW_KIND', `L’aperçu « ${view} » n’est pas un aperçu.`);
      assertBelongsToDesign(asset, item.designId);
      if (asset.meta.view !== view) throw badRequest('PREVIEW_VIEW', `L’aperçu fourni pour « ${view} » a été généré pour une autre vue.`);
      previewRows.push(asset);
      previews.push({ view, assetId });
      usedAssetIds.push(assetId);
    }
    const dims = new Set(previewRows.map(a => `${a.width}x${a.height}`));
    if (dims.size !== 1) throw badRequest('PREVIEW_DIMS', 'Les quatre aperçus doivent avoir exactement les mêmes dimensions.');

    // --- Fichiers de production : un PNG exact par zone réellement imprimée ---
    const productionAssets = new Map<string, string>();
    for (const p of item.productionAssets) {
      if (productionAssets.has(p.zoneId)) throw badRequest('PRODUCTION_DUPLICATE', `Fichier de production en double pour la zone ${p.zoneId}.`);
      productionAssets.set(p.zoneId, p.assetId);
    }
    const zoneSnapshots: OrderItemSnapshot['zones'] = [];
    for (const zone of zones) {
      const assetId = productionAssets.get(zone.zoneId);
      if (!assetId) throw badRequest('PRODUCTION_MISSING', `Fichier de production manquant pour la zone « ${zone.label} ».`);
      const asset = await getAsset(sql, assetId);
      if (asset.kind !== 'production') throw badRequest('PRODUCTION_KIND', 'Fichier de production attendu.');
      assertBelongsToDesign(asset, item.designId);
      if (asset.meta.zoneId !== zone.zoneId) throw badRequest('PRODUCTION_ZONE', `Le fichier fourni ne correspond pas à la zone « ${zone.label} ».`);
      if (Math.abs(Number(asset.meta.widthMm) - zone.widthMm) > 0.25 || Math.abs(Number(asset.meta.heightMm) - zone.heightMm) > 0.25) {
        throw badRequest('PRODUCTION_DIMS', `Dimensions du fichier différentes du design pour la zone « ${zone.label} ».`);
      }
      if (Number(asset.meta.dpi) !== zone.dpi) throw badRequest('PRODUCTION_DPI', `Résolution inattendue pour la zone « ${zone.label} ».`);
      const expected = productionPixels(zone.widthMm, zone.heightMm, zone.dpi);
      if (asset.width !== expected.width || asset.height !== expected.height) {
        throw badRequest('PRODUCTION_PIXELS', `Le fichier de production de « ${zone.label} » ne fait pas ${expected.width}×${expected.height} px.`);
      }
      zoneSnapshots.push({
        zoneId: zone.zoneId, label: zone.label, widthMm: zone.widthMm, heightMm: zone.heightMm,
        dpi: zone.dpi, productionAssetId: assetId,
      });
      usedAssetIds.push(assetId);
    }
    if (productionAssets.size !== zones.length) throw badRequest('PRODUCTION_EXTRA', 'Des fichiers de production ne correspondent à aucune zone imprimée.');

    items.push({
      id: newId(),
      productId: product.id,
      productName: product.name,
      model: product.model,
      printMethod: item.printMethod,
      material: item.material,
      previewColorId: item.previewColorId,
      variants: pricing.variants,
      quantity: pricing.quantity,
      designId: item.designId,
      designDocument: document,
      zones: zoneSnapshots,
      previews: previews.map(p => ({ ...p, url: '' })),
      unitPriceCents: pricing.unitPriceCents,
      totalCents: pricing.totalCents,
      pricing,
    });
  }

  const subtotalCents = items.reduce((s, i) => s + i.pricing.subtotalCents, 0);
  const discountCents = items.reduce((s, i) => s + i.pricing.discountCents, 0);
  const shippingCents = 0; // livraison offerte en v1, champ conservé pour la facturation
  const totalCents = items.reduce((s, i) => s + i.totalCents, 0) + shippingCents;
  const totals: StoredTotals = { subtotalCents, discountCents, shippingCents, totalCents, currency: 'EUR' };

  const id = newId();
  const accessToken = crypto.randomBytes(24).toString('base64url');
  const storedItems: StoredItem[] = items.map(i => ({ ...i, previews: i.previews.map(p => ({ view: p.view, assetId: p.assetId })) }));

  const inserted = await sql.query<{ number: string | number; created_at: string | Date; updated_at: string | Date }>(
    `insert into orders (id, status, email, customer, items, totals, access_token_hash)
     values ($1, 'pending', $2, $3::jsonb, $4::jsonb, $5::jsonb, $6)
     returning number, created_at, updated_at`,
    [id, payload.customer.email.toLowerCase(), JSON.stringify(payload.customer), JSON.stringify(storedItems), JSON.stringify(totals), tokenHash(accessToken)],
  );
  await sql.query('update assets set order_id = $1 where id = any($2::uuid[])', [id, usedAssetIds]);

  const row = inserted.rows[0];
  const order: OrderRecord = {
    id,
    number: Number(row.number),
    status: 'pending',
    customer: payload.customer,
    items,
    ...totals,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
  await hydratePreviews(sql, storage, order);
  return { order, accessToken };
}

async function hydratePreviews(sql: Sql, storage: Storage, order: OrderRecord): Promise<void> {
  for (const item of order.items) {
    for (const p of item.previews) {
      try {
        const asset = await getAsset(sql, p.assetId);
        p.url = await assetUrl(storage, asset, 3600);
      } catch { p.url = ''; }
    }
  }
}

function hydrateStoredPreviews(items: StoredItem[]): OrderItemSnapshot[] {
  return items.map(i => ({
    ...i,
    previews: i.previews.map(p => ({ ...p, url: '' })),
  }));
}

export async function getOrderForCustomer(sql: Sql, storage: Storage, id: string, token: string): Promise<OrderRecord> {
  const { rows } = await sql.query<OrderRow>('select * from orders where id = $1', [id]);
  const row = rows[0];
  if (!row) throw notFound('Commande introuvable.');
  const a = Buffer.from(tokenHash(token)), b = Buffer.from(row.access_token_hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw notFound('Commande introuvable.');
  return toOrder(row, hydrateStoredPreviews(row.items));
}

export async function adminListOrders(sql: Sql, limit = 50, offset = 0): Promise<unknown[]> {
  const { rows } = await sql.query<OrderRow>(
    'select * from orders order by created_at desc limit $1 offset $2', [Math.min(200, Math.max(1, limit)), Math.max(0, offset)],
  );
  return rows.map(r => ({
    id: r.id,
    number: Number(r.number),
    status: r.status,
    email: r.email,
    customer: r.customer,
    totals: r.totals,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    quantity: r.items.reduce((s, i) => s + i.quantity, 0),
    products: [...new Set(r.items.map(i => i.productName))].join(', '),
  }));
}

export async function adminGetOrder(sql: Sql, storage: Storage, id: string): Promise<OrderRecord & { productionUrls: Record<string, string> }> {
  const { rows } = await sql.query<OrderRow>('select * from orders where id = $1', [id]);
  const row = rows[0];
  if (!row) throw notFound('Commande introuvable.');
  const order = toOrder(row, hydrateStoredPreviews(row.items));
  await hydratePreviews(sql, storage, order);
  const productionUrls: Record<string, string> = {};
  for (const item of order.items) {
    for (const z of item.zones) {
      const asset = await getAsset(sql, z.productionAssetId);
      productionUrls[z.productionAssetId] = await assetUrl(storage, asset, 3600);
    }
  }
  return { ...order, productionUrls };
}

function toOrder(row: OrderRow, items: OrderItemSnapshot[]): OrderRecord {
  return {
    id: row.id,
    number: Number(row.number),
    status: row.status,
    customer: row.customer as OrderRecord['customer'],
    items,
    ...row.totals,
    currency: 'EUR',
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function updateOrderStatus(sql: Sql, id: string, status: OrderStatus): Promise<void> {
  const r = await sql.query('update orders set status = $2, updated_at = now() where id = $1 returning id', [id, status]);
  if (!r.rows.length) throw notFound('Commande introuvable.');
}

export async function orderStats(sql: Sql): Promise<{ orders: number; pending: number; revenueCents: number }> {
  const { rows } = await sql.query<{ orders: string; pending: string; revenue: string | null }>(
    `select count(*) as orders,
            count(*) filter (where status = 'pending') as pending,
            coalesce(sum((totals->>'totalCents')::int) filter (where status <> 'cancelled'), 0) as revenue
     from orders`,
  );
  const r = rows[0];
  return { orders: Number(r.orders), pending: Number(r.pending), revenueCents: Number(r.revenue ?? 0) };
}

export type { StoredItem };
export type AdminProductList = ProductDef[];
