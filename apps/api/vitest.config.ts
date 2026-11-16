import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // A real, disposable PostgreSQL is started once for the whole run.
    globalSetup: ['./tests/global-setup.ts'],
    // Test files share that database and job queue, so run them one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
