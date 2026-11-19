import { buildTshirt, type ProductDef } from '@dprinting/core';
import type { Sql } from './db';
import { badRequest, notFound } from './errors';
import { productSchema } from './schemas';

type ProductRow = { id: string; data: ProductDef; active: boolean; updated_at: string };

// Capacités réelles du maillage : une zone admin ne peut pas dépasser le tissu disponible.
let capacity: Record<'front' | 'back', { uMin: number; uMax: number; vMin: number; vMax: number }> | null = null;
function modelCapacity() {
  if (!capacity) {
    const model = buildTshirt({ folds: false, columns: 64, bodyRings: 24, yokeRings: 10 });
    capacity = { front: model.front.extents, back: model.back.extents };
  }
  return capacity;
}

export function assertZonesFit(product: ProductDef): void {
  const cap = modelCapacity();
  for (const z of product.zones) {
    if (z.panel !== 'front' && z.panel !== 'back') {
      throw badRequest('ZONE_PANEL', `Le modèle T-shirt ne possède pas de panneau « ${z.panel} ».`);
    }
    const e = cap[z.panel];
    const half = Math.min(Math.abs(e.uMin), e.uMax) - 5;
    if (z.widthMm / 2 > half) {
      throw badRequest('ZONE_TOO_WIDE', `La zone « ${z.label} » (${z.widthMm} mm) dépasse la largeur imprimable du modèle (${Math.round(half * 2)} mm).`);
    }
    if (z.offsetTopMm + z.heightMm > e.vMax - 5) {
      throw badRequest('ZONE_TOO_TALL', `La zone « ${z.label} » dépasse le bas du panneau (${Math.round(e.vMax - 5)} mm disponibles).`);
    }
  }
}

export async function listProducts(sql: Sql, includeInactive = false): Promise<ProductDef[]> {
  const { rows } = await sql.query<ProductRow>(
    `select id, data, active, updated_at from products ${includeInactive ? '' : 'where active = true'} order by data->>'category', data->>'name'`,
  );
  return rows.map(r => ({ ...r.data, active: r.active }));
}

export async function getProduct(sql: Sql, id: string, includeInactive = false): Promise<ProductDef> {
  const { rows } = await sql.query<ProductRow>('select id, data, active, updated_at from products where id = $1', [id]);
  const row = rows[0];
  if (!row || (!includeInactive && !row.active)) throw notFound(`Produit introuvable : ${id}.`);
  return { ...row.data, active: row.active };
}

export async function productWithMeta(sql: Sql, id: string): Promise<{ product: ProductDef; updatedAt: string }> {
  const { rows } = await sql.query<ProductRow>('select id, data, active, updated_at from products where id = $1', [id]);
  if (!rows[0]) throw notFound();
  return { product: { ...rows[0].data, active: rows[0].active }, updatedAt: rows[0].updated_at };
}

export async function saveProduct(sql: Sql, input: unknown, mode: 'create' | 'update'): Promise<ProductDef> {
  const parsed = productSchema.parse(input) as ProductDef;
  assertZonesFit(parsed);
  if (mode === 'create') {
    const existing = await sql.query('select 1 from products where id = $1', [parsed.id]);
    if (existing.rows.length) throw badRequest('PRODUCT_EXISTS', `Un produit utilise déjà l’identifiant « ${parsed.id} ».`);
    await sql.query('insert into products (id, data, active) values ($1, $2::jsonb, $3)', [parsed.id, JSON.stringify(parsed), parsed.active]);
  } else {
    const updated = await sql.query(
      'update products set data = $2::jsonb, active = $3, updated_at = now() where id = $1 returning id',
      [parsed.id, JSON.stringify(parsed), parsed.active],
    );
    if (!updated.rows.length) throw notFound(`Produit introuvable : ${parsed.id}.`);
  }
  return parsed;
}

export async function disableProduct(sql: Sql, id: string): Promise<void> {
  const r = await sql.query('update products set active = false, updated_at = now() where id = $1 returning id', [id]);
  if (!r.rows.length) throw notFound();
}
