-- Rollback-only integration test for private document versions and acknowledgements.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '59000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'version-a@example.test', '', now(), '{}', '{"full_name":"Version A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '59000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'version-b@example.test', '', now(), '{}', '{"full_name":"Version B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '59000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'version-c@example.test', '', now(), '{}', '{"full_name":"Version C"}', now(), now());

SELECT set_config('nestmate.version_user_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '59000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.version_user_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '59000000-0000-4000-8000-0000000000b2'), true);

INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('version-pref-a', current_setting('nestmate.version_user_a'), now()),
  ('version-pref-b', current_setting('nestmate.version_user_b'), now())
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('version-test-city', 'Version Test City', 'version-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('version-test-locality', 'Version Test Locality', 'version-test-locality', 'version-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('version-test-community', 'Version Test Community', 'version-test-community', 'version-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES (
  'version-test-post', 'ROOM_AVAILABLE'::public."PostType",
  'Versioned finalized room', 'Temporary listing for document version security.',
  current_setting('nestmate.version_user_b'), 'version-test-community',
  'AVAILABLE'::public."ListingAvailabilityStatus", now(), now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-0000000000a1', true);

INSERT INTO public."InterestActivity" ("userId", "targetType", "postId", "stage")
VALUES (
  current_setting('nestmate.version_user_a'), 'LISTING'::public."InterestTargetType",
  'version-test-post', 'FINALIZED'::public."InterestStage"
);
SELECT set_config(
  'nestmate.version_space',
  (SELECT "id"::TEXT FROM public."FinalizedDocumentSpace" LIMIT 1),
  true
);

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'match-documents',
  '59000000-0000-4000-8000-0000000000a1/' || current_setting('nestmate.version_space') || '/59000000-0000-4000-8000-0000000000d4.pdf',
  '59000000-0000-4000-8000-0000000000a1',
  '{"mimetype":"application/pdf","size":2048}'::jsonb
);
INSERT INTO public."SharedDocument" (
  "id", "spaceId", "category", "objectPath", "originalName"
) VALUES (
  '59000000-0000-4000-8000-0000000000d4',
  current_setting('nestmate.version_space')::UUID,
  'AGREEMENT_DRAFT'::public."SharedDocumentCategory",
  '59000000-0000-4000-8000-0000000000a1/' || current_setting('nestmate.version_space') || '/59000000-0000-4000-8000-0000000000d4.pdf',
  'Agreement v1.pdf'
);
INSERT INTO public."SharedDocumentAcknowledgement" ("documentId", "userId", "status")
VALUES (
  '59000000-0000-4000-8000-0000000000d4',
  current_setting('nestmate.version_user_a'),
  'REVIEWED'::public."DocumentAcknowledgementStatus"
);

SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-0000000000b2', true);
INSERT INTO public."SharedDocumentAcknowledgement" ("documentId", "userId", "status")
VALUES (
  '59000000-0000-4000-8000-0000000000d4',
  current_setting('nestmate.version_user_b'),
  'ACKNOWLEDGED'::public."DocumentAcknowledgementStatus"
);

SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-0000000000a1', true);
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'match-documents',
  '59000000-0000-4000-8000-0000000000a1/' || current_setting('nestmate.version_space') || '/59000000-0000-4000-8000-0000000000e5.pdf',
  '59000000-0000-4000-8000-0000000000a1',
  '{"mimetype":"application/pdf","size":3072}'::jsonb
);
INSERT INTO public."SharedDocument" (
  "id", "spaceId", "category", "objectPath", "originalName", "replacesDocumentId"
) VALUES (
  '59000000-0000-4000-8000-0000000000e5',
  current_setting('nestmate.version_space')::UUID,
  'ID_PROOF'::public."SharedDocumentCategory",
  '59000000-0000-4000-8000-0000000000a1/' || current_setting('nestmate.version_space') || '/59000000-0000-4000-8000-0000000000e5.pdf',
  'Agreement v2.pdf',
  '59000000-0000-4000-8000-0000000000d4'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."SharedDocument"
    WHERE "id" = '59000000-0000-4000-8000-0000000000d4'
      AND "versionNumber" = 1 AND "isCurrent" = FALSE AND "supersededAt" IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public."SharedDocument"
    WHERE "id" = '59000000-0000-4000-8000-0000000000e5'
      AND "seriesId" = '59000000-0000-4000-8000-0000000000d4'
      AND "versionNumber" = 2 AND "isCurrent" = TRUE
      AND "category" = 'AGREEMENT_DRAFT'::public."SharedDocumentCategory"
  ) THEN
    RAISE EXCEPTION 'Revision lineage or current-version handling is incorrect.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-0000000000b2', true);
