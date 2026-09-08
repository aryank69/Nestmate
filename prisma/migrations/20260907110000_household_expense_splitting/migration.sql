CREATE TYPE public."HouseholdExpenseCategory" AS ENUM (
  'RENT', 'ELECTRICITY', 'INTERNET', 'GROCERIES', 'MAINTENANCE', 'OTHER'
);
CREATE TYPE public."HouseholdExpenseSplitMethod" AS ENUM ('EQUAL', 'CUSTOM');
CREATE TYPE public."HouseholdExpenseStatus" AS ENUM (
  'OUTSTANDING', 'PARTIALLY_SETTLED', 'SETTLED'
);
CREATE TYPE public."HouseholdExpenseShareStatus" AS ENUM (
  'NO_PAYMENT_DUE', 'OUTSTANDING', 'PARTIALLY_SETTLED', 'SETTLED'
);
CREATE TYPE public."HouseholdSettlementStatus" AS ENUM (
  'PENDING', 'CONFIRMED', 'CANCELLED'
);

CREATE TABLE public."HouseholdExpense" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "householdId" UUID NOT NULL,
  "createdById" TEXT NOT NULL,
  "paidById" TEXT NOT NULL,
  "category" public."HouseholdExpenseCategory" NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "amountMinor" INTEGER NOT NULL,
  "expenseDate" DATE NOT NULL,
  "splitMethod" public."HouseholdExpenseSplitMethod" NOT NULL,
  "status" public."HouseholdExpenseStatus" NOT NULL DEFAULT 'OUTSTANDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdExpense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HouseholdExpense_amount_check" CHECK (
    "amountMinor" BETWEEN 1 AND 100000000
  ),
  CONSTRAINT "HouseholdExpense_title_check" CHECK (
    char_length(btrim("title")) BETWEEN 1 AND 120
  ),
  CONSTRAINT "HouseholdExpense_description_check" CHECK (
    "description" IS NULL OR char_length("description") <= 500
  ),
  CONSTRAINT "HouseholdExpense_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES public."Household"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdExpense_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdExpense_paidById_fkey"
    FOREIGN KEY ("paidById") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "HouseholdExpense_householdId_expenseDate_createdAt_idx"
ON public."HouseholdExpense"("householdId", "expenseDate" DESC, "createdAt" DESC);
CREATE INDEX "HouseholdExpense_paidById_status_expenseDate_idx"
ON public."HouseholdExpense"("paidById", "status", "expenseDate" DESC);
CREATE INDEX "HouseholdExpense_createdById_createdAt_idx"
ON public."HouseholdExpense"("createdById", "createdAt" DESC);

