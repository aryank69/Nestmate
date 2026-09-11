import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function compile(relativePath) {
  const output = ts.transpileModule(source(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", output)(
    compiledModule,
    compiledModule.exports,
    require,
  );
  return compiledModule.exports;
}

const auth = compile("../lib/auth.ts");
const databaseUrl = compile("../lib/database-url.ts");
const authActions = source("../app/auth/actions.ts");
const authCallback = source("../app/auth/callback/route.ts");
const prismaConfig = source("../prisma.config.ts");
const prismaClient = source("../lib/prisma.ts");
const profileData = source("../lib/profile-data.ts");
const serverClient = source("../lib/supabase/server.ts");
const browserClient = source("../lib/supabase/client.ts");
const envExample = source("../.env.example");
const gitignore = source("../.gitignore");
const listingStorage = source(
  "../prisma/migrations/20260902140000_secure_listing_images/migration.sql",
);
const documentStorage = source(
  "../prisma/migrations/20260906140000_secure_shared_documents/migration.sql",
);
const recurringCron = source(
  "../prisma/migrations/20260907120000_recurring_household_expenses/migration.sql",
);
const reminderCron = source(
  "../prisma/migrations/20260907130000_household_bill_reminders/migration.sql",
);
const localityRoomPage = source(
  "../app/community/[citySlug]/[localitySlug]/page.tsx",
);
const communityPostPage = source(
  "../app/community/post/[postId]/page.tsx",
);
const roomDiscovery = source("../components/rooms/room-discovery.tsx");
const publicListingPage = source("../app/listings/[postId]/page.tsx");

test("production origins are explicit, canonical, and HTTPS-only", () => {
  assert.equal(
    auth.resolveTrustedSiteOrigin({
      configuredSiteUrl: "https://roomzi.example",
      fallbackOrigin: "https://attacker.example",
      production: true,
    }),
    "https://roomzi.example",
  );
  assert.throws(
    () =>
      auth.resolveTrustedSiteOrigin({
        configuredSiteUrl: undefined,
        fallbackOrigin: "https://request-host.example",
        production: true,
      }),
    /required in production/,
  );
  assert.throws(
    () =>
      auth.resolveTrustedSiteOrigin({
        configuredSiteUrl: "http://roomzi.example",
        fallbackOrigin: "http://localhost:3002",
        production: true,
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      auth.resolveTrustedSiteOrigin({
        configuredSiteUrl: "https://roomzi.example/unexpected-path",
        fallbackOrigin: "http://localhost:3002",
        production: true,
      }),
    /only the app origin/,
  );
  assert.equal(
    auth.resolveTrustedSiteOrigin({
      configuredSiteUrl: undefined,
      fallbackOrigin: "http://localhost:3002",
      production: false,
    }),
    "http://localhost:3002",
  );
  assert.match(authActions, /resolveTrustedSiteOrigin/);
  assert.match(authCallback, /resolveTrustedSiteOrigin/);
  assert.doesNotMatch(authCallback, /forwardedHost|x-forwarded-host/);
});

test("database URLs require encrypted transport and preserve stronger TLS modes", () => {
  const resolved = databaseUrl.resolveDatabaseUrl(
    "postgresql://postgres.example:[YOUR-PASSWORD]@pooler.example.com:6543/postgres?sslmode=require",
    "p@ss word",
    "DATABASE_URL",
  );
  assert.match(resolved, /p%40ss%20word/);
  assert.match(resolved, /sslmode=require/);
  assert.match(resolved, /uselibpqcompat=true/);
  assert.match(
    databaseUrl.resolveDatabaseUrl(
      "postgresql://postgres.example:password@pooler.example.com:6543/postgres",
      undefined,
      "DATABASE_URL",
    ),
    /uselibpqcompat=true&sslmode=require/,
  );
  assert.match(
    databaseUrl.resolveDatabaseUrl(
      "postgresql://postgres.example:password@pooler.example.com:6543/postgres?sslmode=verify-full",
      undefined,
      "DATABASE_URL",
    ),
    /sslmode=verify-full/,
  );
  assert.throws(
    () =>
      databaseUrl.resolveDatabaseUrl(
        "postgresql://postgres.example:password@pooler.example.com:6543/postgres?sslmode=prefer",
        undefined,
        "DATABASE_URL",
      ),
    /must require TLS/,
  );
  assert.match(
    envExample,
    /DATABASE_URL=.*uselibpqcompat=true&sslmode=require/,
  );
  assert.match(envExample, /DIRECT_URL=.*uselibpqcompat=true&sslmode=require/);
  assert.match(envExample, /DIRECT_DATABASE_PASSWORD="REPLACE_ME"/);
  assert.match(
    prismaConfig,
    /DIRECT_DATABASE_PASSWORD \?\? process\.env\.DATABASE_PASSWORD/,
  );
  assert.match(prismaClient, /DATABASE_POOL_MAX \?\? "1"/);
  assert.match(prismaClient, /max: poolMax/);
  assert.match(prismaClient, /connectionTimeoutMillis: 10_000/);
  assert.match(prismaClient, /idleTimeoutMillis: 30_000/);
  assert.doesNotMatch(profileData, /\$transaction/);
  assert.match(profileData, /prisma\.user\.upsert/);
  assert.match(profileData, /prisma\.userPreferences\.upsert/);
});

test("browser and server clients use only the public Supabase configuration", () => {
  for (const clientSource of [serverClient, browserClient]) {
    assert.match(clientSource, /NEXT_PUBLIC_SUPABASE_URL/);
    assert.match(clientSource, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    assert.doesNotMatch(
      clientSource,
      /SERVICE_ROLE|SUPABASE_SECRET|DATABASE_PASSWORD|DIRECT_URL/,
    );
  }
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.doesNotMatch(envExample, /sb_secret_[A-Za-z0-9_-]{8,}/);
});

test("Storage buckets are private, constrained, and policy protected", () => {
  assert.match(
    listingStorage,
    /'listing-images'[\s\S]*FALSE[\s\S]*5242880[\s\S]*image\/webp/,
  );
  assert.match(listingStorage, /FOR INSERT\s+TO authenticated/);
  assert.match(listingStorage, /FOR DELETE\s+TO authenticated/);
  assert.match(listingStorage, /owner_id = \(SELECT auth\.uid\(\)\)::TEXT/);
  assert.match(
    documentStorage,
    /'match-documents'[\s\S]*FALSE[\s\S]*10485760[\s\S]*application\/pdf/,
  );
  assert.match(documentStorage, /can_access_finalized_document_space/);
  assert.match(documentStorage, /"revokedAt" IS NULL/);
  assert.doesNotMatch(documentStorage, /match-documents[\s\S]*TO anon/);
});

test("scheduled database jobs call private routines without embedded credentials", () => {
  assert.match(recurringCron, /nestmate-recurring-household-expenses/);
  assert.match(
    recurringCron,
    /nestmate_private\.generate_due_recurring_household_expenses/,
  );
  assert.match(reminderCron, /nestmate-household-bill-reminders/);
  assert.match(
    reminderCron,
    /nestmate_private\.generate_household_bill_notifications/,
  );
  assert.doesNotMatch(
    `${recurringCron}\n${reminderCron}`,
    /https?:\/\/|Bearer\s|sb_secret_|service_role/i,
  );
});

test("private community routes require auth while safe listing pages stay public", () => {
  for (const page of [localityRoomPage, communityPostPage]) {
    assert.match(page, /auth\.getClaims\(\)/);
    assert.match(page, /if \(error \|\| !authUserId\)/);
    assert.match(page, /redirect\(.*\/login/s);
  }
  assert.match(
    roomDiscovery,
    /isAuthenticated\s*\? `\/community\/post\/\$\{post\.id\}`\s*: `\/listings\/\$\{post\.id\}`/,
  );
  assert.match(publicListingPage, /loadPublicListing/);
  assert.doesNotMatch(publicListingPage, /redirect\(.*\/login/s);
});
