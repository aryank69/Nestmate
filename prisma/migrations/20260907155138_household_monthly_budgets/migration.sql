CREATE TYPE public."HouseholdBudgetCategory" AS ENUM (
  'OVERALL', 'RENT', 'UTILITIES', 'GROCERIES',
  'MAINTENANCE', 'SUBSCRIPTIONS', 'OTHER'
);

ALTER TYPE public."NotificationType" ADD VALUE IF NOT EXISTS 'HOUSEHOLD_BUDGET';

CREATE TABLE public."HouseholdMonthlyBudget" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "householdId" UUID NOT NULL,
  "month" DATE NOT NULL,
  "category" public."HouseholdBudgetCategory" NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdMonthlyBudget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HouseholdMonthlyBudget_month_check"
    CHECK ("month" = date_trunc('month', "month")::DATE),
  CONSTRAINT "HouseholdMonthlyBudget_amountMinor_check"
    CHECK ("amountMinor" BETWEEN 1 AND 100000000),
  CONSTRAINT "HouseholdMonthlyBudget_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES public."Household"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdMonthlyBudget_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HouseholdMonthlyBudget_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "HouseholdMonthlyBudget_householdId_month_category_key"
ON public."HouseholdMonthlyBudget"("householdId", "month", "category");
CREATE INDEX "HouseholdMonthlyBudget_householdId_month_idx"
ON public."HouseholdMonthlyBudget"("householdId", "month");
CREATE INDEX "HouseholdMonthlyBudget_createdById_updatedAt_idx"
ON public."HouseholdMonthlyBudget"("createdById", "updatedAt" DESC);
CREATE INDEX "HouseholdMonthlyBudget_updatedById_updatedAt_idx"
ON public."HouseholdMonthlyBudget"("updatedById", "updatedAt" DESC);

ALTER TABLE public."HouseholdMonthlyBudget" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."HouseholdMonthlyBudget"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."HouseholdMonthlyBudget" TO authenticated;
REVOKE ALL ON TYPE public."HouseholdBudgetCategory" FROM PUBLIC;
GRANT USAGE ON TYPE public."HouseholdBudgetCategory" TO authenticated;

CREATE POLICY "Active members can read household monthly budgets"
ON public."HouseholdMonthlyBudget" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_household("householdId")));

