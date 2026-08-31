import "dotenv/config";

import { defineConfig, env } from "prisma/config";

import { resolveDatabaseUrl } from "./lib/database-url";

const directUrl = resolveDatabaseUrl(
  env("DIRECT_URL"),
  process.env.DATABASE_PASSWORD,
  "DIRECT_URL",
);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: directUrl,
  },
});
