-- Rollback-only integration test for finalized participant document metadata and Storage isolation.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '58000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'document-a@example.test', '', now(), '{}', '{"full_name":"Document A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '58000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'document-b@example.test', '', now(), '{}', '{"full_name":"Document B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '58000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'document-c@example.test', '', now(), '{}', '{"full_name":"Document C"}', now(), now());

SELECT set_config('nestmate.document_user_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '58000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.document_user_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '58000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.document_user_c', (SELECT "id" FROM public."User" WHERE "authUserId" = '58000000-0000-4000-8000-0000000000c3'), true);

INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('document-pref-a', current_setting('nestmate.document_user_a'), now()),
  ('document-pref-b', current_setting('nestmate.document_user_b'), now()),
  ('document-pref-c', current_setting('nestmate.document_user_c'), now())
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('document-test-city', 'Document Test City', 'document-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('document-test-locality', 'Document Test Locality', 'document-test-locality', 'document-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('document-test-community', 'Document Test Community', 'document-test-community', 'document-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES (
  'document-test-post',
  'ROOM_AVAILABLE'::public."PostType",
  'Finalized room with private documents',
  'Temporary listing used only for document security verification.',
  current_setting('nestmate.document_user_b'),
  'document-test-community',
  'AVAILABLE'::public."ListingAvailabilityStatus",
  now(),
  now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"58000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-0000000000a1', true);

INSERT INTO public."InterestActivity" ("userId", "targetType", "postId", "stage")
VALUES (
  current_setting('nestmate.document_user_a'),
  'LISTING'::public."InterestTargetType",
  'document-test-post',
  'FINALIZED'::public."InterestStage"
);
SELECT set_config(
  'nestmate.document_space',
  (SELECT "id"::TEXT FROM public."FinalizedDocumentSpace" LIMIT 1),
  true
);

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'match-documents',
  '58000000-0000-4000-8000-0000000000a1/' || current_setting('nestmate.document_space') || '/58000000-0000-4000-8000-0000000000e5.pdf',
  '58000000-0000-4000-8000-0000000000a1',
  '{"mimetype":"application/pdf","size":2048}'::jsonb
);
INSERT INTO public."SharedDocument" (
  "id", "spaceId", "category", "objectPath", "originalName"
) VALUES (
  '58000000-0000-4000-8000-0000000000e5',
  current_setting('nestmate.document_space')::UUID,
  'AGREEMENT_DRAFT'::public."SharedDocumentCategory",
  '58000000-0000-4000-8000-0000000000a1/' || current_setting('nestmate.document_space') || '/58000000-0000-4000-8000-0000000000e5.pdf',
  'Agreement draft.pdf'
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public."FinalizedDocumentSpace") <> 1
    OR (SELECT count(*) FROM public."SharedDocument") <> 1
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id = 'match-documents') <> 1 THEN
    RAISE EXCEPTION 'The first participant could not create and read a private document.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."SharedDocument"
    WHERE "uploaderId" = current_setting('nestmate.document_user_a')
      AND "mimeType" = 'application/pdf'
      AND "sizeBytes" = 2048
  ) THEN
    RAISE EXCEPTION 'Stored file metadata was not derived securely from Storage.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"58000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-0000000000b2', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public."FinalizedDocumentSpace") <> 1
    OR (SELECT count(*) FROM public."SharedDocument") <> 1
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id = 'match-documents') <> 1 THEN
    RAISE EXCEPTION 'The finalized counterpart could not read the shared document.';
  END IF;
  UPDATE public."SharedDocument"
  SET "revokedAt" = now()
  WHERE "id" = '58000000-0000-4000-8000-0000000000e5';
  IF FOUND THEN
    RAISE EXCEPTION 'The recipient could revoke another participant document.';
  END IF;
END;
$$;

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'match-documents',
  '58000000-0000-4000-8000-0000000000b2/' || current_setting('nestmate.document_space') || '/58000000-0000-4000-8000-0000000000f6.png',
  '58000000-0000-4000-8000-0000000000b2',
  '{"mimetype":"image/png","size":1024}'::jsonb
);
INSERT INTO public."SharedDocument" (
  "id", "spaceId", "category", "objectPath", "originalName"
) VALUES (
  '58000000-0000-4000-8000-0000000000f6',
  current_setting('nestmate.document_space')::UUID,
  'INVENTORY_SHEET'::public."SharedDocumentCategory",
  '58000000-0000-4000-8000-0000000000b2/' || current_setting('nestmate.document_space') || '/58000000-0000-4000-8000-0000000000f6.png',
  'Inventory.png'
);

SELECT set_config('request.jwt.claims', '{"sub":"58000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE outsider_upload_denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."FinalizedDocumentSpace")
    OR EXISTS (SELECT 1 FROM public."SharedDocument")
    OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'match-documents') THEN
    RAISE EXCEPTION 'An unrelated user could read private document data.';
  END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'match-documents',
      '58000000-0000-4000-8000-0000000000c3/' || current_setting('nestmate.document_space') || '/58000000-0000-4000-8000-0000000000d7.pdf',
      '58000000-0000-4000-8000-0000000000c3',
      '{"mimetype":"application/pdf","size":1}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN outsider_upload_denied := TRUE;
  END;
  IF NOT outsider_upload_denied THEN
    RAISE EXCEPTION 'An unrelated user uploaded into a finalized document space.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"58000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-0000000000a1', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public."SharedDocument") <> 2
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id = 'match-documents') <> 2 THEN
    RAISE EXCEPTION 'Participants could not exchange documents in both directions.';
  END IF;
END;
$$;
UPDATE public."SharedDocument"
SET "revokedAt" = now()
WHERE "id" = '58000000-0000-4000-8000-0000000000e5';

SELECT set_config('request.jwt.claims', '{"sub":"58000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-0000000000b2', true);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."SharedDocument"
    WHERE "id" = '58000000-0000-4000-8000-0000000000e5'
  ) OR EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'match-documents'
      AND name LIKE '58000000-0000-4000-8000-0000000000a1/%'
  ) THEN
    RAISE EXCEPTION 'A revoked document remained available to the recipient.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"58000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-0000000000a1', true);
DELETE FROM public."SharedDocument"
WHERE "id" = '58000000-0000-4000-8000-0000000000e5';

INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (
  current_setting('nestmate.document_user_a'),
  current_setting('nestmate.document_user_b')
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."FinalizedDocumentSpace")
    OR EXISTS (SELECT 1 FROM public."SharedDocument")
    OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'match-documents') THEN
    RAISE EXCEPTION 'Blocking did not hide the finalized participant sharing space.';
  END IF;
END;
$$;

ROLLBACK;