DO $$
DECLARE old_ack_denied BOOLEAN := FALSE;
  affected_rows BIGINT := 0;
BEGIN
  BEGIN
    UPDATE public."SharedDocumentAcknowledgement"
    SET "status" = 'REVIEWED'::public."DocumentAcknowledgementStatus"
    WHERE "documentId" = '59000000-0000-4000-8000-0000000000d4'
      AND "userId" = current_setting('nestmate.version_user_b');
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    old_ack_denied := affected_rows = 0;
  EXCEPTION WHEN insufficient_privilege THEN old_ack_denied := TRUE;
  END;
  IF NOT old_ack_denied THEN
    RAISE EXCEPTION 'A participant changed an acknowledgement on an old version.';
  END IF;
  IF (SELECT count(*) FROM public."SharedDocument") <> 2
    OR (SELECT count(*) FROM public."SharedDocumentAcknowledgement") <> 2
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id = 'match-documents') <> 2 THEN
    RAISE EXCEPTION 'A finalized participant could not read private version history.';
  END IF;
END;
$$;

INSERT INTO public."SharedDocumentAcknowledgement" ("documentId", "userId", "status")
VALUES (
  '59000000-0000-4000-8000-0000000000e5',
  current_setting('nestmate.version_user_b'),
  'REVIEWED'::public."DocumentAcknowledgementStatus"
);

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'match-documents',
  '59000000-0000-4000-8000-0000000000b2/' || current_setting('nestmate.version_space') || '/59000000-0000-4000-8000-0000000000f6.pdf',
  '59000000-0000-4000-8000-0000000000b2',
  '{"mimetype":"application/pdf","size":4096}'::jsonb
);
DO $$
DECLARE foreign_revision_denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public."SharedDocument" (
      "id", "spaceId", "category", "objectPath", "originalName", "replacesDocumentId"
    ) VALUES (
      '59000000-0000-4000-8000-0000000000f6', current_setting('nestmate.version_space')::UUID,
      'AGREEMENT_DRAFT'::public."SharedDocumentCategory",
      '59000000-0000-4000-8000-0000000000b2/' || current_setting('nestmate.version_space') || '/59000000-0000-4000-8000-0000000000f6.pdf',
      'Unauthorized v3.pdf', '59000000-0000-4000-8000-0000000000e5'
    );
  EXCEPTION WHEN insufficient_privilege THEN foreign_revision_denied := TRUE;
  END;
  IF NOT foreign_revision_denied THEN
    RAISE EXCEPTION 'A participant revised a document uploaded by the counterpart.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE outsider_ack_denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."SharedDocument")
    OR EXISTS (SELECT 1 FROM public."SharedDocumentAcknowledgement")
    OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'match-documents') THEN
    RAISE EXCEPTION 'An unrelated user could read private version or acknowledgement data.';
  END IF;
  BEGIN
    INSERT INTO public."SharedDocumentAcknowledgement" ("documentId", "userId", "status")
    VALUES (
      '59000000-0000-4000-8000-0000000000e5',
      'not-the-current-user',
      'ACKNOWLEDGED'::public."DocumentAcknowledgementStatus"
    );
  EXCEPTION WHEN insufficient_privilege THEN outsider_ack_denied := TRUE;
  END;
  IF NOT outsider_ack_denied THEN
    RAISE EXCEPTION 'An unrelated user acknowledged a private document.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-0000000000a1', true);
UPDATE public."SharedDocument"
SET "revokedAt" = now()
WHERE "seriesId" = '59000000-0000-4000-8000-0000000000d4'
  AND "revokedAt" IS NULL;

SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-0000000000b2', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."SharedDocument")
    OR EXISTS (SELECT 1 FROM public."SharedDocumentAcknowledgement")
    OR EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'match-documents'
        AND name LIKE '59000000-0000-4000-8000-0000000000a1/%'
    ) THEN
    RAISE EXCEPTION 'Revoking a lineage did not remove every version from recipient access.';
  END IF;
END;
$$;

ROLLBACK;
