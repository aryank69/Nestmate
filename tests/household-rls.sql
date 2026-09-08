-- Rollback-only integration test for private post-move-in household coordination.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '5c000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'household-a@example.test', '', now(), '{}', '{"full_name":"Household A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5c000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'household-b@example.test', '', now(), '{}', '{"full_name":"Household B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5c000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'household-c@example.test', '', now(), '{}', '{"full_name":"Household C"}', now(), now());

SELECT set_config('nestmate.household_user_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '5c000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.household_user_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '5c000000-0000-4000-8000-0000000000b2'), true);
INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('household-pref-a', current_setting('nestmate.household_user_a'), now()),
  ('household-pref-b', current_setting('nestmate.household_user_b'), now())
ON CONFLICT ("userId") DO NOTHING;
INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('household-test-city', 'Household Test City', 'household-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('household-test-locality', 'Household Test Locality', 'household-test-locality', 'household-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('household-test-community', 'Household Test Community', 'household-test-community', 'household-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES (
  'household-test-post', 'ROOM_AVAILABLE'::public."PostType",
  'Completed move-in household', 'Temporary listing for household security checks.',
  current_setting('nestmate.household_user_b'), 'household-test-community',
  'RESERVED'::public."ListingAvailabilityStatus", now(), now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5c000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."InterestActivity" ("userId", "targetType", "postId", "stage")
VALUES (
  current_setting('nestmate.household_user_a'), 'LISTING'::public."InterestTargetType",
  'household-test-post', 'FINALIZED'::public."InterestStage"
);
SELECT set_config('nestmate.household_space', (SELECT "id"::TEXT FROM public."FinalizedDocumentSpace" LIMIT 1), true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.household_space')::UUID
  AND "userId" = current_setting('nestmate.household_user_a')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";

SELECT set_config('request.jwt.claims', '{"sub":"5c000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-0000000000b2', true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.household_space')::UUID
  AND "userId" = current_setting('nestmate.household_user_b')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";
SELECT set_config('nestmate.household_id', (SELECT "id"::TEXT FROM public."Household" LIMIT 1), true);

DO $$
BEGIN
  IF (SELECT count(*) FROM public."Household") <> 1
    OR (SELECT count(*) FROM public."HouseholdMember") <> 2 THEN
    RAISE EXCEPTION 'Completed move-in did not create one private two-member household.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5c000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."HouseholdItem" (
  "householdId", "kind", "title", "detail", "amountMinor", "dueDate", "recurrence", "assignedToId", "isCompleted"
) VALUES (
  current_setting('nestmate.household_id')::UUID,
  'RENT_DUE'::public."HouseholdItemKind", 'September rent due', 'Coordinate privately; no payment processing.',
  2500000, '2026-09-10', 'MONTHLY'::public."HouseholdRecurrence",
  current_setting('nestmate.household_user_a'), FALSE
);
SELECT set_config('nestmate.household_item_a', (SELECT "id"::TEXT FROM public."HouseholdItem" LIMIT 1), true);

SELECT set_config('request.jwt.claims', '{"sub":"5c000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-0000000000b2', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public."HouseholdItem") <> 1
    OR NOT EXISTS (SELECT 1 FROM public."HouseholdItem" WHERE "amountMinor" = 2500000) THEN
    RAISE EXCEPTION 'The second active member could not read private household data.';
  END IF;
END;
$$;
UPDATE public."HouseholdItem"
SET "isCompleted" = TRUE
WHERE "id" = current_setting('nestmate.household_item_a')::UUID;
DO $$
DECLARE edit_denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public."HouseholdItem"
    SET "title" = 'Changed by roommate'
    WHERE "id" = current_setting('nestmate.household_item_a')::UUID;
  EXCEPTION WHEN insufficient_privilege THEN edit_denied := TRUE;
  END;
  IF NOT edit_denied THEN RAISE EXCEPTION 'A roommate edited another creator item details.'; END IF;
END;
$$;
INSERT INTO public."HouseholdItem" (
  "householdId", "kind", "title", "amountMinor", "recurrence", "isCompleted"
) VALUES (
  current_setting('nestmate.household_id')::UUID,
  'EXPENSE'::public."HouseholdItemKind", 'Shared cleaning supplies', 89900,
  'NONE'::public."HouseholdRecurrence", FALSE
);

SELECT set_config('request.jwt.claims', '{"sub":"5c000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE insert_denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."Household")
    OR EXISTS (SELECT 1 FROM public."HouseholdMember")
    OR EXISTS (SELECT 1 FROM public."HouseholdItem") THEN
    RAISE EXCEPTION 'An outsider could read private household or financial data.';
  END IF;
  BEGIN
    INSERT INTO public."HouseholdItem" ("householdId", "kind", "title", "recurrence", "isCompleted")
    VALUES (current_setting('nestmate.household_id')::UUID, 'NOTE', 'Outsider note', 'NONE', FALSE);
  EXCEPTION WHEN insufficient_privilege THEN insert_denied := TRUE;
  END;
  IF NOT insert_denied THEN RAISE EXCEPTION 'An outsider wrote into a private household.'; END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5c000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-0000000000a1', true);
UPDATE public."Household"
SET "status" = 'ARCHIVED'::public."HouseholdStatus"
WHERE "id" = current_setting('nestmate.household_id')::UUID;
DO $$
DECLARE affected_rows BIGINT;
BEGIN
  UPDATE public."HouseholdItem" SET "isCompleted" = FALSE;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 0 THEN RAISE EXCEPTION 'Archived household items remained writable.'; END IF;
  IF (SELECT count(*) FROM public."HouseholdItem") <> 2 THEN
    RAISE EXCEPTION 'Archiving removed private household history.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5c000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-0000000000b2', true);
UPDATE public."HouseholdMember"
SET "status" = 'LEFT'::public."HouseholdMemberStatus"
WHERE "householdId" = current_setting('nestmate.household_id')::UUID
  AND "userId" = current_setting('nestmate.household_user_b');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."Household")
    OR EXISTS (SELECT 1 FROM public."HouseholdMember")
    OR EXISTS (SELECT 1 FROM public."HouseholdItem") THEN
    RAISE EXCEPTION 'A member retained household access after leaving.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5c000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-0000000000a1', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public."Household") <> 1
    OR (SELECT count(*) FROM public."HouseholdItem") <> 2 THEN
    RAISE EXCEPTION 'The remaining active member lost the archived household history.';
  END IF;
END;
$$;

ROLLBACK;
