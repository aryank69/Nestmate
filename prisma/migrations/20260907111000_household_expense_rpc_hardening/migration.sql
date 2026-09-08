CREATE INDEX "HouseholdSettlement_recordedById_createdAt_idx"
ON public."HouseholdSettlement"("recordedById", "createdAt" DESC);
CREATE INDEX "HouseholdSettlement_confirmedById_confirmedAt_idx"
ON public."HouseholdSettlement"("confirmedById", "confirmedAt" DESC);

ALTER FUNCTION public.create_household_expense(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) SET SCHEMA nestmate_private;
ALTER FUNCTION nestmate_private.create_household_expense(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) RENAME TO create_household_expense_internal;

ALTER FUNCTION public.delete_household_expense(UUID)
SET SCHEMA nestmate_private;
ALTER FUNCTION nestmate_private.delete_household_expense(UUID)
RENAME TO delete_household_expense_internal;

ALTER FUNCTION public.record_household_settlement(UUID, INTEGER, TEXT)
SET SCHEMA nestmate_private;
ALTER FUNCTION nestmate_private.record_household_settlement(UUID, INTEGER, TEXT)
RENAME TO record_household_settlement_internal;

ALTER FUNCTION public.set_household_settlement_status(
  UUID, public."HouseholdSettlementStatus"
) SET SCHEMA nestmate_private;
ALTER FUNCTION nestmate_private.set_household_settlement_status(
  UUID, public."HouseholdSettlementStatus"
) RENAME TO set_household_settlement_status_internal;

REVOKE ALL ON FUNCTION nestmate_private.create_household_expense_internal(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION nestmate_private.delete_household_expense_internal(UUID)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION nestmate_private.record_household_settlement_internal(UUID, INTEGER, TEXT)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION nestmate_private.set_household_settlement_status_internal(
  UUID, public."HouseholdSettlementStatus"
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION nestmate_private.create_household_expense_internal(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.delete_household_expense_internal(UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.record_household_settlement_internal(UUID, INTEGER, TEXT)
TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.set_household_settlement_status_internal(
  UUID, public."HouseholdSettlementStatus"
) TO authenticated;

CREATE FUNCTION public.create_household_expense(
  p_household_id UUID,
  p_paid_by_id TEXT,
  p_category public."HouseholdExpenseCategory",
  p_title TEXT,
  p_description TEXT,
  p_amount_minor INTEGER,
  p_expense_date DATE,
  p_split_method public."HouseholdExpenseSplitMethod",
  p_member_ids TEXT[],
  p_custom_share_amounts INTEGER[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nestmate_private.create_household_expense_internal(
    p_household_id, p_paid_by_id, p_category, p_title, p_description,
    p_amount_minor, p_expense_date, p_split_method, p_member_ids,
    p_custom_share_amounts
  );
$$;
REVOKE ALL ON FUNCTION public.create_household_expense(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household_expense(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) TO authenticated;

CREATE FUNCTION public.delete_household_expense(p_expense_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nestmate_private.delete_household_expense_internal(p_expense_id);
$$;
REVOKE ALL ON FUNCTION public.delete_household_expense(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_household_expense(UUID) TO authenticated;

CREATE FUNCTION public.record_household_settlement(
  p_expense_share_id UUID,
  p_amount_minor INTEGER,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nestmate_private.record_household_settlement_internal(
    p_expense_share_id, p_amount_minor, p_note
  );
$$;
REVOKE ALL ON FUNCTION public.record_household_settlement(UUID, INTEGER, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_household_settlement(UUID, INTEGER, TEXT)
TO authenticated;

CREATE FUNCTION public.set_household_settlement_status(
  p_settlement_id UUID,
  p_status public."HouseholdSettlementStatus"
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nestmate_private.set_household_settlement_status_internal(
    p_settlement_id, p_status
  );
$$;
REVOKE ALL ON FUNCTION public.set_household_settlement_status(
  UUID, public."HouseholdSettlementStatus"
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_household_settlement_status(
  UUID, public."HouseholdSettlementStatus"
) TO authenticated;
