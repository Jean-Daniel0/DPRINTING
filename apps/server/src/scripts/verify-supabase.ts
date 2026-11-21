// Vérification d'un projet Supabase réel : schéma, produits livrés, bucket privé et aller-retour
// d'un fichier avec URL signée. À lancer avec `npm run supabase:check` après avoir renseigné .env.local.
import path from 'node:path';
import { loadConfig } from '../config';
import { migrate, openDatabase, seedProducts } from '../db';
import { createStorage } from '../storage';

try {
  // Ce script est lancé depuis apps/server : le fichier vit à la racine du dépôt.
  process.loadEnvFile(path.resolve(import.meta.dirname, '../../../../.env.local'));
} catch {
  // Pas de fichier local : les variables peuvent venir de l'environnement du shell.
}

const config = loadConfig({ ...process.env, STORAGE_DRIVER: 'supabase', NODE_ENV: 'development' });
const sql = await openDatabase(config);
await migrate(sql);
await seedProducts(sql);

const { rows } = await sql.query<{ count: string }>('select count(*)::text as count from products');
console.log(`[supabase] base ${sql.driver} · ${rows[0]?.count ?? 0} produits`);

const storage = createStorage(config);
await storage.ensureReady();
const key = `checks/${Date.now()}-${process.pid}.txt`;
const payload = Buffer.from(`dprinting ${new Date().toISOString()}`);
await storage.put(key, payload, 'text/plain');
const read = await storage.get(key);
if (!read.equals(payload)) throw new Error('Le fichier relu ne correspond pas au fichier envoyé.');
const url = await storage.signedUrl(key, 60);
const res = await fetch(url);
if (!res.ok) throw new Error(`URL signée en échec : HTTP ${res.status}`);
await storage.remove(key);
console.log(`[supabase] stockage ${storage.driver} · bucket « ${config.supabase?.bucket} » · upload, URL signée et suppression OK`);
await sql.close();
