-- Rollback-only integration test for expense trends and household isolation.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '62000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'trend-a@example.test', '', now(), '{}', '{"full_name":"Trend A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '62000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'trend-b@example.test', '', now(), '{}', '{"full_name":"Trend B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '62000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'trend-outsider@example.test', '', now(), '{}', '{"full_name":"Trend Outsider"}', now(), now());

SELECT set_config('nestmate.trend_user_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '62000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.trend_user_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '62000000-0000-4000-8000-0000000000b2'), true);

INSERT INTO public."FinalizedDocumentSpace" (
  "id", "targetType", "targetUserId", "participantOneId", "participantTwoId", "updatedAt"
) VALUES (
  '62000000-0000-4000-8000-000000000001',
  'FLATMATE'::public."InterestTargetType",
  current_setting('nestmate.trend_user_b'),
  LEAST(current_setting('nestmate.trend_user_a'), current_setting('nestmate.trend_user_b')),
  GREATEST(current_setting('nestmate.trend_user_a'), current_setting('nestmate.trend_user_b')),
  now()
);
INSERT INTO public."Household" ("id", "finalizedSpaceId", "updatedAt")
VALUES ('62000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000001', now());
INSERT INTO public."HouseholdMember" ("householdId", "userId", "updatedAt") VALUES
  ('62000000-0000-4000-8000-000000000002', current_setting('nestmate.trend_user_a'), now()),
  ('62000000-0000-4000-8000-000000000002', current_setting('nestmate.trend_user_b'), now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"62000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '62000000-0000-4000-8000-0000000000a1', true);

SELECT public.create_household_expense(
  '62000000-0000-4000-8000-000000000002', current_setting('nestmate.trend_user_a'),
  'RENT'::public."HouseholdExpenseCategory", 'Starting rent', NULL, 10000,
  (date_trunc('month', CURRENT_DATE) - INTERVAL '5 months')::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.trend_user_a'), current_setting('nestmate.trend_user_b')], NULL
);
SELECT public.create_household_expense(
  '62000000-0000-4000-8000-000000000002', current_setting('nestmate.trend_user_a'),
  'GROCERIES'::public."HouseholdExpenseCategory", 'Groceries', NULL, 15000,
  (date_trunc('month', CURRENT_DATE) - INTERVAL '4 months')::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.trend_user_a'), current_setting('nestmate.trend_user_b')], NULL
);
SELECT public.create_household_expense(
  '62000000-0000-4000-8000-000000000002', current_setting('nestmate.trend_user_b'),
  'ELECTRICITY'::public."HouseholdExpenseCategory", 'Electricity', NULL, 20000,
  (date_trunc('month', CURRENT_DATE) - INTERVAL '2 months')::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.trend_user_a'), current_setting('nestmate.trend_user_b')], NULL
);
SELECT public.create_household_expense(
  '62000000-0000-4000-8000-000000000002', current_setting('nestmate.trend_user_b'),
  'INTERNET'::public."HouseholdExpenseCategory", 'Internet', NULL, 18000,
  (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.trend_user_a'), current_setting('nestmate.trend_user_b')], NULL
);
SELECT public.create_household_expense(
  '62000000-0000-4000-8000-000000000002', current_setting('nestmate.trend_user_a'),
  'OTHER'::public."HouseholdExpenseCategory", 'One-time supplies', NULL, 5000,
  date_trunc('month', CURRENT_DATE)::DATE,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.trend_user_a'), current_setting('nestmate.trend_user_b')], NULL
);
SELECT public.create_recurring_household_expense(
  '62000000-0000-4000-8000-000000000002', current_setting('nestmate.trend_user_a'),
  'RENT'::public."HouseholdExpenseCategory", 'Recurring rent', NULL, 12000,
  CURRENT_DATE, NULL, 'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.trend_user_a'), current_setting('nestmate.trend_user_b')], NULL
);
SELECT public.set_household_monthly_budget(
  '62000000-0000-4000-8000-000000000002',
  (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::DATE,
  'OVERALL'::public."HouseholdBudgetCategory", 20000
);
SELECT public.set_household_monthly_budget(
  '62000000-0000-4000-8000-000000000002', date_trunc('month', CURRENT_DATE)::DATE,
  'OVERALL'::public."HouseholdBudgetCategory", 20000
);

DO $$
DECLARE
  trend JSONB := public.get_household_expense_trends(
    '62000000-0000-4000-8000-000000000002', date_trunc('month', CURRENT_DATE)::DATE, 6
  );
BEGIN
  IF jsonb_array_length(trend->'months') <> 6
    OR (trend->'months'->0->>'totalMinor')::BIGINT <> 10000
    OR trend->'months'->0->>'direction' <> 'START'
    OR (trend->'months'->1->>'changePercent')::INTEGER <> 50
    OR (trend->'months'->2->>'totalMinor')::BIGINT <> 0
    OR trend->'months'->2->>'direction' <> 'DOWN'
    OR (trend->'months'->2->>'changePercent')::INTEGER <> -100
    OR trend->'months'->3->>'direction' <> 'NEW'
    OR (trend->'months'->5->>'totalMinor')::BIGINT <> 17000
    OR (trend->'months'->5->>'recurringMinor')::BIGINT <> 12000
    OR (trend->'months'->5->>'oneTimeMinor')::BIGINT <> 5000
    OR (trend->'months'->5->>'budgetMinor')::BIGINT <> 20000
    OR (trend->'months'->5->>'budgetUsagePercent')::INTEGER <> 85
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(trend->'categoryChanges') AS category
      WHERE category->>'category' = 'UTILITIES'
        AND (category->>'previousMinor')::BIGINT = 18000
        AND (category->>'currentMinor')::BIGINT = 0
        AND category->>'direction' = 'DOWN'
    )
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(trend->'categoryChanges') AS category
      WHERE category->>'category' = 'RENT'
        AND (category->>'currentMinor')::BIGINT = 12000
        AND category->>'direction' = 'NEW'
    )
    OR trend::TEXT ILIKE '%Trend A%'
    OR trend::TEXT ILIKE '%Trend B%'
    OR trend::TEXT ILIKE '%example.test%' THEN
    RAISE EXCEPTION 'Trend math or aggregate privacy failed: %', trend;
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"62000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '62000000-0000-4000-8000-0000000000b2', true);
DO $$
DECLARE trend JSONB := public.get_household_expense_trends(
  '62000000-0000-4000-8000-000000000002', date_trunc('month', CURRENT_DATE)::DATE, 12
);
BEGIN
  IF jsonb_array_length(trend->'months') <> 12
    OR (trend->>'monthCount')::INTEGER <> 12
    OR (trend->'months'->11->>'totalMinor')::BIGINT <> 17000 THEN
    RAISE EXCEPTION 'Second household member did not receive the same safe aggregate: %', trend;
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"62000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '62000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.get_household_expense_trends(
      '62000000-0000-4000-8000-000000000002', date_trunc('month', CURRENT_DATE)::DATE, 6
    );
  EXCEPTION WHEN insufficient_privilege THEN denied := TRUE;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'An outsider read private household trends.'; END IF;
END;
$$;

ROLLBACK;
