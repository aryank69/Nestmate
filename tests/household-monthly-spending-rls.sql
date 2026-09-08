-- Rollback-only integration test for monthly household spending and member privacy.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'monthly-a@example.test', '', now(), '{}', '{"full_name":"Monthly A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'monthly-b@example.test', '', now(), '{}', '{"full_name":"Monthly B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'monthly-c@example.test', '', now(), '{}', '{"full_name":"Monthly C"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'monthly-d@example.test', '', now(), '{}', '{"full_name":"Monthly D"}', now(), now());

SELECT set_config('nestmate.monthly_user_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '60000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.monthly_user_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '60000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.monthly_user_c', (SELECT "id" FROM public."User" WHERE "authUserId" = '60000000-0000-4000-8000-0000000000c3'), true);

INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('monthly-pref-a', current_setting('nestmate.monthly_user_a'), now()),
  ('monthly-pref-b', current_setting('nestmate.monthly_user_b'), now()),
  ('monthly-pref-c', current_setting('nestmate.monthly_user_c'), now())
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('monthly-test-city', 'Monthly Test City', 'monthly-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('monthly-test-locality', 'Monthly Test Locality', 'monthly-test-locality', 'monthly-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('monthly-test-community', 'Monthly Test Community', 'monthly-test-community', 'monthly-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES (
  'monthly-test-post', 'ROOM_AVAILABLE'::public."PostType",
  'Monthly summary household', 'Temporary listing for monthly summary checks.',
  current_setting('nestmate.monthly_user_b'), 'monthly-test-community',
  'RESERVED'::public."ListingAvailabilityStatus", now(), now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."InterestActivity" ("userId", "targetType", "postId", "stage")
VALUES (
  current_setting('nestmate.monthly_user_a'), 'LISTING'::public."InterestTargetType",
  'monthly-test-post', 'FINALIZED'::public."InterestStage"
);
SELECT set_config('nestmate.monthly_space', (
  SELECT "id"::TEXT FROM public."FinalizedDocumentSpace" WHERE "postId" = 'monthly-test-post'
), true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.monthly_space')::UUID
  AND "userId" = current_setting('nestmate.monthly_user_a')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";

SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-0000000000b2', true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.monthly_space')::UUID
  AND "userId" = current_setting('nestmate.monthly_user_b')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";
SELECT set_config('nestmate.monthly_household', (
  SELECT "id"::TEXT FROM public."Household"
  WHERE "finalizedSpaceId" = current_setting('nestmate.monthly_space')::UUID
), true);

RESET ROLE;
INSERT INTO public."HouseholdMember" ("householdId", "userId", "status", "updatedAt")
VALUES (
  current_setting('nestmate.monthly_household')::UUID,
  current_setting('nestmate.monthly_user_c'),
  'ACTIVE'::public."HouseholdMemberStatus",
  now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('nestmate.monthly_expense_one', public.create_household_expense(
  current_setting('nestmate.monthly_household')::UUID,
  current_setting('nestmate.monthly_user_a'),
  'ELECTRICITY'::public."HouseholdExpenseCategory",
  'September electricity', NULL, 10000, '2026-09-05'::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.monthly_user_a'), current_setting('nestmate.monthly_user_b')],
  NULL
)::TEXT, true);
SELECT set_config('nestmate.monthly_expense_two', public.create_household_expense(
  current_setting('nestmate.monthly_household')::UUID,
  current_setting('nestmate.monthly_user_b'),
  'RENT'::public."HouseholdExpenseCategory",
  'September rent', NULL, 30000, '2026-09-01'::DATE,
  'CUSTOM'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.monthly_user_a'), current_setting('nestmate.monthly_user_b')],
  ARRAY[12000, 18000]
)::TEXT, true);
SELECT public.create_household_expense(
  current_setting('nestmate.monthly_household')::UUID,
  current_setting('nestmate.monthly_user_a'),
  'INTERNET'::public."HouseholdExpenseCategory",
  'August internet', NULL, 8000, '2026-08-10'::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.monthly_user_a'), current_setting('nestmate.monthly_user_b')],
  NULL
);

SELECT set_config('nestmate.monthly_share_b', (
  SELECT "id"::TEXT FROM public."HouseholdExpenseShare"
  WHERE "expenseId" = current_setting('nestmate.monthly_expense_one')::UUID
    AND "memberId" = current_setting('nestmate.monthly_user_b')
), true);
SELECT set_config('nestmate.monthly_share_a', (
  SELECT "id"::TEXT FROM public."HouseholdExpenseShare"
  WHERE "expenseId" = current_setting('nestmate.monthly_expense_two')::UUID
    AND "memberId" = current_setting('nestmate.monthly_user_a')
), true);

SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-0000000000b2', true);
SELECT set_config('nestmate.monthly_settlement_b', public.record_household_settlement(
  current_setting('nestmate.monthly_share_b')::UUID, 2000, 'B private note'
)::TEXT, true);
SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-0000000000a1', true);
SELECT public.set_household_settlement_status(
  current_setting('nestmate.monthly_settlement_b')::UUID,
  'CONFIRMED'::public."HouseholdSettlementStatus"
);
SELECT set_config('nestmate.monthly_settlement_a', public.record_household_settlement(
  current_setting('nestmate.monthly_share_a')::UUID, 4000, 'A private note'
)::TEXT, true);
SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-0000000000b2', true);
SELECT public.set_household_settlement_status(
  current_setting('nestmate.monthly_settlement_a')::UUID,
  'CONFIRMED'::public."HouseholdSettlementStatus"
);

SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-0000000000a1', true);
DO $$
DECLARE summary JSONB := public.get_household_monthly_spending_summary(
  current_setting('nestmate.monthly_household')::UUID, '2026-09-01'
);
BEGIN
  IF (summary->>'totalExpenseMinor')::BIGINT <> 40000
    OR (summary->>'paidMinor')::BIGINT <> 29000
    OR (summary->>'outstandingMinor')::BIGINT <> 11000
    OR (summary->>'expenseCount')::INTEGER <> 2
    OR (summary->'viewer'->>'shareMinor')::BIGINT <> 17000
    OR (summary->'viewer'->>'paidMinor')::BIGINT <> 9000
    OR (summary->'viewer'->>'outstandingMinor')::BIGINT <> 8000
    OR (summary->'viewer'->>'paidForHouseholdMinor')::BIGINT <> 10000
    OR summary->'categories'->0->>'category' <> 'RENT'
    OR (summary->'categories'->0->>'amountMinor')::BIGINT <> 30000
    OR summary->'largestExpenses'->0->>'title' <> 'September rent'
    OR summary::TEXT ILIKE '%private note%'
    OR summary::TEXT ILIKE '%Monthly B%' THEN
    RAISE EXCEPTION 'Viewer A received incorrect or private monthly summary data: %', summary;
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-0000000000b2', true);
DO $$
DECLARE summary JSONB := public.get_household_monthly_spending_summary(
  current_setting('nestmate.monthly_household')::UUID, '2026-09-01'
);
BEGIN
  IF (summary->>'totalExpenseMinor')::BIGINT <> 40000
    OR (summary->'viewer'->>'shareMinor')::BIGINT <> 23000
    OR (summary->'viewer'->>'paidMinor')::BIGINT <> 20000
    OR (summary->'viewer'->>'outstandingMinor')::BIGINT <> 3000
    OR (summary->'viewer'->>'paidForHouseholdMinor')::BIGINT <> 30000 THEN
    RAISE EXCEPTION 'Viewer B did not receive their own monthly aggregate: %', summary;
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE summary JSONB := public.get_household_monthly_spending_summary(
  current_setting('nestmate.monthly_household')::UUID, '2026-09-01'
);
BEGIN
  IF (summary->>'totalExpenseMinor')::BIGINT <> 40000
    OR (summary->'viewer'->>'shareMinor')::BIGINT <> 0
    OR (summary->'viewer'->>'paidMinor')::BIGINT <> 0
    OR (summary->'viewer'->>'outstandingMinor')::BIGINT <> 0
    OR (summary->'viewer'->>'paidForHouseholdMinor')::BIGINT <> 0 THEN
    RAISE EXCEPTION 'Uninvolved member saw another member aggregate: %', summary;
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-0000000000d4', true);
DO $$
DECLARE denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.get_household_monthly_spending_summary(
      current_setting('nestmate.monthly_household')::UUID, '2026-09-01'
    );
  EXCEPTION WHEN insufficient_privilege THEN denied := TRUE;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Outsider read a private household summary.'; END IF;
END;
$$;

ROLLBACK;
