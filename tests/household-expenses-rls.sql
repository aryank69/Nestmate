-- Rollback-only integration test for household expense splits and settlements.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '5d000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'expense-a@example.test', '', now(), '{}', '{"full_name":"Expense A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5d000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'expense-b@example.test', '', now(), '{}', '{"full_name":"Expense B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5d000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'expense-c@example.test', '', now(), '{}', '{"full_name":"Expense C"}', now(), now());

SELECT set_config('nestmate.expense_user_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '5d000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.expense_user_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '5d000000-0000-4000-8000-0000000000b2'), true);
INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('expense-pref-a', current_setting('nestmate.expense_user_a'), now()),
  ('expense-pref-b', current_setting('nestmate.expense_user_b'), now())
ON CONFLICT ("userId") DO NOTHING;
INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('expense-test-city', 'Expense Test City', 'expense-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('expense-test-locality', 'Expense Test Locality', 'expense-test-locality', 'expense-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('expense-test-community', 'Expense Test Community', 'expense-test-community', 'expense-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES (
  'expense-test-post', 'ROOM_AVAILABLE'::public."PostType",
  'Expense split household', 'Temporary listing for expense security checks.',
  current_setting('nestmate.expense_user_b'), 'expense-test-community',
  'RESERVED'::public."ListingAvailabilityStatus", now(), now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5d000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5d000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."InterestActivity" ("userId", "targetType", "postId", "stage")
VALUES (
  current_setting('nestmate.expense_user_a'), 'LISTING'::public."InterestTargetType",
  'expense-test-post', 'FINALIZED'::public."InterestStage"
);
SELECT set_config('nestmate.expense_space', (SELECT "id"::TEXT FROM public."FinalizedDocumentSpace" LIMIT 1), true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.expense_space')::UUID
  AND "userId" = current_setting('nestmate.expense_user_a')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";

SELECT set_config('request.jwt.claims', '{"sub":"5d000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5d000000-0000-4000-8000-0000000000b2', true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.expense_space')::UUID
  AND "userId" = current_setting('nestmate.expense_user_b')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";
SELECT set_config('nestmate.expense_household', (SELECT "id"::TEXT FROM public."Household" LIMIT 1), true);

SELECT set_config('request.jwt.claims', '{"sub":"5d000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5d000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('nestmate.equal_expense', public.create_household_expense(
  current_setting('nestmate.expense_household')::UUID,
  current_setting('nestmate.expense_user_a'),
  'ELECTRICITY'::public."HouseholdExpenseCategory",
  'Electricity bill', NULL, 10001, '2026-09-07',
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.expense_user_a'), current_setting('nestmate.expense_user_b')],
  NULL
)::TEXT, true);

DO $$
BEGIN
  IF (SELECT SUM("shareAmountMinor") FROM public."HouseholdExpenseShare"
      WHERE "expenseId" = current_setting('nestmate.equal_expense')::UUID) <> 10001
    OR NOT EXISTS (
      SELECT 1 FROM public."HouseholdExpenseShare"
      WHERE "expenseId" = current_setting('nestmate.equal_expense')::UUID
        AND "memberId" = current_setting('nestmate.expense_user_a')
        AND "shareAmountMinor" = 5001
        AND "status" = 'NO_PAYMENT_DUE'::public."HouseholdExpenseShareStatus"
    )
    OR NOT EXISTS (
      SELECT 1 FROM public."HouseholdExpenseShare"
      WHERE "expenseId" = current_setting('nestmate.equal_expense')::UUID
        AND "memberId" = current_setting('nestmate.expense_user_b')
        AND "shareAmountMinor" = 5000
        AND "status" = 'OUTSTANDING'::public."HouseholdExpenseShareStatus"
    ) THEN
    RAISE EXCEPTION 'Equal split did not preserve the total or assign deterministic shares.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5d000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5d000000-0000-4000-8000-0000000000b2', true);
SELECT set_config('nestmate.expense_share_b', (
  SELECT "id"::TEXT FROM public."HouseholdExpenseShare"
  WHERE "expenseId" = current_setting('nestmate.equal_expense')::UUID
    AND "memberId" = current_setting('nestmate.expense_user_b')
), true);
SELECT set_config('nestmate.settlement', public.record_household_settlement(
  current_setting('nestmate.expense_share_b')::UUID, 5000, 'Paid outside NestMate'
)::TEXT, true);

DO $$
DECLARE own_confirmation_denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.set_household_settlement_status(
      current_setting('nestmate.settlement')::UUID,
      'CONFIRMED'::public."HouseholdSettlementStatus"
    );
  EXCEPTION WHEN insufficient_privilege THEN own_confirmation_denied := TRUE;
  END;
  IF NOT own_confirmation_denied THEN
    RAISE EXCEPTION 'A member confirmed the settlement they recorded.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5d000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5d000000-0000-4000-8000-0000000000a1', true);
SELECT public.set_household_settlement_status(
  current_setting('nestmate.settlement')::UUID,
  'CONFIRMED'::public."HouseholdSettlementStatus"
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."HouseholdExpense"
    WHERE "id" = current_setting('nestmate.equal_expense')::UUID
      AND "status" = 'SETTLED'::public."HouseholdExpenseStatus"
  ) OR NOT EXISTS (
    SELECT 1 FROM public."HouseholdExpenseShare"
    WHERE "id" = current_setting('nestmate.expense_share_b')::UUID
      AND "settledAmountMinor" = 5000
      AND "status" = 'SETTLED'::public."HouseholdExpenseShareStatus"
  ) THEN
    RAISE EXCEPTION 'Confirmed settlement did not update balances and expense status.';
  END IF;
END;
$$;

SELECT set_config('nestmate.custom_expense', public.create_household_expense(
  current_setting('nestmate.expense_household')::UUID,
  current_setting('nestmate.expense_user_b'),
  'GROCERIES'::public."HouseholdExpenseCategory",
  'Monthly groceries', 'Custom split', 15000, '2026-09-07',
  'CUSTOM'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.expense_user_a'), current_setting('nestmate.expense_user_b')],
  ARRAY[10000, 5000]
)::TEXT, true);
SELECT set_config('nestmate.custom_share_a', (
  SELECT "id"::TEXT FROM public."HouseholdExpenseShare"
  WHERE "expenseId" = current_setting('nestmate.custom_expense')::UUID
    AND "memberId" = current_setting('nestmate.expense_user_a')
), true);
SELECT set_config('nestmate.partial_settlement', public.record_household_settlement(
  current_setting('nestmate.custom_share_a')::UUID, 4000, NULL
)::TEXT, true);

SELECT set_config('request.jwt.claims', '{"sub":"5d000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5d000000-0000-4000-8000-0000000000b2', true);
SELECT public.set_household_settlement_status(
  current_setting('nestmate.partial_settlement')::UUID,
  'CONFIRMED'::public."HouseholdSettlementStatus"
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."HouseholdExpense"
    WHERE "id" = current_setting('nestmate.custom_expense')::UUID
      AND "status" = 'PARTIALLY_SETTLED'::public."HouseholdExpenseStatus"
  ) OR NOT EXISTS (
    SELECT 1 FROM public."HouseholdExpenseShare"
    WHERE "id" = current_setting('nestmate.custom_share_a')::UUID
      AND "shareAmountMinor" - "settledAmountMinor" = 6000
      AND "status" = 'PARTIALLY_SETTLED'::public."HouseholdExpenseShareStatus"
  ) THEN
    RAISE EXCEPTION 'Partial settlement math or status is incorrect.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5d000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5d000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE outsider_denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."HouseholdExpense")
    OR EXISTS (SELECT 1 FROM public."HouseholdExpenseShare")
    OR EXISTS (SELECT 1 FROM public."HouseholdSettlement") THEN
    RAISE EXCEPTION 'An outsider could read private expense or settlement data.';
  END IF;
  BEGIN
    PERFORM public.create_household_expense(
      current_setting('nestmate.expense_household')::UUID,
      current_setting('nestmate.expense_user_a'),
      'OTHER'::public."HouseholdExpenseCategory", 'Outsider expense', NULL,
      1000, '2026-09-07', 'EQUAL'::public."HouseholdExpenseSplitMethod",
      ARRAY[current_setting('nestmate.expense_user_a')], NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN outsider_denied := TRUE;
  END;
  IF NOT outsider_denied THEN RAISE EXCEPTION 'An outsider created a household expense.'; END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5d000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5d000000-0000-4000-8000-0000000000a1', true);
UPDATE public."Household"
SET "status" = 'ARCHIVED'::public."HouseholdStatus"
WHERE "id" = current_setting('nestmate.expense_household')::UUID;
DO $$
DECLARE archived_write_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."HouseholdExpense") <> 2
    OR (SELECT count(*) FROM public."HouseholdSettlement") <> 2 THEN
    RAISE EXCEPTION 'Archived household lost its private expense history.';
  END IF;
  BEGIN
    PERFORM public.record_household_settlement(
      current_setting('nestmate.custom_share_a')::UUID, 1000, NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN archived_write_denied := TRUE;
  END;
  IF NOT archived_write_denied THEN RAISE EXCEPTION 'Archived expense history remained writable.'; END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"5d000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5d000000-0000-4000-8000-0000000000b2', true);
UPDATE public."HouseholdMember"
SET "status" = 'LEFT'::public."HouseholdMemberStatus"
WHERE "householdId" = current_setting('nestmate.expense_household')::UUID
  AND "userId" = current_setting('nestmate.expense_user_b');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."HouseholdExpense")
    OR EXISTS (SELECT 1 FROM public."HouseholdExpenseShare")
    OR EXISTS (SELECT 1 FROM public."HouseholdSettlement") THEN
    RAISE EXCEPTION 'A departed member retained access to financial history.';
  END IF;
END;
$$;

ROLLBACK;
