import { productionPixels } from '@dprinting/core';
import type { AppConfig } from './config';
import { newId, sha256, type Sql } from './db';
import { badRequest, notFound } from './errors';
import { assertProductionPng, checksum, inspectImage } from './png';
import { storageKey, type Storage } from './storage';

export type AssetKind = 'source' | 'preview' | 'production';
export type AssetRow = {
  id: string;
  kind: AssetKind;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  dpi: number | null;
  storage_key: string;
  checksum: string | null;
  design_id: string | null;
  order_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type UploadInput = {
  kind: AssetKind;
  buffer: Buffer;
  view?: 'face' | 'back' | 'left' | 'right';
  zoneId?: string;
  widthMm?: number;
  heightMm?: number;
  dpi?: number;
  designId?: string;
};

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export async function createAsset(sql: Sql, storage: Storage, config: AppConfig, input: UploadInput): Promise<AssetRow> {
  const { kind, buffer } = input;
  if (!buffer.length) throw badRequest('EMPTY_FILE', 'Fichier vide.');

  if (kind === 'source') {
    if (buffer.length > config.limits.sourceBytes) throw badRequest('FILE_TOO_LARGE', 'Image trop volumineuse (15 Mo maximum).');
    const info = inspectImage(buffer);
    if (info.width < 32 || info.height < 32 || info.width > 8000 || info.height > 8000) {
      throw badRequest('IMAGE_SIZE', 'L’image doit mesurer entre 32 et 8000 pixels de côté.');
    }
    return persist(sql, storage, { kind, buffer, mime: info.mime, width: info.width, height: info.height, dpi: null, meta: {} });
  }

  if (!input.designId) throw badRequest('DESIGN_REQUIRED', 'Un design est requis pour ce type de fichier.');
  const design = await sql.query('select product_id from designs where id = $1', [input.designId]);
  if (!design.rows.length) throw notFound('Design introuvable.');

  if (kind === 'preview') {
    if (buffer.length > config.limits.previewBytes) throw badRequest('FILE_TOO_LARGE', 'Aperçu trop volumineux.');
    if (!input.view) throw badRequest('VIEW_REQUIRED', 'La vue (face, back, left, right) est obligatoire pour un aperçu.');
    const info = inspectImage(buffer);
    if (info.mime !== 'image/png') throw badRequest('PREVIEW_PNG', 'Les aperçus doivent être des PNG.');
    const side = Math.max(info.width, info.height), small = Math.min(info.width, info.height);
    if (small < config.limits.previewMinSide || side > config.limits.previewMaxSide) {
      throw badRequest('PREVIEW_SIZE', `Un aperçu doit mesurer entre ${config.limits.previewMinSide} et ${config.limits.previewMaxSide} pixels.`);
    }
    return persist(sql, storage, {
      kind, buffer, mime: info.mime, width: info.width, height: info.height, dpi: info.dpiX ? Math.round(info.dpiX) : null,
      designId: input.designId, meta: { view: input.view },
    });
  }

  // production
  if (buffer.length > config.limits.productionBytes) throw badRequest('FILE_TOO_LARGE', 'Fichier de production trop volumineux.');
  if (!input.zoneId || !input.widthMm || !input.heightMm || !input.dpi) {
    throw badRequest('PRODUCTION_META', 'zoneId, widthMm, heightMm et dpi sont obligatoires pour un fichier de production.');
  }
  if (input.widthMm <= 0 || input.heightMm <= 0 || input.dpi < 72 || input.dpi > 1200) {
    throw badRequest('PRODUCTION_META', 'Dimensions ou DPI de production invalides.');
  }
  const px = productionPixels(input.widthMm, input.heightMm, input.dpi);
  if (px.width > config.limits.productionMaxSide || px.height > config.limits.productionMaxSide) {
    throw badRequest('PRODUCTION_SIZE', `Fichier trop grand (${px.width}×${px.height} px).`);
  }
  const info = assertProductionPng(buffer, { ...px, dpi: input.dpi });
  return persist(sql, storage, {
    kind, buffer, mime: 'image/png', width: info.width, height: info.height, dpi: input.dpi,
    designId: input.designId,
    meta: { zoneId: input.zoneId, widthMm: input.widthMm, heightMm: input.heightMm, dpi: input.dpi },
  });
}

async function persist(
  sql: Sql, storage: Storage,
  a: { kind: AssetKind; buffer: Buffer; mime: string; width: number | null; height: number | null; dpi: number | null; designId?: string; meta: Record<string, unknown> },
): Promise<AssetRow> {
  const id = newId();
  const key = storageKey(a.kind, id, EXT[a.mime] ?? 'bin');
  await storage.put(key, a.buffer, a.mime);
  try {
    const { rows } = await sql.query<AssetRow>(
      `insert into assets (id, kind, mime, bytes, width, height, dpi, storage_key, checksum, design_id, meta)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       returning *`,
      [id, a.kind, a.mime, a.buffer.length, a.width, a.height, a.dpi, key, checksum(a.buffer), a.designId ?? null, JSON.stringify(a.meta)],
    );
    return rows[0];
  } catch (err) {
    await storage.remove(key).catch(() => undefined);
    throw err;
  }
}

export async function getAsset(sql: Sql, id: string): Promise<AssetRow> {
  const { rows } = await sql.query<AssetRow>('select * from assets where id = $1', [id]);
  if (!rows[0]) throw notFound('Fichier introuvable.');
  return rows[0];
}

export async function assetUrl(storage: Storage, asset: AssetRow, ttl = 3600): Promise<string> {
  return storage.signedUrl(asset.storage_key, ttl);
}

export async function sourceUrls(sql: Sql, storage: Storage, ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { rows } = await sql.query<AssetRow>('select * from assets where id = any($1::uuid[])', [ids]);
  const out: Record<string, string> = {};
  await Promise.all(rows.map(async r => { out[r.id] = await assetUrl(storage, r, 24 * 3600); }));
  return out;
}

/** Le fichier doit avoir été téléversé pour ce design précis : impossible de réutiliser celui d'un autre client. */
export function assertBelongsToDesign(asset: AssetRow, designId: string): void {
  if (asset.design_id !== designId) throw badRequest('ASSET_DESIGN_MISMATCH', 'Ce fichier n’appartient pas au design commandé.');
}

export const assetChecksum = (buf: Buffer): string => sha256(buf);
