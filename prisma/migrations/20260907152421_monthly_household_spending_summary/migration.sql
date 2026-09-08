CREATE FUNCTION public.get_household_monthly_spending_summary(
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
    SELECT
      expense."id",
      expense."paidById",
      expense."category",
      expense."title",
      expense."amountMinor",
      expense."expenseDate"
    FROM public."HouseholdExpense" AS expense
    WHERE expense."householdId" = p_household_id
      AND expense."expenseDate" >= month_start
      AND expense."expenseDate" < month_end
  ), month_shares AS MATERIALIZED (
    SELECT
      share."memberId",
      share."creditorId",
      share."shareAmountMinor",
      LEAST(share."shareAmountMinor", share."settledAmountMinor") AS paid_minor,
      GREATEST(share."shareAmountMinor" - share."settledAmountMinor", 0) AS outstanding_minor
    FROM public."HouseholdExpenseShare" AS share
    JOIN month_expenses AS expense ON expense."id" = share."expenseId"
  ), expense_totals AS (
    SELECT
      COALESCE(SUM("amountMinor"), 0)::BIGINT AS total_minor,
      COUNT(*)::INTEGER AS expense_count
    FROM month_expenses
  ), share_totals AS (
    SELECT
      COALESCE(SUM(paid_minor), 0)::BIGINT AS paid_minor,
      COALESCE(SUM(outstanding_minor), 0)::BIGINT AS outstanding_minor
    FROM month_shares
  ), viewer_totals AS (
    SELECT
      COALESCE(SUM("shareAmountMinor"), 0)::BIGINT AS share_minor,
      COALESCE(SUM(paid_minor), 0)::BIGINT AS paid_minor,
      COALESCE(SUM(outstanding_minor), 0)::BIGINT AS outstanding_minor
    FROM month_shares
    WHERE "memberId" = current_user_id
  ), viewer_covered AS (
    SELECT COALESCE(SUM("amountMinor"), 0)::BIGINT AS covered_minor
    FROM month_expenses
    WHERE "paidById" = current_user_id
  ), category_totals AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'category', category,
          'amountMinor', amount_minor,
          'expenseCount', expense_count
        ) ORDER BY amount_minor DESC, category::TEXT
      ),
      '[]'::JSONB
    ) AS value
    FROM (
      SELECT
        "category" AS category,
        SUM("amountMinor")::BIGINT AS amount_minor,
        COUNT(*)::INTEGER AS expense_count
      FROM month_expenses
      GROUP BY "category"
    ) AS grouped_categories
  ), largest_expenses AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ranked."id",
          'title', ranked."title",
          'category', ranked."category",
          'amountMinor', ranked."amountMinor",
          'expenseDate', ranked."expenseDate"
        ) ORDER BY ranked."amountMinor" DESC, ranked."expenseDate" DESC, ranked."id"
      ),
      '[]'::JSONB
    ) AS value
    FROM (
      SELECT *
      FROM month_expenses
      ORDER BY "amountMinor" DESC, "expenseDate" DESC, "id"
      LIMIT 5
    ) AS ranked
  )
  SELECT jsonb_build_object(
    'householdId', p_household_id,
    'month', to_char(month_start, 'YYYY-MM'),
    'expenseCount', expense_totals.expense_count,
    'totalExpenseMinor', expense_totals.total_minor,
    'paidMinor', share_totals.paid_minor,
    'outstandingMinor', share_totals.outstanding_minor,
    'categories', category_totals.value,
    'largestExpenses', largest_expenses.value,
    'viewer', jsonb_build_object(
      'shareMinor', viewer_totals.share_minor,
      'paidMinor', viewer_totals.paid_minor,
      'outstandingMinor', viewer_totals.outstanding_minor,
      'paidForHouseholdMinor', viewer_covered.covered_minor
    )
  ) INTO result
  FROM expense_totals
  CROSS JOIN share_totals
  CROSS JOIN viewer_totals
  CROSS JOIN viewer_covered
  CROSS JOIN category_totals
  CROSS JOIN largest_expenses;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_household_monthly_spending_summary(UUID, DATE)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_household_monthly_spending_summary(UUID, DATE)
TO authenticated;
