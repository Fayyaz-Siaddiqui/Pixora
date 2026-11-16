/**
 * Helpers for running a real PostgreSQL from the `embedded-postgres` npm
 * package. DEVELOPMENT AND TESTS ONLY (embedded-postgres is a devDependency).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

/**
 * Create a cluster by calling initdb directly. The library's own
 * initialise() passes a Unix locale name (en_US.UTF-8) that crashes initdb on
 * Windows, so we use the portable C locale with UTF-8 encoding instead.
 */
export async function initCluster(dir: string, superuser: string, password: string): Promise<void> {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const binPkg = `@embedded-postgres/${platform}-${process.arch}`;
  const require = createRequire(import.meta.url);
  const { initdb } = (await import(pathToFileURL(require.resolve(binPkg)).href)) as { initdb: string };
  const pwFile = path.join(tmpdir(), `pg-pw-${process.pid}-${Date.now()}`);
  writeFileSync(pwFile, `${password}\n`, { mode: 0o600 });
  try {
    const r = spawnSync(
      initdb,
      [`--pgdata=${dir}`, `--username=${superuser}`, `--pwfile=${pwFile}`, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C'],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`initdb failed (exit ${r.status}): ${r.stderr || r.error?.message || ''}`);
    }
  } finally {
    unlinkSync(pwFile);
  }
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => (addr && typeof addr === 'object' ? resolve(addr.port) : reject(new Error('no port'))));
    });
  });
}

export function createServerFor(dir: string, port: number, user: string, password: string, persistent: boolean): EmbeddedPostgres {
  return new EmbeddedPostgres({
    databaseDir: dir,
    port,
    user,
    password,
    authMethod: 'scram-sha-256',
    persistent,
    postgresFlags: ['-c', 'listen_addresses=localhost', '-c', 'fsync=off'],
    onLog: () => {},
    onError: (e) => console.error('[postgres]', e),
  });
}

/** Start a disposable database with all migrations applied. */
export async function startTestDatabase(): Promise<{ url: string; stop: () => Promise<void> }> {
  const dir = mkdtempSync(path.join(tmpdir(), 'imgapp-testdb-'));
  rmSync(dir, { recursive: true, force: true }); // initdb wants to create it
  const port = await freePort();
  const user = 'postgres';
  const password = 'test';
  await initCluster(dir, user, password);
  const server = createServerFor(dir, port, user, password, false);
  await server.start();
  await server.createDatabase('test');
  const url = `postgresql://${user}:${password}@localhost:${port}/test?schema=public`;

  const dbPkgDir = fileURLToPath(new URL('..', import.meta.url));
  const prismaBin = path.join(path.dirname(createRequire(import.meta.url).resolve('prisma/package.json')), 'build', 'index.js');
  const r = spawnSync(process.execPath, [prismaBin, 'migrate', 'deploy'], {
    cwd: dbPkgDir,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    await server.stop();
    throw new Error(`Test migrations failed: ${r.stderr || r.stdout}`);
  }

  return {
    url,
    stop: async () => {
      await server.stop().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
