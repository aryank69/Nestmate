-- Rollback-only integration test for finalized participant milestones and integrations.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '5a000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'milestone-a@example.test', '', now(), '{}', '{"full_name":"Milestone A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5a000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'milestone-b@example.test', '', now(), '{}', '{"full_name":"Milestone B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5a000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'milestone-c@example.test', '', now(), '{}', '{"full_name":"Milestone C"}', now(), now());

SELECT set_config('nestmate.milestone_user_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '5a000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.milestone_user_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '5a000000-0000-4000-8000-0000000000b2'), true);

INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('milestone-pref-a', current_setting('nestmate.milestone_user_a'), now()),
  ('milestone-pref-b', current_setting('nestmate.milestone_user_b'), now())
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('milestone-test-city', 'Milestone Test City', 'milestone-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('milestone-test-locality', 'Milestone Test Locality', 'milestone-test-locality', 'milestone-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('milestone-test-community', 'Milestone Test Community', 'milestone-test-community', 'milestone-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES (
  'milestone-test-post', 'ROOM_AVAILABLE'::public."PostType",
  'Finalized room milestones', 'Temporary listing for milestone security checks.',
  current_setting('nestmate.milestone_user_b'), 'milestone-test-community',
  'AVAILABLE'::public."ListingAvailabilityStatus", now(), now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5a000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-0000000000a1', true);

INSERT INTO public."InterestActivity" ("userId", "targetType", "postId", "stage")
VALUES (
  current_setting('nestmate.milestone_user_a'), 'LISTING'::public."InterestTargetType",
  'milestone-test-post', 'FINALIZED'::public."InterestStage"
);
SELECT set_config(
  'nestmate.milestone_space',
  (SELECT "id"::TEXT FROM public."FinalizedDocumentSpace" LIMIT 1),
  true
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public."FinalizedMatchMilestone") <> 16
    OR (SELECT count(DISTINCT "kind") FROM public."FinalizedMatchMilestone") <> 8
    OR (SELECT count(DISTINCT "userId") FROM public."FinalizedMatchMilestone") <> 2 THEN
    RAISE EXCEPTION 'A finalized space did not seed eight milestones per participant.';
  END IF;
END;
$$;

UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.milestone_space')::UUID
  AND "userId" = current_setting('nestmate.milestone_user_a')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."FinalizedMatchMilestone"
    WHERE "userId" = current_setting('nestmate.milestone_user_a')
      AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind"
      AND "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
      AND "completedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A participant could not complete their own milestone with a server timestamp.';
  END IF;
END;
$$;

UPDATE public."FinalizedMatchMilestone"
SET "status" = 'PENDING'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.milestone_space')::UUID
  AND "userId" = current_setting('nestmate.milestone_user_a')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."FinalizedMatchMilestone"
    WHERE "userId" = current_setting('nestmate.milestone_user_a')
      AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind"
      AND "status" = 'PENDING'::public."FinalizedMilestoneStatus"
      AND "completedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'Resetting a milestone did not clear its completion timestamp.';
  END IF;
END;
$$;

DO $$
DECLARE
  affected_rows BIGINT;
  protected_timestamp BOOLEAN := FALSE;
BEGIN
  UPDATE public."FinalizedMatchMilestone"
  SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
  WHERE "userId" = current_setting('nestmate.milestone_user_b')
    AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 0 THEN
    RAISE EXCEPTION 'A participant changed the counterpart milestone.';
  END IF;
  BEGIN
    UPDATE public."FinalizedMatchMilestone"
    SET "completedAt" = now()
    WHERE "userId" = current_setting('nestmate.milestone_user_a');
  EXCEPTION WHEN insufficient_privilege THEN protected_timestamp := TRUE;
  END;
  IF NOT protected_timestamp THEN
    RAISE EXCEPTION 'A participant directly controlled protected milestone timestamps.';
  END IF;
END;
$$;

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'match-documents',
  '5a000000-0000-4000-8000-0000000000a1/' || current_setting('nestmate.milestone_space') || '/5a000000-0000-4000-8000-0000000000d4.pdf',
  '5a000000-0000-4000-8000-0000000000a1',
  '{"mimetype":"application/pdf","size":2048}'::jsonb
);
INSERT INTO public."SharedDocument" (
  "id", "spaceId", "category", "objectPath", "originalName"
) VALUES (
  '5a000000-0000-4000-8000-0000000000d4',
  current_setting('nestmate.milestone_space')::UUID,
  'AGREEMENT_DRAFT'::public."SharedDocumentCategory",
  '5a000000-0000-4000-8000-0000000000a1/' || current_setting('nestmate.milestone_space') || '/5a000000-0000-4000-8000-0000000000d4.pdf',
  'Agreement draft.pdf'
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."FinalizedMatchMilestone"
    WHERE "userId" = current_setting('nestmate.milestone_user_a')
      AND "kind" = 'AGREEMENT_DRAFTED'::public."FinalizedMilestoneKind"
      AND "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
  ) THEN
    RAISE EXCEPTION 'An agreement upload did not advance the uploader milestone.';
  END IF;
END;
$$;

UPDATE public."MoveInChecklistItem"
SET "isCompleted" = TRUE
WHERE "kind" = 'INVENTORY_PHOTOS'::public."MoveInChecklistItemKind";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."FinalizedMatchMilestone"
    WHERE "userId" = current_setting('nestmate.milestone_user_a')
      AND "kind" = 'INVENTORY_COMPLETED'::public."FinalizedMilestoneKind"
      AND "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
  ) THEN
    RAISE EXCEPTION 'A completed private checklist task did not advance its milestone.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5a000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-0000000000b2', true);
