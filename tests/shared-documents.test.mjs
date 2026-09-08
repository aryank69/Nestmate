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
    "prisma/migrations/20260906140000_secure_shared_documents/migration.sql",
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

test("document categories are explicit and limited to move-in needs", () => {
  assert.deepEqual(
    helpers.SHARED_DOCUMENT_CATEGORIES.map(({ value }) => value),
    [
      "ID_PROOF",
      "AGREEMENT_DRAFT",
      "DEPOSIT_RECEIPT",
      "INVENTORY_SHEET",
      "MOVE_IN_DOCUMENT",
    ],
  );
  assert.equal(helpers.isSharedDocumentCategory("ID_PROOF"), true);
  assert.equal(helpers.isSharedDocumentCategory("BANK_STATEMENT"), false);
});

test("document validation permits only non-empty PDF/JPG/PNG files up to 10 MB", () => {
  assert.equal(
    helpers.validateSharedDocumentFile({
      name: "agreement.pdf",
      type: "application/pdf",
      size: 2048,
    }),
    null,
  );
  assert.match(
    helpers.validateSharedDocumentFile({
      name: "agreement.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 2048,
    }),
    /PDF, JPG, or PNG/,
  );
  assert.match(
    helpers.validateSharedDocumentFile({
      name: "empty.pdf",
      type: "application/pdf",
      size: 0,
    }),
    /empty/,
  );
  assert.match(
    helpers.validateSharedDocumentFile({
      name: "large.pdf",
      type: "application/pdf",
      size: helpers.MAX_SHARED_DOCUMENT_BYTES + 1,
    }),
    /10 MB/,
  );
});

test("object paths are UUID-only and bound to uploader, space, and document", () => {
  const authUserId = "58000000-0000-4000-8000-0000000000a1";
  const spaceId = "58000000-0000-4000-8000-0000000000d4";
  const documentId = "58000000-0000-4000-8000-0000000000e5";
  const objectPath = helpers.sharedDocumentPath(
    authUserId,
    spaceId,
    documentId,
    { type: "application/pdf" },
  );
  assert.equal(
    objectPath,
    `${authUserId}/${spaceId}/${documentId}.pdf`,
  );
  assert.equal(
    helpers.isOwnedSharedDocumentPath(
      objectPath,
      authUserId,
      spaceId,
      documentId,
    ),
    true,
  );
  assert.equal(
    helpers.isOwnedSharedDocumentPath(
      objectPath,
      "58000000-0000-4000-8000-0000000000b2",
      spaceId,
      documentId,
    ),
    false,
  );
});

test("migration creates a private constrained bucket and participant-only policies", () => {
  assert.match(
    migration,
    /'match-documents'[\s\S]*FALSE[\s\S]*10485760[\s\S]*application\/pdf[\s\S]*image\/jpeg[\s\S]*image\/png/,
  );
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /can_access_finalized_document_space/);
  assert.match(migration, /FOR INSERT\s+TO authenticated[\s\S]*owner_id = \(SELECT auth\.uid\(\)\)::TEXT/);
  assert.match(migration, /FOR SELECT\s+TO authenticated[\s\S]*"revokedAt" IS NULL/);
  assert.match(migration, /FOR DELETE\s+TO authenticated/);
  assert.doesNotMatch(migration, /match-documents[\s\S]*TO anon/);
  assert.doesNotMatch(migration, /ON storage\.objects\s+FOR UPDATE/);
});

test("actions reauthenticate, authorize the space, and clean up storage through its API", () => {
  assert.match(actions, /auth\.getClaims\(\)/);
  assert.match(actions, /from\("FinalizedDocumentSpace"\)[\s\S]*\.eq\("id", spaceId\)/);
  assert.match(actions, /isOwnedSharedDocumentPath/);
  assert.match(actions, /\.from\(SHARED_DOCUMENT_BUCKET\)[\s\S]*\.remove/);
  assert.doesNotMatch(actions, /service_role|SUPABASE_SERVICE/);
});

test("UI uses authenticated downloads and never creates public or signed URLs", () => {
  assert.match(component, /\.from\(SHARED_DOCUMENT_BUCKET\)[\s\S]*\.download\(document\.objectPath\)/);
  assert.match(component, /Revoke/);
  assert.match(component, /Permanently delete/);
  assert.match(component, /Redact unrelated ID numbers and financial details/);
  assert.doesNotMatch(component, /getPublicUrl|createSignedUrl|createSignedUrls/);
});
