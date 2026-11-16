import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';

/**
 * Create a Prisma client connected through the node-postgres driver.
 * Each process (API server, worker, seed script) creates exactly one.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
  }
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
