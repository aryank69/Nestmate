CREATE OR REPLACE FUNCTION public.get_household_expense_trends(
  p_household_id UUID,
  p_end_month DATE,
  p_month_count INTEGER DEFAULT 6
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  end_month DATE := date_trunc('month', p_end_month)::DATE;
  start_month DATE;
  range_end DATE;
  result JSONB;
BEGIN
  IF p_end_month IS NULL OR p_end_month <> end_month THEN
    RAISE EXCEPTION 'Choose the first day of a valid end month.' USING ERRCODE = '22023';
  END IF;
  IF p_month_count NOT IN (6, 12) THEN
    RAISE EXCEPTION 'Expense trends support only 6 or 12 months.' USING ERRCODE = '22023';
  END IF;
  IF current_user_id IS NULL
    OR NOT (SELECT nestmate_private.can_access_household(p_household_id)) THEN
    RAISE EXCEPTION 'This household trend is private or unavailable.' USING ERRCODE = '42501';
  END IF;

  start_month := (end_month - make_interval(months => p_month_count - 1))::DATE;
  range_end := (end_month + INTERVAL '1 month')::DATE;

  WITH months AS MATERIALIZED (
    SELECT generated.month_start::DATE
    FROM generate_series(
      start_month::TIMESTAMP,
      end_month::TIMESTAMP,
      INTERVAL '1 month'
    ) AS generated(month_start)
  ), range_expenses AS MATERIALIZED (
    SELECT
      date_trunc('month', expense."expenseDate")::DATE AS month_start,
      expense."amountMinor"::BIGINT AS amount_minor,
      expense."category",
      expense."recurringTemplateId"
    FROM public."HouseholdExpense" AS expense
    WHERE expense."householdId" = p_household_id
      AND expense."expenseDate" >= start_month
      AND expense."expenseDate" < range_end
  ), expense_months AS (
    SELECT
      month_start,
      SUM(amount_minor)::BIGINT AS total_minor,
      SUM(amount_minor) FILTER (WHERE "recurringTemplateId" IS NOT NULL)::BIGINT AS recurring_minor,
      SUM(amount_minor) FILTER (WHERE "recurringTemplateId" IS NULL)::BIGINT AS one_time_minor,
      COUNT(*)::INTEGER AS expense_count
    FROM range_expenses
    GROUP BY month_start
  ), budget_months AS (
    SELECT
      budget."month" AS month_start,
      COALESCE(
        MAX(budget."amountMinor") FILTER (
          WHERE budget."category" = 'OVERALL'::public."HouseholdBudgetCategory"
        ),
        SUM(budget."amountMinor") FILTER (
          WHERE budget."category" <> 'OVERALL'::public."HouseholdBudgetCategory"
        )
      )::BIGINT AS budget_minor
    FROM public."HouseholdMonthlyBudget" AS budget
    WHERE budget."householdId" = p_household_id
      AND budget."month" >= start_month
      AND budget."month" <= end_month
    GROUP BY budget."month"
  ), monthly_values AS (
    SELECT
      months.month_start,
      COALESCE(expense_months.total_minor, 0)::BIGINT AS total_minor,
      COALESCE(expense_months.recurring_minor, 0)::BIGINT AS recurring_minor,
      COALESCE(expense_months.one_time_minor, 0)::BIGINT AS one_time_minor,
      COALESCE(expense_months.expense_count, 0)::INTEGER AS expense_count,
      budget_months.budget_minor
    FROM months
    LEFT JOIN expense_months USING (month_start)
    LEFT JOIN budget_months USING (month_start)
  ), monthly_comparisons AS (
    SELECT
      monthly_values.*,
      LAG(total_minor) OVER (ORDER BY month_start) AS previous_total_minor,
      ROW_NUMBER() OVER (ORDER BY month_start) AS month_position
    FROM monthly_values
  ), monthly_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'month', to_char(month_start, 'YYYY-MM'),
      'totalMinor', total_minor,
      'recurringMinor', recurring_minor,
      'oneTimeMinor', one_time_minor,
      'expenseCount', expense_count,
      'budgetMinor', budget_minor,
      'budgetUsagePercent', CASE
        WHEN budget_minor IS NULL OR budget_minor <= 0 THEN NULL
        ELSE ROUND(total_minor * 100.0 / budget_minor)::INTEGER
      END,
      'changeMinor', CASE WHEN month_position = 1 THEN NULL ELSE total_minor - previous_total_minor END,
      'changePercent', CASE
        WHEN month_position = 1 OR previous_total_minor = 0 THEN NULL
        ELSE ROUND((total_minor - previous_total_minor) * 100.0 / previous_total_minor)::INTEGER
      END,
      'direction', CASE
        WHEN month_position = 1 THEN 'START'
        WHEN previous_total_minor = 0 AND total_minor > 0 THEN 'NEW'
        WHEN total_minor > previous_total_minor THEN 'UP'
        WHEN total_minor < previous_total_minor THEN 'DOWN'
        ELSE 'FLAT'
      END
    ) ORDER BY month_start), '[]'::JSONB) AS value
    FROM monthly_comparisons
  ), category_names(category) AS (
    VALUES ('RENT'), ('UTILITIES'), ('GROCERIES'),
      ('MAINTENANCE'), ('SUBSCRIPTIONS'), ('OTHER')
  ), categorized_expenses AS (
    SELECT
      month_start,
      CASE category
        WHEN 'RENT'::public."HouseholdExpenseCategory" THEN 'RENT'
        WHEN 'ELECTRICITY'::public."HouseholdExpenseCategory" THEN 'UTILITIES'
        WHEN 'INTERNET'::public."HouseholdExpenseCategory" THEN 'UTILITIES'
        WHEN 'GROCERIES'::public."HouseholdExpenseCategory" THEN 'GROCERIES'
        WHEN 'MAINTENANCE'::public."HouseholdExpenseCategory" THEN 'MAINTENANCE'
        WHEN 'SUBSCRIPTION'::public."HouseholdExpenseCategory" THEN 'SUBSCRIPTIONS'
        ELSE 'OTHER'
      END AS category,
      amount_minor
    FROM range_expenses
    WHERE month_start >= (end_month - INTERVAL '1 month')::DATE
  ), category_values AS (
    SELECT
      category_names.category,
      COALESCE(SUM(categorized_expenses.amount_minor) FILTER (
        WHERE categorized_expenses.month_start = end_month
      ), 0)::BIGINT AS current_minor,
      COALESCE(SUM(categorized_expenses.amount_minor) FILTER (
        WHERE categorized_expenses.month_start = (end_month - INTERVAL '1 month')::DATE
      ), 0)::BIGINT AS previous_minor
    FROM category_names
    LEFT JOIN categorized_expenses USING (category)
    GROUP BY category_names.category
  ), category_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'category', category,
      'currentMinor', current_minor,
      'previousMinor', previous_minor,
      'changeMinor', current_minor - previous_minor,
      'changePercent', CASE
        WHEN previous_minor = 0 THEN NULL
        ELSE ROUND((current_minor - previous_minor) * 100.0 / previous_minor)::INTEGER
      END,
      'direction', CASE
        WHEN previous_minor = 0 AND current_minor > 0 THEN 'NEW'
        WHEN current_minor > previous_minor THEN 'UP'
        WHEN current_minor < previous_minor THEN 'DOWN'
        ELSE 'FLAT'
      END
    ) ORDER BY current_minor DESC, category), '[]'::JSONB) AS value
    FROM category_values
  )
  SELECT jsonb_build_object(
    'householdId', p_household_id,
    'endMonth', to_char(end_month, 'YYYY-MM'),
    'monthCount', p_month_count,
    'months', monthly_json.value,
    'categoryChanges', category_json.value
  ) INTO result
  FROM monthly_json CROSS JOIN category_json;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_household_expense_trends(UUID, DATE, INTEGER)
IS 'Returns privacy-safe household-level expense and budget trends for six or twelve months.';

REVOKE ALL ON FUNCTION public.get_household_expense_trends(UUID, DATE, INTEGER)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_household_expense_trends(UUID, DATE, INTEGER)
TO authenticated;
