import { buildApp } from './app';
import { loadConfig } from './config';
import { migrate, openDatabase, seedProducts } from './db';
import { createStorage } from './storage';

const config = loadConfig();
const sql = await openDatabase(config);
await migrate(sql);
await seedProducts(sql);
const storage = createStorage(config);
await storage.ensureReady();

const app = buildApp({ config, sql, storage });
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[dprinting] ${config.nodeEnv} · port ${config.port} · base ${sql.driver} · stockage ${storage.driver}`);
  if (config.nodeEnv !== 'production') {
    console.log(`[dprinting] admin de développement : ${config.adminEmail} / dprinting-dev`);
  }
});

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.log(`[dprinting] arrêt (${signal})`);
  server.close(async () => {
    await sql.close().catch(() => undefined);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', err => { console.error('[dprinting] promesse rejetée', err); });
