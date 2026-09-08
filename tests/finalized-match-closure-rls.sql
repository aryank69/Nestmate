-- Rollback-only integration test for finalized match closure, reopening, and archives.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '5b000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'closure-a@example.test', '', now(), '{}', '{"full_name":"Closure A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5b000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'closure-b@example.test', '', now(), '{}', '{"full_name":"Closure B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5b000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'closure-c@example.test', '', now(), '{}', '{"full_name":"Closure C"}', now(), now());

SELECT set_config('nestmate.closure_user_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '5b000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.closure_user_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '5b000000-0000-4000-8000-0000000000b2'), true);

INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('closure-pref-a', current_setting('nestmate.closure_user_a'), now()),
  ('closure-pref-b', current_setting('nestmate.closure_user_b'), now())
ON CONFLICT ("userId") DO NOTHING;
INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('closure-test-city', 'Closure Test City', 'closure-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('closure-test-locality', 'Closure Test Locality', 'closure-test-locality', 'closure-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('closure-test-community', 'Closure Test Community', 'closure-test-community', 'closure-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES (
  'closure-test-post', 'ROOM_AVAILABLE'::public."PostType",
  'Finalized room closure', 'Temporary listing for closure security checks.',
  current_setting('nestmate.closure_user_b'), 'closure-test-community',
  'AVAILABLE'::public."ListingAvailabilityStatus", now(), now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5b000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."InterestActivity" ("userId", "targetType", "postId", "stage")
VALUES (
  current_setting('nestmate.closure_user_a'), 'LISTING'::public."InterestTargetType",
  'closure-test-post', 'FINALIZED'::public."InterestStage"
);
SELECT set_config('nestmate.closure_space', (SELECT "id"::TEXT FROM public."FinalizedDocumentSpace" LIMIT 1), true);

UPDATE public."FinalizedDocumentSpace"
SET "status" = 'CLOSED'::public."FinalizedMatchStatus",
    "closureReason" = 'CREATED_BY_MISTAKE'::public."MatchClosureReason"
WHERE "id" = current_setting('nestmate.closure_space')::UUID;
DO $$
DECLARE affected_rows BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."FinalizedDocumentSpace"
    WHERE "status" = 'CLOSED'::public."FinalizedMatchStatus"
      AND "statusBeforeClose" = 'ACTIVE'::public."FinalizedMatchStatus"
      AND "closedById" = current_setting('nestmate.closure_user_a')
      AND "closedAt" IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public."FinalizedMatchStatusChange"
    WHERE "toStatus" = 'CLOSED'::public."FinalizedMatchStatus"
  ) OR (SELECT count(*) FROM public."FinalizedMatchMilestone") <> 16 THEN
    RAISE EXCEPTION 'Participant could not read the complete closed archive.';
  END IF;

  UPDATE public."FinalizedMatchMilestone"
  SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
  WHERE "userId" = current_setting('nestmate.closure_user_a')
    AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 0 THEN RAISE EXCEPTION 'Closed milestone history was mutable.'; END IF;

  UPDATE public."MoveInChecklistItem" SET "isCompleted" = TRUE;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 0 THEN RAISE EXCEPTION 'Closed checklist history was mutable.'; END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5b000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-0000000000b2', true);
DO $$
DECLARE denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public."FinalizedDocumentSpace"
    SET "status" = 'ACTIVE'::public."FinalizedMatchStatus", "closureReason" = NULL
    WHERE "id" = current_setting('nestmate.closure_space')::UUID;
  EXCEPTION WHEN insufficient_privilege THEN denied := TRUE;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'The counterpart reopened a match they did not close.'; END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5b000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-0000000000a1', true);
UPDATE public."FinalizedDocumentSpace"
SET "status" = 'ACTIVE'::public."FinalizedMatchStatus", "closureReason" = NULL
WHERE "id" = current_setting('nestmate.closure_space')::UUID;
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "userId" = current_setting('nestmate.closure_user_a')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";

SELECT set_config('request.jwt.claims', '{"sub":"5b000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-0000000000b2', true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "userId" = current_setting('nestmate.closure_user_b')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."FinalizedDocumentSpace"
    WHERE "status" = 'COMPLETED'::public."FinalizedMatchStatus"
      AND "completedAt" IS NOT NULL
  ) THEN RAISE EXCEPTION 'Two participant completions did not complete the match.'; END IF;
END;
$$;

UPDATE public."FinalizedDocumentSpace"
SET "status" = 'CLOSED'::public."FinalizedMatchStatus",
    "closureReason" = 'MOVE_IN_COMPLETED'::public."MatchClosureReason"
WHERE "id" = current_setting('nestmate.closure_space')::UUID;
DO $$
DECLARE denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public."FinalizedDocumentSpace"
    SET "status" = 'COMPLETED'::public."FinalizedMatchStatus", "closureReason" = NULL
    WHERE "id" = current_setting('nestmate.closure_space')::UUID;
  EXCEPTION WHEN insufficient_privilege THEN denied := TRUE;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Completed move-in archive was reopenable.'; END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5b000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-0000000000c3', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."FinalizedDocumentSpace")
    OR EXISTS (SELECT 1 FROM public."FinalizedMatchStatusChange")
    OR EXISTS (SELECT 1 FROM public."FinalizedMatchMilestone") THEN
    RAISE EXCEPTION 'An unrelated user could read private match archive data.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5b000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (current_setting('nestmate.closure_user_a'), current_setting('nestmate.closure_user_b'));
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."FinalizedDocumentSpace")
    OR EXISTS (SELECT 1 FROM public."FinalizedMatchStatusChange")
    OR EXISTS (SELECT 1 FROM public."FinalizedMatchMilestone") THEN
    RAISE EXCEPTION 'Blocking did not hide private match archive data.';
  END IF;
END;
$$;

ROLLBACK;