INSERT INTO public."SharedDocumentAcknowledgement" ("documentId", "userId", "status")
VALUES (
  '5a000000-0000-4000-8000-0000000000d4',
  current_setting('nestmate.milestone_user_b'),
  'ACKNOWLEDGED'::public."DocumentAcknowledgementStatus"
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."FinalizedMatchMilestone"
    WHERE "userId" = current_setting('nestmate.milestone_user_b')
      AND "kind" = 'AGREEMENT_REVIEWED'::public."FinalizedMilestoneKind"
      AND "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
  ) OR NOT EXISTS (
    SELECT 1 FROM public."FinalizedMatchMilestone"
    WHERE "userId" = current_setting('nestmate.milestone_user_b')
      AND "kind" = 'AGREEMENT_ACKNOWLEDGED'::public."FinalizedMilestoneKind"
      AND "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
  ) THEN
    RAISE EXCEPTION 'Agreement acknowledgement did not advance participant milestones.';
  END IF;
END;
$$;

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'match-documents',
  '5a000000-0000-4000-8000-0000000000b2/' || current_setting('nestmate.milestone_space') || '/5a000000-0000-4000-8000-0000000000e5.png',
  '5a000000-0000-4000-8000-0000000000b2',
  '{"mimetype":"image/png","size":1024}'::jsonb
);
INSERT INTO public."SharedDocument" (
  "id", "spaceId", "category", "objectPath", "originalName"
) VALUES (
  '5a000000-0000-4000-8000-0000000000e5',
  current_setting('nestmate.milestone_space')::UUID,
  'MOVE_IN_DOCUMENT'::public."SharedDocumentCategory",
  '5a000000-0000-4000-8000-0000000000b2/' || current_setting('nestmate.milestone_space') || '/5a000000-0000-4000-8000-0000000000e5.png',
  'Move-in document.png'
);
DO $$
BEGIN
  IF (
    SELECT count(*) FROM public."FinalizedMatchMilestone"
    WHERE "kind" = 'DOCUMENTS_EXCHANGED'::public."FinalizedMilestoneKind"
      AND "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
  ) <> 2 THEN
    RAISE EXCEPTION 'Two-way private document sharing did not advance both participants.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5a000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE
  affected_rows BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM public."FinalizedMatchMilestone") THEN
    RAISE EXCEPTION 'An unrelated user could read finalized milestone progress.';
  END IF;
  UPDATE public."FinalizedMatchMilestone"
  SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
  WHERE "spaceId" = current_setting('nestmate.milestone_space')::UUID;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 0 THEN
    RAISE EXCEPTION 'An unrelated user changed finalized milestone progress.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5a000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (
  current_setting('nestmate.milestone_user_a'),
  current_setting('nestmate.milestone_user_b')
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."FinalizedMatchMilestone") THEN
    RAISE EXCEPTION 'Blocking did not hide shared milestone progress.';
  END IF;
END;
$$;

ROLLBACK;
