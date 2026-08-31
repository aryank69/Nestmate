import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { resolveDatabaseUrl } from "@/lib/database-url";

const connectionString = resolveDatabaseUrl(
  process.env.DATABASE_URL,
  process.env.DATABASE_PASSWORD,
  "DATABASE_URL",
);

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
