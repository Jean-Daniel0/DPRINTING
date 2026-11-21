/**
 * Installe un keep-alive côté Supabase : pg_cron appelle /api/ping toutes les 10 minutes
 * via pg_net. Aucun fichier GitHub Actions ni scope `workflow` n'est nécessaire.
 *
 * Usage :
 *   npm run keepalive:setup -w @dprinting/server
 *
 * Variables lues depuis l'environnement ou `.env.local` à la racine du dépôt :
 *   DATABASE_URL            (obligatoire)
 *   KEEPALIVE_URL           (défaut : https://dprinting.onrender.com/api/ping)
 *
 * Le script est idempotent : il retire l'ancienne tâche avant de la recréer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

function loadEnvLocal() {
  const candidates = [path.resolve('.env.local'), path.resolve('../../.env.local')];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const key = match[1];
      if (process.env[key]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL manquant.');
  process.exit(1);
}

const target = process.env.KEEPALIVE_URL ?? 'https://dprinting.onrender.com/api/ping';
const jobName = 'dprinting-keepalive';

const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  const available = await client.query<{ name: string }>(
    "select name from pg_available_extensions where name in ('pg_cron','pg_net') order by name",
  );
  const names = available.rows.map((row) => row.name);
  console.log('Extensions disponibles :', names.join(', ') || 'aucune');

  if (!names.includes('pg_cron') || !names.includes('pg_net')) {
    console.error(
      'pg_cron et pg_net doivent être activés dans Supabase (Dashboard → Database → Extensions).',
    );
    process.exitCode = 2;
  } else {
    await client.query('create extension if not exists pg_cron');
    await client.query('create extension if not exists pg_net');

    // Retire l'ancienne planification si elle existe (idempotence).
    const existing = await client.query<{ jobid: number }>(
      'select jobid from cron.job where jobname = $1',
      [jobName],
    );
    for (const row of existing.rows) {
      await client.query('select cron.unschedule($1::bigint)', [row.jobid]);
      console.log('Ancienne tâche retirée :', row.jobid);
    }

    const sql = `select net.http_get(url := ${quote(target)})`;
    const created = await client.query<{ jobid: number }>(
      `select cron.schedule($1, '*/10 * * * *', $2) as jobid`,
      [jobName, sql],
    );
    console.log('Tâche créée :', created.rows[0]?.jobid, '→', target, 'toutes les 10 minutes');

    // Vérification immédiate : le job doit apparaître planifié.
    const check = await client.query<{ jobid: number; schedule: string; active: boolean }>(
      'select jobid, schedule, active from cron.job where jobname = $1',
      [jobName],
    );
    console.table(check.rows);

    if (process.argv.includes('--status')) {
      const runs = await client.query(
        'select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5',
      );
      console.log('\nDernières exécutions :');
      console.table(runs.rows);
      const responses = await client.query(
        'select status_code, timed_out, error_msg from net._http_response order by created desc limit 5',
      );
      console.log('\nDernières réponses HTTP :');
      console.table(responses.rows);
    }
  }
} finally {
  await client.end();
}

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
