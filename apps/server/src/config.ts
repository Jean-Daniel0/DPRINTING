import path from 'node:path';

export type AppConfig = {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  publicUrl: string;
  databaseUrl: string | null;
  pgliteDir: string | null;
  storageDriver: 'local' | 'supabase';
  dataDir: string;
  supabase: { url: string; serviceRoleKey: string; bucket: string } | null;
  sessionSecret: string;
  adminEmail: string;
  adminPasswordHash: string;
  webDist: string;
  limits: {
    sourceBytes: number;
    previewBytes: number;
    productionBytes: number;
    previewMinSide: number;
    previewMaxSide: number;
    productionMaxSide: number;
  };
};

const int = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

/**
 * Toute la configuration vient de l'environnement. En production, les secrets obligatoires
 * font échouer le démarrage : aucune valeur par défaut silencieuse.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  const isProd = nodeEnv === 'production';
  const dataDir = path.resolve(env.DATA_DIR || '.data');
  const storageDriver = env.STORAGE_DRIVER === 'supabase' ? 'supabase' : 'local';

  if (isProd && !env.SESSION_SECRET) throw new Error('SESSION_SECRET est obligatoire en production.');
  if (isProd && storageDriver === 'local') {
    throw new Error('STORAGE_DRIVER=local est interdit en production : le disque de Render est éphémère. Configurez Supabase Storage.');
  }
  if (storageDriver === 'supabase') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont obligatoires pour le stockage Supabase.');
    }
  }
  if (isProd && (!env.DATABASE_URL || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD_HASH)) {
    throw new Error('DATABASE_URL, ADMIN_EMAIL et ADMIN_PASSWORD_HASH sont obligatoires en production.');
  }

  return {
    nodeEnv,
    port: int(env.PORT, 3000),
    publicUrl: (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
    databaseUrl: env.DATABASE_URL || null,
    pgliteDir: env.DATABASE_URL ? null : (env.PGLITE_DIR === ':memory:' || env.PGLITE_DIR === 'memory://') ? ':memory:' : path.resolve(env.PGLITE_DIR || path.join(dataDir, 'pglite')),
    storageDriver,
    dataDir,
    supabase: storageDriver === 'supabase'
      ? { url: env.SUPABASE_URL!, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!, bucket: env.SUPABASE_BUCKET || 'dprinting' }
      : null,
    sessionSecret: env.SESSION_SECRET || 'dev-only-session-secret-change-me',
    adminEmail: (env.ADMIN_EMAIL || 'admin@dprinting.local').toLowerCase(),
    // Hash de « dprinting-dev » : utilisé uniquement hors production. Voir `npm run admin:hash`.
    adminPasswordHash: env.ADMIN_PASSWORD_HASH || 'scrypt$16384$8$1$X+5395ez942RloH08PFH2Q==$EjCoyK+ythNmbN3TiNRZ8XY35lTQqdNr6HKNLOxPZv2j7enw8aOJ1e6aFDPVN7oSRG3IXoXsrsixGdgotr8Mgg==',
    webDist: path.resolve(env.WEB_DIST || 'apps/web/dist'),
    limits: {
      sourceBytes: int(env.MAX_SOURCE_MB, 15) * 1024 * 1024,
      previewBytes: int(env.MAX_PREVIEW_MB, 25) * 1024 * 1024,
      productionBytes: int(env.MAX_PRODUCTION_MB, 60) * 1024 * 1024,
      previewMinSide: 800,
      previewMaxSide: 3000,
      productionMaxSide: 6000,
    },
  };
}
