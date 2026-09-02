import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(supabaseUrl && publishableKey, "Supabase public environment variables are required.");

const userA = {
  id: "40000000-0000-4000-8000-0000000000a1",
  email: "listing-image-a@example.test",
  password: "Storage-Test-A9!secure",
};
const userB = {
  id: "40000000-0000-4000-8000-0000000000b2",
  email: "listing-image-b@example.test",
  password: "Storage-Test-B9!secure",
};
const postId = "listing-image-api-test-post";
const objectPath = `${userA.id}/${postId}/10000000-0000-4000-8000-000000000001.png`;
const forbiddenPath = `${userA.id}/${postId}/20000000-0000-4000-8000-000000000002.png`;
const bucket = "listing-images";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function client() {
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const clientA = client();
const clientB = client();

async function signIn(supabase, credentials) {
  const { error } = await supabase.auth.signInWithPassword(credentials);
  assert.equal(error, null, `Could not sign in ${credentials.email}: ${error?.message}`);
}

await signIn(clientA, userA);
await signIn(clientB, userB);

try {
  const upload = await clientA.storage.from(bucket).upload(
    objectPath,
    png,
    { contentType: "image/png", upsert: false },
  );
  assert.equal(upload.error, null, `Owner upload failed: ${upload.error?.message}`);

  const attach = await clientA
    .from("Post")
    .update({ imagePaths: [objectPath], updatedAt: new Date().toISOString() })
    .eq("id", postId)
    .select("id")
    .single();
  assert.equal(attach.error, null, `Owner image attachment failed: ${attach.error?.message}`);

  const otherRead = await clientB.storage.from(bucket).download(objectPath);
  assert.equal(otherRead.error, null, `Valid cross-user read failed: ${otherRead.error?.message}`);
  assert.ok(otherRead.data.size > 0, "Downloaded listing image was empty.");

  const crossUpload = await clientB.storage.from(bucket).upload(
    forbiddenPath,
    png,
    { contentType: "image/png", upsert: false },
  );
  assert.ok(crossUpload.error, "Another user uploaded into the owner's post folder.");

  const crossReplace = await clientB.storage.from(bucket).upload(
    objectPath,
    png,
    { contentType: "image/png", upsert: true },
  );
  assert.ok(crossReplace.error, "Another user replaced the owner's listing image.");

  await clientB.storage.from(bucket).remove([objectPath]);
  const afterCrossDelete = await clientA.storage.from(bucket).download(objectPath);
  assert.equal(
    afterCrossDelete.error,
    null,
    "Another user removed the owner's listing image.",
  );

  console.log("Cross-user Storage access checks passed.");
} finally {
  await clientA.storage.from(bucket).remove([objectPath, forbiddenPath]);
  await clientA
    .from("Post")
    .update({ imagePaths: [], updatedAt: new Date().toISOString() })
    .eq("id", postId);
  await clientA.auth.signOut();
  await clientB.auth.signOut();
}
