import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { resolveDatabaseUrl } from "@/lib/database-url";

const connectionString = resolveDatabaseUrl(
  process.env.DATABASE_URL,
  process.env.DATABASE_PASSWORD,
  "DATABASE_URL",
);

const configuredPoolMax = Number.parseInt(
  process.env.DATABASE_POOL_MAX ?? "1",
  10,
);
const poolMax =
  Number.isInteger(configuredPoolMax) &&
  configuredPoolMax >= 1 &&
  configuredPoolMax <= 10
    ? configuredPoolMax
    : 1;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Prisma 7 uses node-postgres through this adapter, so its pool size must
    // be configured here rather than through Prisma's legacy URL parameters.
    adapter: new PrismaPg({
      connectionString,
      max: poolMax,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
