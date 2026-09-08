-- Rollback-only integration test for household bill reminders and privacy.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '5f000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'bill-a@example.test', '', now(), '{}', '{"full_name":"Bill A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5f000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'bill-b@example.test', '', now(), '{}', '{"full_name":"Bill B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5f000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'bill-c@example.test', '', now(), '{}', '{"full_name":"Bill C"}', now(), now());

SELECT set_config('nestmate.bill_user_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '5f000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.bill_user_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '5f000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.bill_user_c', (SELECT "id" FROM public."User" WHERE "authUserId" = '5f000000-0000-4000-8000-0000000000c3'), true);

INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('bill-pref-a', current_setting('nestmate.bill_user_a'), now()),
  ('bill-pref-b', current_setting('nestmate.bill_user_b'), now()),
  ('bill-pref-c', current_setting('nestmate.bill_user_c'), now())
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('bill-test-city', 'Bill Test City', 'bill-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('bill-test-locality', 'Bill Test Locality', 'bill-test-locality', 'bill-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('bill-test-community', 'Bill Test Community', 'bill-test-community', 'bill-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES (
  'bill-test-post', 'ROOM_AVAILABLE'::public."PostType",
  'Bill reminder household', 'Temporary listing for bill reminder checks.',
  current_setting('nestmate.bill_user_b'), 'bill-test-community',
  'RESERVED'::public."ListingAvailabilityStatus", now(), now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5f000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5f000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."InterestActivity" ("userId", "targetType", "postId", "stage")
VALUES (
  current_setting('nestmate.bill_user_a'), 'LISTING'::public."InterestTargetType",
  'bill-test-post', 'FINALIZED'::public."InterestStage"
);
SELECT set_config('nestmate.bill_space', (
  SELECT "id"::TEXT FROM public."FinalizedDocumentSpace"
  WHERE "postId" = 'bill-test-post'
), true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.bill_space')::UUID
  AND "userId" = current_setting('nestmate.bill_user_a')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";

SELECT set_config('request.jwt.claims', '{"sub":"5f000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5f000000-0000-4000-8000-0000000000b2', true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.bill_space')::UUID
  AND "userId" = current_setting('nestmate.bill_user_b')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";
SELECT set_config('nestmate.bill_household', (
  SELECT "id"::TEXT FROM public."Household"
  WHERE "finalizedSpaceId" = current_setting('nestmate.bill_space')::UUID
), true);

RESET ROLE;
INSERT INTO public."HouseholdMember" ("householdId", "userId", "status", "updatedAt")
VALUES (
  current_setting('nestmate.bill_household')::UUID,
  current_setting('nestmate.bill_user_c'),
  'ACTIVE'::public."HouseholdMemberStatus",
  now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5f000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5f000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('nestmate.bill_expense_one', public.create_household_expense(
  current_setting('nestmate.bill_household')::UUID,
  current_setting('nestmate.bill_user_a'),
  'ELECTRICITY'::public."HouseholdExpenseCategory",
  'September electricity', NULL, 10000, '2026-09-01'::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.bill_user_a'), current_setting('nestmate.bill_user_b')],
  NULL
)::TEXT, true);
SELECT set_config('nestmate.bill_expense_two', public.create_household_expense(
  current_setting('nestmate.bill_household')::UUID,
  current_setting('nestmate.bill_user_a'),
  'INTERNET'::public."HouseholdExpenseCategory",
  'September internet', NULL, 8000, '2026-09-01'::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.bill_user_a'), current_setting('nestmate.bill_user_b')],
  NULL
)::TEXT, true);

RESET ROLE;
UPDATE public."HouseholdExpense" SET "dueDate" = '2026-09-10'
WHERE "id" = current_setting('nestmate.bill_expense_one')::UUID;
UPDATE public."HouseholdExpense" SET "dueDate" = '2026-09-20'
WHERE "id" = current_setting('nestmate.bill_expense_two')::UUID;
SELECT set_config('nestmate.bill_share_one', (
  SELECT "id"::TEXT FROM public."HouseholdExpenseShare"
  WHERE "expenseId" = current_setting('nestmate.bill_expense_one')::UUID
    AND "memberId" = current_setting('nestmate.bill_user_b')
), true);
SELECT set_config('nestmate.bill_share_two', (
  SELECT "id"::TEXT FROM public."HouseholdExpenseShare"
  WHERE "expenseId" = current_setting('nestmate.bill_expense_two')::UUID
    AND "memberId" = current_setting('nestmate.bill_user_b')
), true);

SELECT nestmate_private.generate_household_bill_notifications('2026-09-07');
SELECT nestmate_private.generate_household_bill_notifications('2026-09-07');
SELECT nestmate_private.generate_household_bill_notifications('2026-09-10');
SELECT nestmate_private.generate_household_bill_notifications('2026-09-11');
SELECT nestmate_private.generate_household_bill_notifications('2026-09-17');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5f000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5f000000-0000-4000-8000-0000000000b2', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public."Notification" WHERE "type" = 'HOUSEHOLD_BILL') <> 4
    OR NOT EXISTS (SELECT 1 FROM public."Notification" WHERE "resourceId" = current_setting('nestmate.bill_share_one') || ':UPCOMING')
    OR NOT EXISTS (SELECT 1 FROM public."Notification" WHERE "resourceId" = current_setting('nestmate.bill_share_one') || ':DUE_TODAY')
    OR NOT EXISTS (SELECT 1 FROM public."Notification" WHERE "resourceId" = current_setting('nestmate.bill_share_one') || ':OVERDUE')
    OR EXISTS (
      SELECT 1 FROM public."Notification"
      WHERE "type" = 'HOUSEHOLD_BILL'
        AND ("body" ~ '₹|[0-9]{3,}' OR "body" ILIKE '%Bill A%' OR "body" ILIKE '%Bill B%')
    ) THEN
    RAISE EXCEPTION 'Reminder timing, deduplication, or private payload checks failed.';
  END IF;
END;
$$;

SELECT set_config('nestmate.bill_settlement', public.record_household_settlement(
  current_setting('nestmate.bill_share_two')::UUID, 4000, 'Private settlement note'
)::TEXT, true);

SELECT set_config('request.jwt.claims', '{"sub":"5f000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5f000000-0000-4000-8000-0000000000a1', true);
SELECT public.set_household_settlement_status(
  current_setting('nestmate.bill_settlement')::UUID,
  'CONFIRMED'::public."HouseholdSettlementStatus"
);

RESET ROLE;
SELECT nestmate_private.generate_household_bill_notifications('2026-09-20');
SELECT nestmate_private.generate_household_bill_notifications('2026-09-21');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5f000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5f000000-0000-4000-8000-0000000000b2', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public."Notification" WHERE "type" = 'HOUSEHOLD_BILL') <> 4
    OR (SELECT count(*) FROM public."HouseholdSettlement") <> 1 THEN
    RAISE EXCEPTION 'Settled shares received more reminders or a participant lost settlement access.';
  END IF;
END; $$;

SELECT set_config('request.jwt.claims', '{"sub":"5f000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5f000000-0000-4000-8000-0000000000a1', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public."Notification" WHERE "type" = 'HOUSEHOLD_BILL')
    OR (SELECT count(*) FROM public."HouseholdSettlement") <> 1 THEN
    RAISE EXCEPTION 'The creditor received debtor reminders or lost settlement access.';
  END IF;
END; $$;

SELECT set_config('request.jwt.claims', '{"sub":"5f000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5f000000-0000-4000-8000-0000000000c3', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public."Notification" WHERE "type" = 'HOUSEHOLD_BILL')
    OR EXISTS (SELECT 1 FROM public."HouseholdSettlement")
    OR (SELECT count(*) FROM public."HouseholdExpense") <> 2 THEN
    RAISE EXCEPTION 'An uninvolved household member saw private reminder or settlement details.';
  END IF;
END; $$;

ROLLBACK;
