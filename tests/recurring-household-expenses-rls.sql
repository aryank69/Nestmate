-- Rollback-only integration test for recurring household bills and RLS.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '5e000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'recurring-a@example.test', '', now(), '{}', '{"full_name":"Recurring A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5e000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'recurring-b@example.test', '', now(), '{}', '{"full_name":"Recurring B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5e000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'recurring-c@example.test', '', now(), '{}', '{"full_name":"Recurring C"}', now(), now());

SELECT set_config('nestmate.recurring_user_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '5e000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.recurring_user_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '5e000000-0000-4000-8000-0000000000b2'), true);
INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('recurring-pref-a', current_setting('nestmate.recurring_user_a'), now()),
  ('recurring-pref-b', current_setting('nestmate.recurring_user_b'), now())
ON CONFLICT ("userId") DO NOTHING;
INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('recurring-test-city', 'Recurring Test City', 'recurring-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('recurring-test-locality', 'Recurring Test Locality', 'recurring-test-locality', 'recurring-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('recurring-test-community', 'Recurring Test Community', 'recurring-test-community', 'recurring-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES (
  'recurring-test-post', 'ROOM_AVAILABLE'::public."PostType",
  'Recurring bill household', 'Temporary listing for recurring bill checks.',
  current_setting('nestmate.recurring_user_b'), 'recurring-test-community',
  'RESERVED'::public."ListingAvailabilityStatus", now(), now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5e000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5e000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."InterestActivity" ("userId", "targetType", "postId", "stage")
VALUES (
  current_setting('nestmate.recurring_user_a'), 'LISTING'::public."InterestTargetType",
  'recurring-test-post', 'FINALIZED'::public."InterestStage"
);
SELECT set_config('nestmate.recurring_space', (SELECT "id"::TEXT FROM public."FinalizedDocumentSpace" LIMIT 1), true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.recurring_space')::UUID
  AND "userId" = current_setting('nestmate.recurring_user_a')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";

SELECT set_config('request.jwt.claims', '{"sub":"5e000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5e000000-0000-4000-8000-0000000000b2', true);
UPDATE public."FinalizedMatchMilestone"
SET "status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
WHERE "spaceId" = current_setting('nestmate.recurring_space')::UUID
  AND "userId" = current_setting('nestmate.recurring_user_b')
  AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind";
SELECT set_config('nestmate.recurring_household', (SELECT "id"::TEXT FROM public."Household" LIMIT 1), true);

SELECT set_config('request.jwt.claims', '{"sub":"5e000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5e000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('nestmate.recurring_template', public.create_recurring_household_expense(
  current_setting('nestmate.recurring_household')::UUID,
  current_setting('nestmate.recurring_user_a'),
  'RENT'::public."HouseholdExpenseCategory",
  'Monthly rent', NULL, 10001, CURRENT_DATE, NULL,
  'EQUAL'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.recurring_user_a'), current_setting('nestmate.recurring_user_b')],
  NULL
)::TEXT, true);

DO $$
BEGIN
  IF (SELECT count(*) FROM public."HouseholdRecurringExpenseTemplate") <> 1
    OR (SELECT count(*) FROM public."HouseholdRecurringExpenseParticipant") <> 2
    OR (SELECT count(*) FROM public."HouseholdExpense") <> 1
    OR NOT EXISTS (
      SELECT 1 FROM public."HouseholdExpense"
      WHERE "recurringTemplateId" = current_setting('nestmate.recurring_template')::UUID
        AND "billingCycleStart" = date_trunc('month', CURRENT_DATE)::DATE
        AND "dueDate" = CURRENT_DATE
        AND "amountMinor" = 10001
    )
    OR (SELECT SUM("shareAmountMinor") FROM public."HouseholdExpenseShare") <> 10001 THEN
    RAISE EXCEPTION 'Creating a recurring template did not create one valid current-cycle expense.';
  END IF;
END;
$$;

SELECT public.generate_my_household_recurring_expenses();
SELECT public.generate_my_household_recurring_expenses();
DO $$ BEGIN
  IF (SELECT count(*) FROM public."HouseholdExpense") <> 1 THEN
    RAISE EXCEPTION 'Repeated catch-up generated a duplicate billing cycle.';
  END IF;
END; $$;

SELECT set_config('nestmate.recurring_first_expense', (SELECT "id"::TEXT FROM public."HouseholdExpense" LIMIT 1), true);
SELECT set_config('nestmate.recurring_first_share_b', (
  SELECT "id"::TEXT FROM public."HouseholdExpenseShare"
  WHERE "expenseId" = current_setting('nestmate.recurring_first_expense')::UUID
    AND "memberId" = current_setting('nestmate.recurring_user_b')
), true);

SELECT set_config('request.jwt.claims', '{"sub":"5e000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5e000000-0000-4000-8000-0000000000b2', true);
SELECT set_config('nestmate.recurring_settlement', public.record_household_settlement(
  current_setting('nestmate.recurring_first_share_b')::UUID, 5000, 'Settled outside NestMate'
)::TEXT, true);
SELECT public.set_recurring_household_expense_status(
  current_setting('nestmate.recurring_template')::UUID,
  'PAUSED'::public."HouseholdRecurringTemplateStatus"
);

RESET ROLE;
SELECT nestmate_private.generate_due_recurring_household_expenses(
  (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::DATE,
  (date_trunc('month', CURRENT_DATE) + INTERVAL '2 months - 1 day')::DATE,
  current_setting('nestmate.recurring_household')::UUID
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5e000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5e000000-0000-4000-8000-0000000000b2', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public."HouseholdExpense") <> 1 THEN
    RAISE EXCEPTION 'Paused template generated a new expense.';
  END IF;
END; $$;

SELECT public.set_recurring_household_expense_status(
  current_setting('nestmate.recurring_template')::UUID,
  'ACTIVE'::public."HouseholdRecurringTemplateStatus"
);
RESET ROLE;
SELECT nestmate_private.generate_due_recurring_household_expenses(
  (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::DATE,
  (date_trunc('month', CURRENT_DATE) + INTERVAL '2 months - 1 day')::DATE,
  current_setting('nestmate.recurring_household')::UUID
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5e000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5e000000-0000-4000-8000-0000000000b2', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public."HouseholdExpense") <> 2 THEN
    RAISE EXCEPTION 'Resumed template did not generate the next billing cycle.';
  END IF;
END; $$;

SELECT public.update_recurring_household_expense(
  current_setting('nestmate.recurring_template')::UUID,
  current_setting('nestmate.recurring_user_b'),
  'SUBSCRIPTION'::public."HouseholdExpenseCategory",
  'Updated monthly bill', NULL, 12000, CURRENT_DATE, NULL,
  'CUSTOM'::public."HouseholdExpenseSplitMethod",
  ARRAY[current_setting('nestmate.recurring_user_a'), current_setting('nestmate.recurring_user_b')],
  ARRAY[7000, 5000]
);
RESET ROLE;
SELECT nestmate_private.generate_due_recurring_household_expenses(
  (date_trunc('month', CURRENT_DATE) + INTERVAL '2 months')::DATE,
  (date_trunc('month', CURRENT_DATE) + INTERVAL '3 months - 1 day')::DATE,
  current_setting('nestmate.recurring_household')::UUID
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5e000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5e000000-0000-4000-8000-0000000000b2', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public."HouseholdExpense") <> 3
    OR NOT EXISTS (
      SELECT 1 FROM public."HouseholdExpense"
      WHERE "id" = current_setting('nestmate.recurring_first_expense')::UUID
        AND "amountMinor" = 10001 AND "title" = 'Monthly rent'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public."HouseholdExpense"
      WHERE "recurringTemplateId" = current_setting('nestmate.recurring_template')::UUID
        AND "billingCycleStart" = (date_trunc('month', CURRENT_DATE) + INTERVAL '2 months')::DATE
        AND "amountMinor" = 12000 AND "title" = 'Updated monthly bill'
    )
    OR NOT EXISTS (SELECT 1 FROM public."HouseholdSettlement"
      WHERE "id" = current_setting('nestmate.recurring_settlement')::UUID) THEN
    RAISE EXCEPTION 'Editing a template changed history or failed to affect a future cycle.';
  END IF;
END;
$$;

SELECT public.set_recurring_household_expense_status(
  current_setting('nestmate.recurring_template')::UUID,
  'ENDED'::public."HouseholdRecurringTemplateStatus"
);
RESET ROLE;
SELECT nestmate_private.generate_due_recurring_household_expenses(
  (date_trunc('month', CURRENT_DATE) + INTERVAL '3 months')::DATE,
  (date_trunc('month', CURRENT_DATE) + INTERVAL '4 months - 1 day')::DATE,
  current_setting('nestmate.recurring_household')::UUID
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"5e000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5e000000-0000-4000-8000-0000000000b2', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public."HouseholdExpense") <> 3 THEN
    RAISE EXCEPTION 'Ended template generated another expense.';
  END IF;
END; $$;

SELECT set_config('request.jwt.claims', '{"sub":"5e000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '5e000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE outsider_denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."HouseholdRecurringExpenseTemplate")
    OR EXISTS (SELECT 1 FROM public."HouseholdRecurringExpenseParticipant")
    OR EXISTS (SELECT 1 FROM public."HouseholdExpense") THEN
    RAISE EXCEPTION 'Outsider read recurring templates or generated expenses.';
  END IF;
  BEGIN
    PERFORM public.set_recurring_household_expense_status(
      current_setting('nestmate.recurring_template')::UUID,
      'PAUSED'::public."HouseholdRecurringTemplateStatus"
    );
  EXCEPTION WHEN insufficient_privilege THEN outsider_denied := TRUE;
  END;
  IF NOT outsider_denied THEN RAISE EXCEPTION 'Outsider changed a recurring template.'; END IF;
END;
$$;

ROLLBACK;
