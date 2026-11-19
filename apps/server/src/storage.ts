// Stockage des fichiers : Supabase Storage en production, disque local en développement et dans les tests.
// Les fichiers sont privés : l'API ne renvoie que des URLs signées à durée limitée.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig } from './config';

export interface Storage {
  readonly driver: 'local' | 'supabase';
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, ttlSeconds?: number): Promise<string>;
  ensureReady(): Promise<void>;
}

const KEY = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,240}$/;
export function assertSafeKey(key: string): void {
  if (!KEY.test(key) || key.includes('..') || key.includes('//')) throw new Error(`Clé de stockage invalide : ${key}`);
}

export class LocalStorage implements Storage {
  readonly driver = 'local' as const;
  constructor(private readonly root: string, private readonly secret: string, private readonly publicUrl: string) {}

  private file(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Chemin hors du stockage.');
    return full;
  }

  async ensureReady(): Promise<void> { await fs.mkdir(this.root, { recursive: true }); }
  async put(key: string, data: Buffer): Promise<void> {
    const f = this.file(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, data, { mode: 0o600 });
  }
  async get(key: string): Promise<Buffer> { return fs.readFile(this.file(key)); }
  async remove(key: string): Promise<void> { await fs.rm(this.file(key), { force: true }); }

  private signature(key: string, exp: number): string {
    return crypto.createHmac('sha256', this.secret).update(`file:${key}:${exp}`).digest('base64url');
  }

  async signedUrl(key: string, ttlSeconds = 3600): Promise<string> {
    assertSafeKey(key);
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = this.signature(key, exp);
    return `${this.publicUrl}/api/files/${key.split('/').map(encodeURIComponent).join('/')}?exp=${exp}&sig=${sig}`;
  }

  verifyUrl(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = this.signature(key, exp);
    const a = Buffer.from(sig), b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}

export class SupabaseStorage implements Storage {
  readonly driver = 'supabase' as const;
  // Le client est typé de façon minimale pour ne pas dépendre des types générés par Supabase.
  private client: unknown;
  constructor(private readonly cfg: NonNullable<AppConfig['supabase']>) {}

  private async sb(): Promise<any> {
    if (!this.client) {
      const { createClient } = await import('@supabase/supabase-js');
      this.client = createClient(this.cfg.url, this.cfg.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return this.client;
  }

  async ensureReady(): Promise<void> {
    const sb = await this.sb();
    const { error } = await sb.storage.getBucket(this.cfg.bucket);
    if (error) {
      const created = await sb.storage.createBucket(this.cfg.bucket, { public: false });
      if (created.error && !/already exists/i.test(created.error.message)) {
        throw new Error(`Impossible de préparer le bucket Supabase « ${this.cfg.bucket} » : ${created.error.message}`);
      }
    }
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    const sb = await this.sb();
    const { error } = await sb.storage.from(this.cfg.bucket).upload(key, data, { contentType, upsert: false });
    if (error) throw new Error(`Upload Supabase échoué (${key}) : ${error.message}`);
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const sb = await this.sb();
    const { data, error } = await sb.storage.from(this.cfg.bucket).download(key);
    if (error || !data) throw new Error(`Lecture Supabase échouée (${key}) : ${error?.message ?? 'fichier absent'}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(key: string): Promise<void> {
    const sb = await this.sb();
    await sb.storage.from(this.cfg.bucket).remove([key]);
  }

  async signedUrl(key: string, ttlSeconds = 3600): Promise<string> {
    assertSafeKey(key);
    const sb = await this.sb();
    const { data, error } = await sb.storage.from(this.cfg.bucket).createSignedUrl(key, ttlSeconds);
    if (error || !data?.signedUrl) throw new Error(`URL signée impossible (${key}) : ${error?.message ?? 'inconnu'}`);
    return data.signedUrl;
  }
}

export function createStorage(config: AppConfig): Storage {
  if (config.supabase) return new SupabaseStorage(config.supabase);
  return new LocalStorage(path.join(config.dataDir, 'storage'), config.sessionSecret, config.publicUrl);
}

/** Clé stable et sans métadonnées personnelles. */
export function storageKey(prefix: 'source' | 'preview' | 'production', id: string, ext = 'png'): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear(), mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix}/${yyyy}/${mm}/${id}.${ext}`;
}
