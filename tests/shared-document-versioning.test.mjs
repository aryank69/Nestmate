import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTypeScriptModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const output = ts.transpileModule(source, {
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

const helpers = loadTypeScriptModule(
  path.join(process.cwd(), "lib/shared-documents.ts"),
);
const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260906150000_shared_document_versions_acknowledgements/migration.sql",
  ),
  "utf8",
);
const actions = fs.readFileSync(
  path.join(process.cwd(), "app/documents/actions.ts"),
  "utf8",
);
const component = fs.readFileSync(
  path.join(process.cwd(), "components/documents/document-sharing.tsx"),
  "utf8",
);

function version(overrides) {
  return {
    id: crypto.randomUUID(),
    spaceId: "58000000-0000-4000-8000-0000000000d4",
    uploaderId: "user-a",
    seriesId: "58000000-0000-4000-8000-0000000000e5",
    versionNumber: 1,
    isCurrent: true,
    replacesDocumentId: null,
    category: "AGREEMENT_DRAFT",
    objectPath: "path",
    originalName: "Agreement.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    revokedAt: null,
    supersededAt: null,
    createdAt: "2026-09-06T09:00:00.000Z",
    acknowledgements: [],
    ...overrides,
  };
}

test("version groups keep the current version first without mutating input", () => {
  const first = version({ isCurrent: false, supersededAt: "2026-09-06T10:00:00.000Z" });
  const second = version({
    id: "58000000-0000-4000-8000-0000000000f6",
    versionNumber: 2,
    replacesDocumentId: first.id,
    createdAt: "2026-09-06T10:00:00.000Z",
  });
  const other = version({
    id: "58000000-0000-4000-8000-0000000000a7",
    seriesId: "58000000-0000-4000-8000-0000000000a7",
    createdAt: "2026-09-05T10:00:00.000Z",
  });
  const input = [first, other, second];

  const groups = helpers.groupSharedDocumentVersions(input);
  assert.deepEqual(groups.map((group) => group.map(({ id }) => id)), [
    [second.id, first.id],
    [other.id],
  ]);
  assert.deepEqual(input.map(({ id }) => id), [first.id, other.id, second.id]);
});

test("review and acknowledgement are the only personal tracking states", () => {
  assert.equal(helpers.isDocumentAcknowledgementStatus("REVIEWED"), true);
  assert.equal(helpers.isDocumentAcknowledgementStatus("ACKNOWLEDGED"), true);
  assert.equal(helpers.isDocumentAcknowledgementStatus("SIGNED"), false);
  assert.equal(helpers.documentAcknowledgementLabel("ACKNOWLEDGED"), "Acknowledged");
});

test("migration enforces one current immutable version and preserves lineage", () => {
  assert.match(migration, /"seriesId" UUID/);
  assert.match(migration, /"versionNumber" INTEGER NOT NULL DEFAULT 1/);
  assert.match(migration, /SharedDocument_one_current_version_key[\s\S]*WHERE "isCurrent" = TRUE/);
  assert.match(migration, /FOR UPDATE[\s\S]*Only the uploader can revise the current version/);
  assert.match(migration, /NEW\."versionNumber" := previous_document\."versionNumber" \+ 1/);
  assert.match(migration, /NEW\."category" := previous_document\."category"/);
  assert.match(migration, /"supersededAt" = CURRENT_TIMESTAMP/);
  assert.doesNotMatch(migration, /ON storage\.objects\s+FOR UPDATE/);
});

test("acknowledgements are current-version-only, participant-scoped, and author-owned", () => {
  assert.match(migration, /SharedDocumentAcknowledgement[\s\S]*ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /can_access_shared_document\(NEW\."documentId", TRUE\)/);
  assert.match(migration, /Participants can read document acknowledgements[\s\S]*can_access_shared_document\("documentId", FALSE\)/);
  assert.match(migration, /Participants can update their own current acknowledgement[\s\S]*current_nestmate_user_id/);
  assert.doesNotMatch(migration, /SharedDocumentAcknowledgement[\s\S]*TO anon/);
});

test("server actions register immutable revisions and upsert only the caller's status", () => {
  assert.match(actions, /replacesDocumentId/);
  assert.match(actions, /from\("SharedDocumentAcknowledgement"\)[\s\S]*\.upsert/);
  assert.match(actions, /userId: context\.userId/);
  assert.match(actions, /status === "ACKNOWLEDGED"[\s\S]*not a signature or legal acceptance/);
  assert.match(actions, /\.eq\("seriesId", document\.seriesId\)/);
});

test("UI exposes version history and avoids legal-signature language or public URLs", () => {
  assert.match(component, /Upload revision/);
  assert.match(component, /Version history/);
  assert.match(component, /Current-version acknowledgement/);
  assert.match(component, /not a signature, legal acceptance/);
  assert.doesNotMatch(component, /getPublicUrl|createSignedUrl|createSignedUrls/);
});