CREATE FUNCTION nestmate_private.household_budget_spend(
  p_household_id UUID,
  p_month DATE,
  p_category public."HouseholdBudgetCategory"
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(expense."amountMinor"), 0)::BIGINT
  FROM public."HouseholdExpense" AS expense
  WHERE expense."householdId" = p_household_id
    AND expense."expenseDate" >= p_month
    AND expense."expenseDate" < p_month + INTERVAL '1 month'
    AND CASE p_category
      WHEN 'OVERALL'::public."HouseholdBudgetCategory" THEN TRUE
      WHEN 'RENT'::public."HouseholdBudgetCategory"
        THEN expense."category" = 'RENT'::public."HouseholdExpenseCategory"
      WHEN 'UTILITIES'::public."HouseholdBudgetCategory"
        THEN expense."category" IN (
          'ELECTRICITY'::public."HouseholdExpenseCategory",
          'INTERNET'::public."HouseholdExpenseCategory"
        )
      WHEN 'GROCERIES'::public."HouseholdBudgetCategory"
        THEN expense."category" = 'GROCERIES'::public."HouseholdExpenseCategory"
      WHEN 'MAINTENANCE'::public."HouseholdBudgetCategory"
        THEN expense."category" = 'MAINTENANCE'::public."HouseholdExpenseCategory"
      WHEN 'SUBSCRIPTIONS'::public."HouseholdBudgetCategory"
        THEN expense."category" = 'SUBSCRIPTION'::public."HouseholdExpenseCategory"
      WHEN 'OTHER'::public."HouseholdBudgetCategory"
        THEN expense."category" = 'OTHER'::public."HouseholdExpenseCategory"
      ELSE FALSE
    END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.household_budget_spend(
  UUID, DATE, public."HouseholdBudgetCategory"
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.generate_household_budget_alerts(
  p_household_id UUID,
  p_month DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  IF p_month IS NULL OR p_month <> date_trunc('month', p_month)::DATE THEN
    RETURN 0;
  END IF;

  WITH budget_usage AS (
    SELECT
      budget."householdId",
      budget."month",
      budget."category",
      budget."amountMinor"::BIGINT AS budget_minor,
      nestmate_private.household_budget_spend(
        budget."householdId", budget."month", budget."category"
      ) AS spend_minor
    FROM public."HouseholdMonthlyBudget" AS budget
    JOIN public."Household" AS household ON household."id" = budget."householdId"
    WHERE budget."householdId" = p_household_id
      AND budget."month" = p_month
      AND household."status" = 'ACTIVE'::public."HouseholdStatus"
      AND NOT EXISTS (
        SELECT 1
        FROM public."HouseholdMember" AS member
        WHERE member."householdId" = household."id"
          AND member."status" = 'ACTIVE'::public."HouseholdMemberStatus"
          AND NOT nestmate_private.is_user_content_visible(member."userId")
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public."HouseholdMember" AS first_member
        JOIN public."HouseholdMember" AS second_member
          ON second_member."householdId" = first_member."householdId"
          AND second_member."status" = 'ACTIVE'::public."HouseholdMemberStatus"
          AND second_member."userId" <> first_member."userId"
        JOIN public."UserBlock" AS user_block ON (
          (user_block."blockerId" = first_member."userId" AND user_block."blockedId" = second_member."userId")
          OR (user_block."blockedId" = first_member."userId" AND user_block."blockerId" = second_member."userId")
        )
        WHERE first_member."householdId" = household."id"
          AND first_member."status" = 'ACTIVE'::public."HouseholdMemberStatus"
      )
  ), reached_threshold AS (
    SELECT
      usage.*,
      CASE
        WHEN usage.spend_minor * 100 >= usage.budget_minor * 100 THEN 100
        WHEN usage.spend_minor * 100 >= usage.budget_minor * 80 THEN 80
        ELSE NULL
      END AS threshold,
      CASE usage."category"
        WHEN 'OVERALL'::public."HouseholdBudgetCategory" THEN 'Overall spending'
        WHEN 'RENT'::public."HouseholdBudgetCategory" THEN 'Rent'
        WHEN 'UTILITIES'::public."HouseholdBudgetCategory" THEN 'Utilities'
        WHEN 'GROCERIES'::public."HouseholdBudgetCategory" THEN 'Groceries'
        WHEN 'MAINTENANCE'::public."HouseholdBudgetCategory" THEN 'Maintenance'
        WHEN 'SUBSCRIPTIONS'::public."HouseholdBudgetCategory" THEN 'Subscriptions'
        ELSE 'Other shared expenses'
      END AS category_label
    FROM budget_usage AS usage
  )
  INSERT INTO public."Notification" (
    "recipientId", "actorId", "type", "title", "body", "href", "resourceId"
  )
  SELECT
    member."userId",
    NULL,
    'HOUSEHOLD_BUDGET'::public."NotificationType",
    CASE WHEN reached.threshold = 100
      THEN 'Monthly budget reached'
      ELSE 'Monthly budget at 80%'
    END,
    reached.category_label || ' for ' || to_char(reached."month", 'FMMonth YYYY') ||
      ' has reached ' || reached.threshold::TEXT || '% of the shared budget.',
    '/household?month=' || to_char(reached."month", 'YYYY-MM') ||
      '#budget-' || lower(reached."category"::TEXT),
    reached."householdId"::TEXT || ':' || to_char(reached."month", 'YYYY-MM') ||
      ':' || reached."category"::TEXT || ':' || reached.threshold::TEXT
  FROM reached_threshold AS reached
  JOIN public."HouseholdMember" AS member
    ON member."householdId" = reached."householdId"
    AND member."status" = 'ACTIVE'::public."HouseholdMemberStatus"
  WHERE reached.threshold IS NOT NULL
  ON CONFLICT ("recipientId", "type", "resourceId")
    WHERE "actorId" IS NULL
  DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.generate_household_budget_alerts(UUID, DATE)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.set_household_monthly_budget_internal(
  p_household_id UUID,
  p_month DATE,
  p_category public."HouseholdBudgetCategory",
  p_amount_minor INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF current_user_id IS NULL
    OR NOT nestmate_private.can_manage_household(p_household_id) THEN
    RAISE EXCEPTION 'This household is private, archived, or unavailable.' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR p_month <> date_trunc('month', p_month)::DATE THEN
    RAISE EXCEPTION 'Choose a valid billing month.' USING ERRCODE = '22023';
  END IF;
  IF p_amount_minor IS NOT NULL AND p_amount_minor NOT BETWEEN 1 AND 100000000 THEN
    RAISE EXCEPTION 'Choose a valid monthly budget.' USING ERRCODE = '22023';
  END IF;

  IF p_amount_minor IS NULL THEN
    DELETE FROM public."HouseholdMonthlyBudget"
    WHERE "householdId" = p_household_id
      AND "month" = p_month
      AND "category" = p_category;
  ELSE
    INSERT INTO public."HouseholdMonthlyBudget" (
      "householdId", "month", "category", "amountMinor", "createdById", "updatedById"
    ) VALUES (
      p_household_id, p_month, p_category, p_amount_minor, current_user_id, current_user_id
    )
    ON CONFLICT ("householdId", "month", "category") DO UPDATE
    SET "amountMinor" = EXCLUDED."amountMinor",
        "updatedById" = current_user_id,
        "updatedAt" = CURRENT_TIMESTAMP;
  END IF;

  PERFORM nestmate_private.generate_household_budget_alerts(p_household_id, p_month);
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.set_household_monthly_budget_internal(
  UUID, DATE, public."HouseholdBudgetCategory", INTEGER
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION nestmate_private.set_household_monthly_budget_internal(
  UUID, DATE, public."HouseholdBudgetCategory", INTEGER
) TO authenticated;

CREATE FUNCTION public.set_household_monthly_budget(
  p_household_id UUID,
  p_month DATE,
  p_category public."HouseholdBudgetCategory",
  p_amount_minor INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nestmate_private.set_household_monthly_budget_internal(
    p_household_id, p_month, p_category, p_amount_minor
  );
$$;
REVOKE ALL ON FUNCTION public.set_household_monthly_budget(
  UUID, DATE, public."HouseholdBudgetCategory", INTEGER
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_household_monthly_budget(
  UUID, DATE, public."HouseholdBudgetCategory", INTEGER
) TO authenticated;

CREATE FUNCTION nestmate_private.on_household_expense_budget_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM nestmate_private.generate_household_budget_alerts(
      OLD."householdId", date_trunc('month', OLD."expenseDate")::DATE
    );
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (
    TG_OP = 'INSERT'
    OR NEW."householdId" <> OLD."householdId"
    OR NEW."expenseDate" <> OLD."expenseDate"
    OR NEW."category" <> OLD."category"
    OR NEW."amountMinor" <> OLD."amountMinor"
  ) THEN
    PERFORM nestmate_private.generate_household_budget_alerts(
      NEW."householdId", date_trunc('month', NEW."expenseDate")::DATE
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.on_household_expense_budget_change()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "HouseholdExpense_budget_alerts"
AFTER INSERT OR UPDATE OR DELETE ON public."HouseholdExpense"
FOR EACH ROW EXECUTE FUNCTION nestmate_private.on_household_expense_budget_change();

CREATE OR REPLACE FUNCTION public.get_household_monthly_spending_summary(
  p_household_id UUID,
  p_month DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  month_start DATE := date_trunc('month', p_month)::DATE;
  month_end DATE := (date_trunc('month', p_month) + INTERVAL '1 month')::DATE;
  result JSONB;
BEGIN
  IF p_month IS NULL OR p_month <> month_start THEN
    RAISE EXCEPTION 'Choose the first day of a valid month.' USING ERRCODE = '22023';
  END IF;
  IF current_user_id IS NULL
    OR NOT (SELECT nestmate_private.can_access_household(p_household_id)) THEN
    RAISE EXCEPTION 'This household summary is private or unavailable.' USING ERRCODE = '42501';
  END IF;

  WITH month_expenses AS MATERIALIZED (
    SELECT expense."id", expense."paidById", expense."category", expense."title",
      expense."amountMinor", expense."expenseDate"
    FROM public."HouseholdExpense" AS expense
    WHERE expense."householdId" = p_household_id
      AND expense."expenseDate" >= month_start
      AND expense."expenseDate" < month_end
  ), month_shares AS MATERIALIZED (
    SELECT share."memberId", share."shareAmountMinor",
      LEAST(share."shareAmountMinor", share."settledAmountMinor") AS paid_minor,
      GREATEST(share."shareAmountMinor" - share."settledAmountMinor", 0) AS outstanding_minor
    FROM public."HouseholdExpenseShare" AS share
    JOIN month_expenses AS expense ON expense."id" = share."expenseId"
  ), expense_totals AS (
    SELECT COALESCE(SUM("amountMinor"), 0)::BIGINT AS total_minor,
      COUNT(*)::INTEGER AS expense_count FROM month_expenses
  ), share_totals AS (
    SELECT COALESCE(SUM(paid_minor), 0)::BIGINT AS paid_minor,
      COALESCE(SUM(outstanding_minor), 0)::BIGINT AS outstanding_minor FROM month_shares
  ), viewer_totals AS (
    SELECT COALESCE(SUM("shareAmountMinor"), 0)::BIGINT AS share_minor,
      COALESCE(SUM(paid_minor), 0)::BIGINT AS paid_minor,
      COALESCE(SUM(outstanding_minor), 0)::BIGINT AS outstanding_minor
    FROM month_shares WHERE "memberId" = current_user_id
  ), viewer_covered AS (
    SELECT COALESCE(SUM("amountMinor"), 0)::BIGINT AS covered_minor
    FROM month_expenses WHERE "paidById" = current_user_id
  ), category_totals AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'category', category, 'amountMinor', amount_minor, 'expenseCount', expense_count
    ) ORDER BY amount_minor DESC, category::TEXT), '[]'::JSONB) AS value
    FROM (
      SELECT "category" AS category, SUM("amountMinor")::BIGINT AS amount_minor,
        COUNT(*)::INTEGER AS expense_count
      FROM month_expenses GROUP BY "category"
    ) AS grouped_categories
  ), largest_expenses AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', ranked."id", 'title', ranked."title", 'category', ranked."category",
      'amountMinor', ranked."amountMinor", 'expenseDate', ranked."expenseDate"
    ) ORDER BY ranked."amountMinor" DESC, ranked."expenseDate" DESC, ranked."id"), '[]'::JSONB) AS value
    FROM (SELECT * FROM month_expenses
      ORDER BY "amountMinor" DESC, "expenseDate" DESC, "id" LIMIT 5) AS ranked
  ), budget_values AS (
    SELECT
      budget."id", budget."category", budget."amountMinor"::BIGINT AS budget_minor,
      CASE budget."category"
        WHEN 'OVERALL'::public."HouseholdBudgetCategory"
          THEN COALESCE((SELECT SUM("amountMinor") FROM month_expenses), 0)::BIGINT
        WHEN 'RENT'::public."HouseholdBudgetCategory"
          THEN COALESCE((SELECT SUM("amountMinor") FROM month_expenses WHERE "category" = 'RENT'), 0)::BIGINT
        WHEN 'UTILITIES'::public."HouseholdBudgetCategory"
          THEN COALESCE((SELECT SUM("amountMinor") FROM month_expenses WHERE "category" IN ('ELECTRICITY', 'INTERNET')), 0)::BIGINT
        WHEN 'GROCERIES'::public."HouseholdBudgetCategory"
          THEN COALESCE((SELECT SUM("amountMinor") FROM month_expenses WHERE "category" = 'GROCERIES'), 0)::BIGINT
        WHEN 'MAINTENANCE'::public."HouseholdBudgetCategory"
          THEN COALESCE((SELECT SUM("amountMinor") FROM month_expenses WHERE "category" = 'MAINTENANCE'), 0)::BIGINT
        WHEN 'SUBSCRIPTIONS'::public."HouseholdBudgetCategory"
          THEN COALESCE((SELECT SUM("amountMinor") FROM month_expenses WHERE "category" = 'SUBSCRIPTION'), 0)::BIGINT
        ELSE COALESCE((SELECT SUM("amountMinor") FROM month_expenses WHERE "category" = 'OTHER'), 0)::BIGINT
      END AS spend_minor
    FROM public."HouseholdMonthlyBudget" AS budget
    WHERE budget."householdId" = p_household_id AND budget."month" = month_start
  ), budget_progress AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', budget."id",
      'category', budget."category",
      'budgetMinor', budget.budget_minor,
      'spendMinor', budget.spend_minor,
      'usagePercent', ROUND(budget.spend_minor * 100.0 / budget.budget_minor)::INTEGER,
      'threshold', CASE
        WHEN budget.spend_minor * 100 >= budget.budget_minor * 100 THEN 'ONE_HUNDRED'
        WHEN budget.spend_minor * 100 >= budget.budget_minor * 80 THEN 'EIGHTY'
        ELSE 'BELOW'
      END
    ) ORDER BY CASE WHEN budget."category" = 'OVERALL' THEN 0 ELSE 1 END,
      budget."category"::TEXT), '[]'::JSONB) AS value
    FROM budget_values AS budget
  )
  SELECT jsonb_build_object(
    'householdId', p_household_id, 'month', to_char(month_start, 'YYYY-MM'),
    'expenseCount', expense_totals.expense_count,
    'totalExpenseMinor', expense_totals.total_minor,
    'paidMinor', share_totals.paid_minor,
    'outstandingMinor', share_totals.outstanding_minor,
    'categories', category_totals.value,
    'largestExpenses', largest_expenses.value,
    'budgets', budget_progress.value,
    'viewer', jsonb_build_object(
      'shareMinor', viewer_totals.share_minor,
      'paidMinor', viewer_totals.paid_minor,
      'outstandingMinor', viewer_totals.outstanding_minor,
      'paidForHouseholdMinor', viewer_covered.covered_minor
    )
  ) INTO result
  FROM expense_totals CROSS JOIN share_totals CROSS JOIN viewer_totals
  CROSS JOIN viewer_covered CROSS JOIN category_totals
  CROSS JOIN largest_expenses CROSS JOIN budget_progress;
  RETURN result;
END;
$$;