CREATE TABLE public."HouseholdExpenseShare" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "expenseId" UUID NOT NULL,
  "memberId" TEXT NOT NULL,
  "creditorId" TEXT,
  "shareAmountMinor" INTEGER NOT NULL,
  "settledAmountMinor" INTEGER NOT NULL DEFAULT 0,
  "status" public."HouseholdExpenseShareStatus" NOT NULL DEFAULT 'OUTSTANDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdExpenseShare_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HouseholdExpenseShare_expenseId_memberId_key" UNIQUE ("expenseId", "memberId"),
  CONSTRAINT "HouseholdExpenseShare_amount_check" CHECK (
    "shareAmountMinor" > 0
    AND "settledAmountMinor" BETWEEN 0 AND "shareAmountMinor"
  ),
  CONSTRAINT "HouseholdExpenseShare_creditor_check" CHECK (
    ("creditorId" IS NULL AND "status" = 'NO_PAYMENT_DUE'::public."HouseholdExpenseShareStatus"
      AND "settledAmountMinor" = "shareAmountMinor")
    OR
    ("creditorId" IS NOT NULL AND "creditorId" <> "memberId"
      AND "status" <> 'NO_PAYMENT_DUE'::public."HouseholdExpenseShareStatus")
  ),
  CONSTRAINT "HouseholdExpenseShare_expenseId_fkey"
    FOREIGN KEY ("expenseId") REFERENCES public."HouseholdExpense"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdExpenseShare_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdExpenseShare_creditorId_fkey"
    FOREIGN KEY ("creditorId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "HouseholdExpenseShare_memberId_status_updatedAt_idx"
ON public."HouseholdExpenseShare"("memberId", "status", "updatedAt" DESC);
CREATE INDEX "HouseholdExpenseShare_creditorId_status_updatedAt_idx"
ON public."HouseholdExpenseShare"("creditorId", "status", "updatedAt" DESC);
CREATE INDEX "HouseholdExpenseShare_expenseId_status_idx"
ON public."HouseholdExpenseShare"("expenseId", "status");

CREATE TABLE public."HouseholdSettlement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "expenseShareId" UUID NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "status" public."HouseholdSettlementStatus" NOT NULL DEFAULT 'PENDING',
  "note" VARCHAR(240),
  "recordedById" TEXT NOT NULL,
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMPTZ(3),
  "cancelledAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HouseholdSettlement_amount_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "HouseholdSettlement_participants_check" CHECK ("fromUserId" <> "toUserId"),
  CONSTRAINT "HouseholdSettlement_state_check" CHECK (
    ("status" = 'PENDING'::public."HouseholdSettlementStatus"
      AND "confirmedById" IS NULL AND "confirmedAt" IS NULL AND "cancelledAt" IS NULL)
    OR
    ("status" = 'CONFIRMED'::public."HouseholdSettlementStatus"
      AND "confirmedById" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "cancelledAt" IS NULL)
    OR
    ("status" = 'CANCELLED'::public."HouseholdSettlementStatus"
      AND "confirmedById" IS NULL AND "confirmedAt" IS NULL AND "cancelledAt" IS NOT NULL)
  ),
  CONSTRAINT "HouseholdSettlement_expenseShareId_fkey"
    FOREIGN KEY ("expenseShareId") REFERENCES public."HouseholdExpenseShare"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdSettlement_fromUserId_fkey"
    FOREIGN KEY ("fromUserId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HouseholdSettlement_toUserId_fkey"
    FOREIGN KEY ("toUserId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HouseholdSettlement_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HouseholdSettlement_confirmedById_fkey"
    FOREIGN KEY ("confirmedById") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "HouseholdSettlement_expenseShareId_createdAt_idx"
ON public."HouseholdSettlement"("expenseShareId", "createdAt" DESC);
CREATE INDEX "HouseholdSettlement_fromUserId_status_createdAt_idx"
ON public."HouseholdSettlement"("fromUserId", "status", "createdAt" DESC);
CREATE INDEX "HouseholdSettlement_toUserId_status_createdAt_idx"
ON public."HouseholdSettlement"("toUserId", "status", "createdAt" DESC);

ALTER TABLE public."HouseholdExpense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HouseholdExpenseShare" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HouseholdSettlement" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."HouseholdExpense",
  public."HouseholdExpenseShare", public."HouseholdSettlement"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."HouseholdExpense",
  public."HouseholdExpenseShare", public."HouseholdSettlement"
TO authenticated;

REVOKE ALL ON TYPE public."HouseholdExpenseCategory",
  public."HouseholdExpenseSplitMethod", public."HouseholdExpenseStatus",
  public."HouseholdExpenseShareStatus", public."HouseholdSettlementStatus"
FROM PUBLIC;
GRANT USAGE ON TYPE public."HouseholdExpenseCategory",
  public."HouseholdExpenseSplitMethod", public."HouseholdExpenseStatus",
  public."HouseholdExpenseShareStatus", public."HouseholdSettlementStatus"
TO authenticated;

CREATE FUNCTION nestmate_private.refresh_household_expense_status(target_expense_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public."HouseholdExpenseShare" AS share
  SET "settledAmountMinor" = CASE
        WHEN share."creditorId" IS NULL THEN share."shareAmountMinor"
        ELSE LEAST(
          share."shareAmountMinor",
          COALESCE((
            SELECT SUM(settlement."amountMinor")
            FROM public."HouseholdSettlement" AS settlement
            WHERE settlement."expenseShareId" = share."id"
              AND settlement."status" = 'CONFIRMED'::public."HouseholdSettlementStatus"
          ), 0)
        )
      END,
      "status" = CASE
        WHEN share."creditorId" IS NULL
          THEN 'NO_PAYMENT_DUE'::public."HouseholdExpenseShareStatus"
        WHEN COALESCE((
          SELECT SUM(settlement."amountMinor")
          FROM public."HouseholdSettlement" AS settlement
          WHERE settlement."expenseShareId" = share."id"
            AND settlement."status" = 'CONFIRMED'::public."HouseholdSettlementStatus"
        ), 0) <= 0
          THEN 'OUTSTANDING'::public."HouseholdExpenseShareStatus"
        WHEN COALESCE((
          SELECT SUM(settlement."amountMinor")
          FROM public."HouseholdSettlement" AS settlement
          WHERE settlement."expenseShareId" = share."id"
            AND settlement."status" = 'CONFIRMED'::public."HouseholdSettlementStatus"
        ), 0) >= share."shareAmountMinor"
          THEN 'SETTLED'::public."HouseholdExpenseShareStatus"
        ELSE 'PARTIALLY_SETTLED'::public."HouseholdExpenseShareStatus"
      END,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE share."expenseId" = target_expense_id;

  UPDATE public."HouseholdExpense" AS expense
  SET "status" = CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM public."HouseholdExpenseShare" AS share
          WHERE share."expenseId" = expense."id" AND share."creditorId" IS NOT NULL
        ) OR NOT EXISTS (
          SELECT 1 FROM public."HouseholdExpenseShare" AS share
          WHERE share."expenseId" = expense."id" AND share."creditorId" IS NOT NULL
            AND share."status" <> 'SETTLED'::public."HouseholdExpenseShareStatus"
        ) THEN 'SETTLED'::public."HouseholdExpenseStatus"
        WHEN EXISTS (
          SELECT 1 FROM public."HouseholdExpenseShare" AS share
          WHERE share."expenseId" = expense."id" AND share."creditorId" IS NOT NULL
            AND share."settledAmountMinor" > 0
        ) THEN 'PARTIALLY_SETTLED'::public."HouseholdExpenseStatus"
        ELSE 'OUTSTANDING'::public."HouseholdExpenseStatus"
      END,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE expense."id" = target_expense_id;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.refresh_household_expense_status(UUID)
FROM PUBLIC, anon, authenticated;

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  expense_id UUID;
  member_count INTEGER := COALESCE(array_length(p_member_ids, 1), 0);
  base_amount INTEGER;
  remainder INTEGER;
  share_amount INTEGER;
  position INTEGER;
BEGIN
  IF current_user_id IS NULL
    OR NOT nestmate_private.can_manage_household(p_household_id) THEN
    RAISE EXCEPTION 'This household is private, archived, or unavailable.' USING ERRCODE = '42501';
  END IF;
  IF p_amount_minor NOT BETWEEN 1 AND 100000000
    OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 120
    OR p_description IS NOT NULL AND char_length(p_description) > 500
    OR p_expense_date IS NULL
    OR member_count = 0
    OR (SELECT COUNT(DISTINCT member_id) FROM unnest(p_member_ids) AS member_id) <> member_count THEN
    RAISE EXCEPTION 'Expense details or split members are invalid.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."HouseholdMember"
    WHERE "householdId" = p_household_id AND "userId" = p_paid_by_id
      AND "status" = 'ACTIVE'::public."HouseholdMemberStatus"
  ) OR EXISTS (
    SELECT 1 FROM unnest(p_member_ids) AS selected("userId")
    WHERE NOT EXISTS (
      SELECT 1 FROM public."HouseholdMember"
      WHERE "householdId" = p_household_id
        AND "userId" = selected."userId"
        AND "status" = 'ACTIVE'::public."HouseholdMemberStatus"
    )
  ) THEN
    RAISE EXCEPTION 'Expenses can only include active household members.' USING ERRCODE = '22023';
  END IF;

  IF p_split_method = 'CUSTOM'::public."HouseholdExpenseSplitMethod" THEN
    IF COALESCE(array_length(p_custom_share_amounts, 1), 0) <> member_count
      OR EXISTS (SELECT 1 FROM unnest(p_custom_share_amounts) AS amount WHERE amount <= 0)
      OR (SELECT COALESCE(SUM(amount), 0) FROM unnest(p_custom_share_amounts) AS amount) <> p_amount_minor THEN
      RAISE EXCEPTION 'Custom shares must be positive and add up to the expense total.' USING ERRCODE = '22023';
    END IF;
  ELSIF p_amount_minor < member_count THEN
    RAISE EXCEPTION 'The total is too small to split equally.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public."HouseholdExpense" (
    "householdId", "createdById", "paidById", "category", "title",
    "description", "amountMinor", "expenseDate", "splitMethod"
  ) VALUES (
    p_household_id, current_user_id, p_paid_by_id, p_category, btrim(p_title),
    NULLIF(btrim(p_description), ''), p_amount_minor, p_expense_date, p_split_method
  ) RETURNING "id" INTO expense_id;

  base_amount := p_amount_minor / member_count;
  remainder := p_amount_minor % member_count;
  FOR position IN 1..member_count LOOP
    share_amount := CASE
      WHEN p_split_method = 'CUSTOM'::public."HouseholdExpenseSplitMethod"
        THEN p_custom_share_amounts[position]
      ELSE base_amount + CASE WHEN position <= remainder THEN 1 ELSE 0 END
    END;
    INSERT INTO public."HouseholdExpenseShare" (
      "expenseId", "memberId", "creditorId", "shareAmountMinor",
      "settledAmountMinor", "status"
    ) VALUES (
      expense_id,
      p_member_ids[position],
      CASE WHEN p_member_ids[position] = p_paid_by_id THEN NULL ELSE p_paid_by_id END,
      share_amount,
      CASE WHEN p_member_ids[position] = p_paid_by_id THEN share_amount ELSE 0 END,
      CASE WHEN p_member_ids[position] = p_paid_by_id
        THEN 'NO_PAYMENT_DUE'::public."HouseholdExpenseShareStatus"
        ELSE 'OUTSTANDING'::public."HouseholdExpenseShareStatus" END
    );
  END LOOP;
  PERFORM nestmate_private.refresh_household_expense_status(expense_id);
  RETURN expense_id;
END;
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  expense_record public."HouseholdExpense"%ROWTYPE;
BEGIN
  SELECT * INTO expense_record FROM public."HouseholdExpense" WHERE "id" = p_expense_id;
  IF NOT FOUND OR current_user_id IS NULL
    OR expense_record."createdById" <> current_user_id
    OR NOT nestmate_private.can_manage_household(expense_record."householdId") THEN
    RAISE EXCEPTION 'Only the creator can remove an expense from an active household.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."HouseholdSettlement" AS settlement
    JOIN public."HouseholdExpenseShare" AS share ON share."id" = settlement."expenseShareId"
    WHERE share."expenseId" = p_expense_id
  ) THEN
    RAISE EXCEPTION 'Expenses with settlement history cannot be removed.' USING ERRCODE = '23514';
  END IF;
  DELETE FROM public."HouseholdExpense" WHERE "id" = p_expense_id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_household_expense(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_household_expense(UUID) TO authenticated;

CREATE FUNCTION public.record_household_settlement(
  p_expense_share_id UUID,
  p_amount_minor INTEGER,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  share_record RECORD;
  pending_amount INTEGER;
  settlement_id UUID;
BEGIN
  SELECT share.*, expense."householdId"
  INTO share_record
  FROM public."HouseholdExpenseShare" AS share
  JOIN public."HouseholdExpense" AS expense ON expense."id" = share."expenseId"
  WHERE share."id" = p_expense_share_id
  FOR UPDATE OF share;
  IF NOT FOUND OR current_user_id IS NULL
    OR share_record."creditorId" IS NULL
    OR current_user_id NOT IN (share_record."memberId", share_record."creditorId")
    OR NOT nestmate_private.can_manage_household(share_record."householdId") THEN
    RAISE EXCEPTION 'Only the two members involved can record this settlement.' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(SUM("amountMinor"), 0) INTO pending_amount
  FROM public."HouseholdSettlement"
  WHERE "expenseShareId" = p_expense_share_id
    AND "status" = 'PENDING'::public."HouseholdSettlementStatus";
  IF p_amount_minor <= 0
    OR p_amount_minor > share_record."shareAmountMinor" - share_record."settledAmountMinor" - pending_amount
    OR p_note IS NOT NULL AND char_length(p_note) > 240 THEN
    RAISE EXCEPTION 'Settlement amount exceeds the remaining balance.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public."HouseholdSettlement" (
    "expenseShareId", "fromUserId", "toUserId", "amountMinor", "note", "recordedById"
  ) VALUES (
    p_expense_share_id, share_record."memberId", share_record."creditorId",
    p_amount_minor, NULLIF(btrim(p_note), ''), current_user_id
  ) RETURNING "id" INTO settlement_id;
  RETURN settlement_id;
END;
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  settlement_record RECORD;
BEGIN
  SELECT settlement.*, share."expenseId", share."shareAmountMinor",
    share."settledAmountMinor", expense."householdId"
  INTO settlement_record
  FROM public."HouseholdSettlement" AS settlement
  JOIN public."HouseholdExpenseShare" AS share ON share."id" = settlement."expenseShareId"
  JOIN public."HouseholdExpense" AS expense ON expense."id" = share."expenseId"
  WHERE settlement."id" = p_settlement_id
  FOR UPDATE OF settlement, share;
  IF NOT FOUND OR current_user_id IS NULL
    OR current_user_id NOT IN (settlement_record."fromUserId", settlement_record."toUserId")
    OR settlement_record."status" <> 'PENDING'::public."HouseholdSettlementStatus"
    OR NOT nestmate_private.can_manage_household(settlement_record."householdId") THEN
    RAISE EXCEPTION 'This pending settlement cannot be changed.' USING ERRCODE = '42501';
  END IF;
  IF p_status = 'CONFIRMED'::public."HouseholdSettlementStatus" THEN
    IF settlement_record."recordedById" = current_user_id THEN
      RAISE EXCEPTION 'The other member must confirm this settlement.' USING ERRCODE = '42501';
    END IF;
    IF settlement_record."amountMinor" >
      settlement_record."shareAmountMinor" - settlement_record."settledAmountMinor" THEN
      RAISE EXCEPTION 'This settlement is larger than the remaining balance.' USING ERRCODE = '22023';
    END IF;
    UPDATE public."HouseholdSettlement"
    SET "status" = 'CONFIRMED'::public."HouseholdSettlementStatus",
        "confirmedById" = current_user_id,
        "confirmedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_settlement_id;
  ELSIF p_status = 'CANCELLED'::public."HouseholdSettlementStatus" THEN
    UPDATE public."HouseholdSettlement"
    SET "status" = 'CANCELLED'::public."HouseholdSettlementStatus",
        "cancelledAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_settlement_id;
  ELSE
    RAISE EXCEPTION 'Choose confirmed or cancelled.' USING ERRCODE = '22023';
  END IF;
  PERFORM nestmate_private.refresh_household_expense_status(settlement_record."expenseId");
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.set_household_settlement_status(
  UUID, public."HouseholdSettlementStatus"
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_household_settlement_status(
  UUID, public."HouseholdSettlementStatus"
) TO authenticated;

CREATE POLICY "Active members can read household expenses"
ON public."HouseholdExpense" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_household("householdId")));

CREATE POLICY "Active members can read household expense shares"
ON public."HouseholdExpenseShare" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_household((
  SELECT expense."householdId" FROM public."HouseholdExpense" AS expense
  WHERE expense."id" = "expenseId"
))));

CREATE POLICY "Active members can read household settlement history"
ON public."HouseholdSettlement" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_household((
  SELECT expense."householdId"
  FROM public."HouseholdExpenseShare" AS share
  JOIN public."HouseholdExpense" AS expense ON expense."id" = share."expenseId"
  WHERE share."id" = "expenseShareId"
))));
