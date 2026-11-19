// Accès SQL minimal, compatible PostgreSQL managé (Supabase) et PGlite (PostgreSQL WASM) pour le développement local
// et les tests. Le même SQL est exécuté dans les deux cas : pas de couche ORM qui masquerait les différences.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PRODUCTS } from '@dprinting/core';
import type { AppConfig } from './config';

export type Row = Record<string, unknown>;

export interface Sql {
  readonly driver: 'postgres' | 'pglite';
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(text: string): Promise<void>;
  close(): Promise<void>;
}

export const SCHEMA = `
create table if not exists products (
  id text primary key,
  data jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists designs (
  id uuid primary key,
  product_id text not null references products(id),
  document jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists assets (
  id uuid primary key,
  kind text not null,
  mime text not null,
  bytes integer not null,
  width integer,
  height integer,
  dpi integer,
  storage_key text not null unique,
  checksum text,
  design_id uuid references designs(id) on delete set null,
  order_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assets_design_idx on assets(design_id);
create index if not exists assets_order_idx on assets(order_id);

create table if not exists orders (
  id uuid primary key,
  number bigserial unique,
  status text not null default 'pending',
  email text not null,
  customer jsonb not null,
  items jsonb not null,
  totals jsonb not null,
  access_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_created_idx on orders(created_at desc);
`;

export async function openDatabase(config: AppConfig): Promise<Sql> {
  if (config.databaseUrl) {
    const pgModule = await import('pg');
    const { Pool } = pgModule.default ?? pgModule;
    const needsSsl = !/localhost|127\.0\.0\.1/.test(config.databaseUrl);
    const pool = new Pool({
      connectionString: config.databaseUrl,
      max: Number(process.env.PG_POOL_MAX || 5),
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
    const sql: Sql = {
      driver: 'postgres',
      async query<T extends Row>(text: string, params: unknown[] = []) {
        const res = await pool.query(text, params as never[]);
        return { rows: res.rows as T[] };
      },
      async exec(text: string) { await pool.query(text); },
      async close() { await pool.end(); },
    };
    await sql.query('select 1');
    return sql;
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const dir = config.pgliteDir!;
  const inMemory = dir === ':memory:' || dir === 'memory://';
  if (!inMemory) fs.mkdirSync(path.dirname(dir), { recursive: true });
  // PGlite sans argument = base strictement en mémoire (aucun fichier, aucun état partagé entre tests).
  const db = inMemory ? new PGlite() : new PGlite(dir);
  await db.waitReady;
  const sql: Sql = {
    driver: 'pglite',
    async query<T extends Row>(text: string, params: unknown[] = []) {
      const res = await db.query<T>(text, params as never[]);
      return { rows: res.rows };
    },
    async exec(text: string) { await db.exec(text); },
    async close() { await db.close(); },
  };
  await sql.query('select 1');
  return sql;
}

export async function migrate(sql: Sql): Promise<void> {
  await sql.exec(SCHEMA);
}

/** Insère les produits livrés avec le code s'ils n'existent pas encore. Les modifications admin sont préservées. */
export async function seedProducts(sql: Sql): Promise<void> {
  for (const product of Object.values(PRODUCTS)) {
    await sql.query(
      `insert into products (id, data, active) values ($1, $2::jsonb, $3)
       on conflict (id) do nothing`,
      [product.id, JSON.stringify(product), product.active],
    );
  }
}

export const newId = (): string => crypto.randomUUID();
export const sha256 = (data: Buffer | string): string => crypto.createHash('sha256').update(data).digest('hex');
