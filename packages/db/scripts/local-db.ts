/**
 * Development database without installing PostgreSQL system-wide.
 *
 *   npm run db:local
 *
 * Runs a real PostgreSQL 17 server (binaries from the `embedded-postgres`
 * npm package) on localhost:5433 with data stored in `.pgdata/` at the repo
 * root. Keep this terminal open while developing; Ctrl+C stops the server.
 * Only listens on localhost. For production use a managed PostgreSQL.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createServerFor, initCluster } from '../src/embedded';

const dataDir = fileURLToPath(new URL('../../../.pgdata', import.meta.url));
const port = Number(process.env.LOCAL_DB_PORT ?? 5433);
const user = 'postgres';
const password = process.env.LOCAL_DB_PASSWORD ?? 'localdev';
const database = 'imgapp';

const server = createServerFor(dataDir, port, user, password, true);

async function main(): Promise<void> {
  if (!existsSync(dataDir)) {
    console.log('Creating a new local database cluster in .pgdata/ (first run only)...');
    await initCluster(dataDir, user, password);
  }
  await server.start();

  const client = new pg.Client({ host: 'localhost', port, user, password, database: 'postgres' });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  await client.end();
  if (exists.rowCount === 0) await server.createDatabase(database);

  const url = `postgresql://${user}:${password}@localhost:${port}/${database}?schema=public`;
  console.log('\nLocal PostgreSQL is running.');
  console.log(`  DATABASE_URL=${url}`);
  console.log('\nKeep this window open. Press Ctrl+C to stop.\n');
}

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping local PostgreSQL...');
  await server.stop().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

main().catch(async (err: unknown) => {
  console.error('Could not start local PostgreSQL:', err instanceof Error ? err.message : err);
  console.error(`Is port ${port} already in use? Set LOCAL_DB_PORT to use another port.`);
  await server.stop().catch(() => {});
  process.exit(1);
});
