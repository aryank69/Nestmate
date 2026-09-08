-- Rollback-only integration test for household budgets, alerts, and RLS.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '61000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'budget-a@example.test', '', now(), '{}', '{"full_name":"Budget A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '61000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'budget-b@example.test', '', now(), '{}', '{"full_name":"Budget B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '61000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'budget-c@example.test', '', now(), '{}', '{"full_name":"Budget C"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '61000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'budget-d@example.test', '', now(), '{}', '{"full_name":"Budget D"}', now(), now());

SELECT set_config('nestmate.budget_user_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '61000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.budget_user_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '61000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.budget_user_c', (SELECT "id" FROM public."User" WHERE "authUserId" = '61000000-0000-4000-8000-0000000000c3'), true);

INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('budget-pref-a', current_setting('nestmate.budget_user_a'), now()),
  ('budget-pref-b', current_setting('nestmate.budget_user_b'), now()),
  ('budget-pref-c', current_setting('nestmate.budget_user_c'), now())
ON CONFLICT ("userId") DO NOTHING;
INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('budget-test-city', 'Budget Test City', 'budget-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('budget-test-locality', 'Budget Test Locality', 'budget-test-locality', 'budget-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('budget-test-community', 'Budget Test Community', 'budget-test-community', 'budget-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES (
  'budget-test-post', 'ROOM_AVAILABLE'::public."PostType",
  'Budget test household', 'Temporary listing for monthly budget checks.',
  current_setting('nestmate.budget_user_b'), 'budget-test-community',
  'RESERVED'::public."ListingAvailabilityStatus", now(), now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."InterestActivity" ("userId", "targetType", "postId", "stage")
VALUES (
  current_setting('nestmate.budget_user_a'), 'LISTING'::public."InterestTargetType",
  'budget-test-post', 'FINALIZED'::public."InterestStage"
);
SELECT set_config('nestmate.budget_space', (
  SELECT "id"::TEXT FROM public."FinalizedDocumentSpace" WHERE "postId" = 'budget-test-post'
), true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.budget_space')::UUID
  AND "userId" = current_setting('nestmate.budget_user_a')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";
SELECT set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-0000000000b2', true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.budget_space')::UUID
  AND "userId" = current_setting('nestmate.budget_user_b')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";
SELECT set_config('nestmate.budget_household', (
  SELECT "id"::TEXT FROM public."Household"
  WHERE "finalizedSpaceId" = current_setting('nestmate.budget_space')::UUID
), true);

RESET ROLE;
INSERT INTO public."HouseholdMember" ("householdId", "userId", "status", "updatedAt")
VALUES (
  current_setting('nestmate.budget_household')::UUID,
  current_setting('nestmate.budget_user_c'),
  'ACTIVE'::public."HouseholdMemberStatus", now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-0000000000a1', true);
SELECT public.set_household_monthly_budget(
  current_setting('nestmate.budget_household')::UUID, '2026-09-01',
  'OVERALL'::public."HouseholdBudgetCategory", 15000
);
SELECT public.set_household_monthly_budget(
  current_setting('nestmate.budget_household')::UUID, '2026-09-01',
  'UTILITIES'::public."HouseholdBudgetCategory", 12500
);

SELECT public.create_household_expense(
  current_setting('nestmate.budget_household')::UUID,
  current_setting('nestmate.budget_user_a'),
  'ELECTRICITY'::public."HouseholdExpenseCategory",
  'September electricity', NULL, 10000, '2026-09-05'::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.budget_user_a'), current_setting('nestmate.budget_user_b')], NULL
);
SELECT public.create_household_expense(
  current_setting('nestmate.budget_household')::UUID,
  current_setting('nestmate.budget_user_a'),
  'INTERNET'::public."HouseholdExpenseCategory",
  'September internet', NULL, 2500, '2026-09-06'::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.budget_user_a'), current_setting('nestmate.budget_user_b')], NULL
);
SELECT public.create_household_expense(
  current_setting('nestmate.budget_household')::UUID,
  current_setting('nestmate.budget_user_a'),
  'GROCERIES'::public."HouseholdExpenseCategory",
  'September groceries', NULL, 2500, '2026-09-07'::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.budget_user_a'), current_setting('nestmate.budget_user_b')], NULL
);

RESET ROLE;
SELECT nestmate_private.generate_household_budget_alerts(
  current_setting('nestmate.budget_household')::UUID, '2026-09-01'
);
SELECT nestmate_private.generate_household_budget_alerts(
  current_setting('nestmate.budget_household')::UUID, '2026-09-01'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-0000000000b2', true);
SELECT public.set_household_monthly_budget(
  current_setting('nestmate.budget_household')::UUID, '2026-10-01',
  'GROCERIES'::public."HouseholdBudgetCategory", 5000
);
SELECT public.set_household_monthly_budget(
  current_setting('nestmate.budget_household')::UUID, '2026-10-01',
  'GROCERIES'::public."HouseholdBudgetCategory", NULL
);
SELECT public.set_household_monthly_budget(
  current_setting('nestmate.budget_household')::UUID, '2026-10-01',
  'UTILITIES'::public."HouseholdBudgetCategory", 12500
);
SELECT public.create_household_expense(
  current_setting('nestmate.budget_household')::UUID,
  current_setting('nestmate.budget_user_b'),
  'ELECTRICITY'::public."HouseholdExpenseCategory",
  'October electricity', NULL, 10000, '2026-10-05'::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.budget_user_a'), current_setting('nestmate.budget_user_b')], NULL
);

DO $$
DECLARE
  summary JSONB := public.get_household_monthly_spending_summary(
    current_setting('nestmate.budget_household')::UUID, '2026-09-01'
  );
BEGIN
  IF jsonb_array_length(summary->'budgets') <> 2
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(summary->'budgets') AS budget
      WHERE budget->>'category' = 'OVERALL'
        AND (budget->>'spendMinor')::BIGINT = 15000
        AND (budget->>'usagePercent')::INTEGER = 100
    )
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(summary->'budgets') AS budget
      WHERE budget->>'category' = 'UTILITIES'
        AND (budget->>'spendMinor')::BIGINT = 12500
        AND (budget->>'usagePercent')::INTEGER = 100
    )
    OR summary::TEXT ILIKE '%Budget A%'
    OR summary::TEXT ILIKE '%Budget B%' THEN
    RAISE EXCEPTION 'Monthly summary budget calculations or privacy failed: %', summary;
  END IF;
END;
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM public."Notification" WHERE "type" = 'HOUSEHOLD_BUDGET') <> 5
    OR NOT EXISTS (SELECT 1 FROM public."Notification" WHERE "resourceId" LIKE '%:2026-09:UTILITIES:80')
    OR NOT EXISTS (SELECT 1 FROM public."Notification" WHERE "resourceId" LIKE '%:2026-09:UTILITIES:100')
    OR NOT EXISTS (SELECT 1 FROM public."Notification" WHERE "resourceId" LIKE '%:2026-09:OVERALL:80')
    OR NOT EXISTS (SELECT 1 FROM public."Notification" WHERE "resourceId" LIKE '%:2026-09:OVERALL:100')
    OR NOT EXISTS (SELECT 1 FROM public."Notification" WHERE "resourceId" LIKE '%:2026-10:UTILITIES:80')
    OR EXISTS (SELECT 1 FROM public."Notification" WHERE "resourceId" LIKE '%:2026-10:UTILITIES:100')
    OR EXISTS (
      SELECT 1 FROM public."Notification"
      WHERE "type" = 'HOUSEHOLD_BUDGET'
        AND ("body" LIKE '%₹%' OR "body" LIKE '%12500%' OR "body" LIKE '%15000%'
          OR "body" ILIKE '%Budget A%' OR "body" ILIKE '%Budget B%')
    ) THEN
    RAISE EXCEPTION 'Threshold timing, month reset, deduplication, or alert privacy failed.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."HouseholdMonthlyBudget"
    WHERE "month" = '2026-10-01' AND "category" = 'GROCERIES'
  ) THEN
    RAISE EXCEPTION 'Blank budget did not remove the selected limit.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-0000000000c3', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public."HouseholdMonthlyBudget") <> 3
    OR (SELECT count(*) FROM public."Notification" WHERE "type" = 'HOUSEHOLD_BUDGET') <> 5 THEN
    RAISE EXCEPTION 'An active member lost shared budget or their own alert access.';
  END IF;
END; $$;

SELECT set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-0000000000d4', true);
DO $$
DECLARE denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."HouseholdMonthlyBudget")
    OR EXISTS (SELECT 1 FROM public."Notification" WHERE "type" = 'HOUSEHOLD_BUDGET') THEN
    RAISE EXCEPTION 'Outsider read private household budgets or alerts.';
  END IF;
  BEGIN
    PERFORM public.set_household_monthly_budget(
      current_setting('nestmate.budget_household')::UUID, '2026-09-01',
      'RENT'::public."HouseholdBudgetCategory", 10000
    );
  EXCEPTION WHEN insufficient_privilege THEN denied := TRUE;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Outsider changed a household budget.'; END IF;
END;
$$;

ROLLBACK;
