ALTER TYPE public."HouseholdExpenseCategory" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION';
CREATE TYPE public."HouseholdRecurringTemplateStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

CREATE TABLE public."HouseholdRecurringExpenseTemplate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "householdId" UUID NOT NULL,
  "createdById" TEXT NOT NULL,
  "paidById" TEXT NOT NULL,
  "category" public."HouseholdExpenseCategory" NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "amountMinor" INTEGER NOT NULL,
  "splitMethod" public."HouseholdExpenseSplitMethod" NOT NULL,
  "firstDueDate" DATE NOT NULL,
  "dueDay" INTEGER NOT NULL,
  "endDate" DATE,
  "status" public."HouseholdRecurringTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
  "pausedAt" TIMESTAMPTZ(3),
  "endedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdRecurringExpenseTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HouseholdRecurringExpenseTemplate_amount_check" CHECK (
    "amountMinor" BETWEEN 1 AND 100000000
  ),
  CONSTRAINT "HouseholdRecurringExpenseTemplate_title_check" CHECK (
    char_length(btrim("title")) BETWEEN 1 AND 120
  ),
  CONSTRAINT "HouseholdRecurringExpenseTemplate_due_day_check" CHECK (
    "dueDay" BETWEEN 1 AND 31 AND "dueDay" = EXTRACT(DAY FROM "firstDueDate")
  ),
  CONSTRAINT "HouseholdRecurringExpenseTemplate_end_date_check" CHECK (
    "endDate" IS NULL OR "endDate" >= "firstDueDate"
  ),
  CONSTRAINT "HouseholdRecurringExpenseTemplate_status_check" CHECK (
    ("status" = 'ACTIVE'::public."HouseholdRecurringTemplateStatus"
      AND "pausedAt" IS NULL AND "endedAt" IS NULL)
    OR ("status" = 'PAUSED'::public."HouseholdRecurringTemplateStatus"
      AND "pausedAt" IS NOT NULL AND "endedAt" IS NULL)
    OR ("status" = 'ENDED'::public."HouseholdRecurringTemplateStatus"
      AND "endedAt" IS NOT NULL)
  ),
  CONSTRAINT "HouseholdRecurringExpenseTemplate_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES public."Household"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdRecurringExpenseTemplate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdRecurringExpenseTemplate_paidById_fkey"
    FOREIGN KEY ("paidById") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "HouseholdRecurringExpenseTemplate_householdId_status_firstDueDate_idx"
ON public."HouseholdRecurringExpenseTemplate"("householdId", "status", "firstDueDate");
CREATE INDEX "HouseholdRecurringExpenseTemplate_paidById_status_updatedAt_idx"
ON public."HouseholdRecurringExpenseTemplate"("paidById", "status", "updatedAt" DESC);
CREATE INDEX "HouseholdRecurringExpenseTemplate_createdById_updatedAt_idx"
ON public."HouseholdRecurringExpenseTemplate"("createdById", "updatedAt" DESC);

CREATE TABLE public."HouseholdRecurringExpenseParticipant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "templateId" UUID NOT NULL,
  "memberId" TEXT NOT NULL,
  "customAmountMinor" INTEGER,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdRecurringExpenseParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HouseholdRecurringExpenseParticipant_templateId_memberId_key"
    UNIQUE ("templateId", "memberId"),
  CONSTRAINT "HouseholdRecurringExpenseParticipant_amount_check" CHECK (
    "customAmountMinor" IS NULL OR "customAmountMinor" > 0
  ),
  CONSTRAINT "HouseholdRecurringExpenseParticipant_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES public."HouseholdRecurringExpenseTemplate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdRecurringExpenseParticipant_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "HouseholdRecurringExpenseParticipant_memberId_createdAt_idx"
ON public."HouseholdRecurringExpenseParticipant"("memberId", "createdAt" DESC);

ALTER TABLE public."HouseholdExpense"
  ADD COLUMN "recurringTemplateId" UUID,
  ADD COLUMN "billingCycleStart" DATE,
  ADD COLUMN "dueDate" DATE,
  ADD CONSTRAINT "HouseholdExpense_recurring_cycle_check" CHECK (
    ("recurringTemplateId" IS NULL AND "billingCycleStart" IS NULL)
    OR ("recurringTemplateId" IS NOT NULL AND "billingCycleStart" IS NOT NULL AND "dueDate" IS NOT NULL)
  ),
  ADD CONSTRAINT "HouseholdExpense_recurringTemplateId_fkey"
    FOREIGN KEY ("recurringTemplateId")
    REFERENCES public."HouseholdRecurringExpenseTemplate"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HouseholdExpense_recurringTemplateId_billingCycleStart_key"
    UNIQUE ("recurringTemplateId", "billingCycleStart");
CREATE INDEX "HouseholdExpense_householdId_dueDate_idx"
ON public."HouseholdExpense"("householdId", "dueDate");

ALTER TABLE public."HouseholdRecurringExpenseTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HouseholdRecurringExpenseParticipant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."HouseholdRecurringExpenseTemplate",
  public."HouseholdRecurringExpenseParticipant"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."HouseholdRecurringExpenseTemplate",
  public."HouseholdRecurringExpenseParticipant"
TO authenticated;
REVOKE ALL ON TYPE public."HouseholdRecurringTemplateStatus" FROM PUBLIC;
GRANT USAGE ON TYPE public."HouseholdRecurringTemplateStatus" TO authenticated;

CREATE FUNCTION nestmate_private.assert_recurring_household_expense_input(
  p_household_id UUID,
  p_paid_by_id TEXT,
  p_title TEXT,
  p_description TEXT,
  p_amount_minor INTEGER,
  p_first_due_date DATE,
  p_end_date DATE,
  p_split_method public."HouseholdExpenseSplitMethod",
  p_member_ids TEXT[],
  p_custom_share_amounts INTEGER[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE member_count INTEGER := COALESCE(array_length(p_member_ids, 1), 0);
BEGIN
  IF nestmate_private.current_nestmate_user_id() IS NULL
    OR NOT nestmate_private.can_manage_household(p_household_id) THEN
    RAISE EXCEPTION 'This household is private, archived, or unavailable.' USING ERRCODE = '42501';
  END IF;
  IF p_amount_minor NOT BETWEEN 1 AND 100000000
    OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 120
    OR (p_description IS NOT NULL AND char_length(p_description) > 500)
    OR p_first_due_date IS NULL
    OR (p_end_date IS NOT NULL AND p_end_date < p_first_due_date)
    OR member_count = 0
    OR (SELECT COUNT(DISTINCT member_id) FROM unnest(p_member_ids) AS member_id) <> member_count THEN
    RAISE EXCEPTION 'Recurring bill details or participants are invalid.' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'Recurring bills can only include active household members.' USING ERRCODE = '22023';
  END IF;
  IF p_split_method = 'CUSTOM'::public."HouseholdExpenseSplitMethod" THEN
    IF COALESCE(array_length(p_custom_share_amounts, 1), 0) <> member_count
      OR EXISTS (SELECT 1 FROM unnest(p_custom_share_amounts) AS amount WHERE amount <= 0)
      OR (SELECT COALESCE(SUM(amount), 0) FROM unnest(p_custom_share_amounts) AS amount) <> p_amount_minor THEN
      RAISE EXCEPTION 'Custom shares must be positive and add up to the recurring total.' USING ERRCODE = '22023';
    END IF;
  ELSIF p_amount_minor < member_count THEN
    RAISE EXCEPTION 'The recurring total is too small to split equally.' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.assert_recurring_household_expense_input(
  UUID, TEXT, TEXT, TEXT, INTEGER, DATE, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.generate_recurring_template_cycle(
  p_template_id UUID,
  p_cycle_start DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  template_record public."HouseholdRecurringExpenseTemplate"%ROWTYPE;
  cycle_start DATE := date_trunc('month', p_cycle_start)::DATE;
  cycle_due_date DATE;
  last_cycle_day INTEGER;
  expense_id UUID;
  participant_count INTEGER;
  base_amount INTEGER;
  remainder INTEGER;
  position INTEGER := 0;
  participant_record RECORD;
  share_amount INTEGER;
BEGIN
  SELECT * INTO template_record
  FROM public."HouseholdRecurringExpenseTemplate"
  WHERE "id" = p_template_id
  FOR UPDATE;
  IF NOT FOUND OR template_record."status" <> 'ACTIVE'::public."HouseholdRecurringTemplateStatus"
    OR NOT EXISTS (
      SELECT 1 FROM public."Household"
      WHERE "id" = template_record."householdId"
        AND "status" = 'ACTIVE'::public."HouseholdStatus"
    ) THEN
    RETURN NULL;
  END IF;
  last_cycle_day := EXTRACT(DAY FROM (cycle_start + INTERVAL '1 month - 1 day'))::INTEGER;
  cycle_due_date := make_date(
    EXTRACT(YEAR FROM cycle_start)::INTEGER,
    EXTRACT(MONTH FROM cycle_start)::INTEGER,
    LEAST(template_record."dueDay", last_cycle_day)
  );
  IF cycle_due_date < template_record."firstDueDate"
    OR (template_record."endDate" IS NOT NULL AND cycle_due_date > template_record."endDate") THEN
    RETURN NULL;
  END IF;

  INSERT INTO public."HouseholdExpense" (
    "householdId", "createdById", "paidById", "category", "title",
    "description", "amountMinor", "expenseDate", "splitMethod",
    "recurringTemplateId", "billingCycleStart", "dueDate"
  ) VALUES (
    template_record."householdId", template_record."createdById", template_record."paidById",
    template_record."category", template_record."title", template_record."description",
    template_record."amountMinor", cycle_due_date, template_record."splitMethod",
    template_record."id", cycle_start, cycle_due_date
  )
  ON CONFLICT ("recurringTemplateId", "billingCycleStart") DO NOTHING
  RETURNING "id" INTO expense_id;
  IF expense_id IS NULL THEN
    SELECT "id" INTO expense_id FROM public."HouseholdExpense"
    WHERE "recurringTemplateId" = template_record."id"
      AND "billingCycleStart" = cycle_start;
    RETURN expense_id;
  END IF;

  SELECT COUNT(*) INTO participant_count
  FROM public."HouseholdRecurringExpenseParticipant"
  WHERE "templateId" = template_record."id";
  IF participant_count = 0 THEN
    RAISE EXCEPTION 'Recurring template has no participants.' USING ERRCODE = '23514';
  END IF;
  base_amount := template_record."amountMinor" / participant_count;
  remainder := template_record."amountMinor" % participant_count;
  FOR participant_record IN
    SELECT * FROM public."HouseholdRecurringExpenseParticipant"
    WHERE "templateId" = template_record."id"
    ORDER BY "createdAt", "id"
  LOOP
    position := position + 1;
    share_amount := CASE
      WHEN template_record."splitMethod" = 'CUSTOM'::public."HouseholdExpenseSplitMethod"
        THEN participant_record."customAmountMinor"
      ELSE base_amount + CASE WHEN position <= remainder THEN 1 ELSE 0 END
    END;
    INSERT INTO public."HouseholdExpenseShare" (
      "expenseId", "memberId", "creditorId", "shareAmountMinor",
      "settledAmountMinor", "status"
    ) VALUES (
      expense_id, participant_record."memberId",
      CASE WHEN participant_record."memberId" = template_record."paidById"
        THEN NULL ELSE template_record."paidById" END,
      share_amount,
      CASE WHEN participant_record."memberId" = template_record."paidById"
        THEN share_amount ELSE 0 END,
      CASE WHEN participant_record."memberId" = template_record."paidById"
        THEN 'NO_PAYMENT_DUE'::public."HouseholdExpenseShareStatus"
        ELSE 'OUTSTANDING'::public."HouseholdExpenseShareStatus" END
    );
  END LOOP;
  PERFORM nestmate_private.refresh_household_expense_status(expense_id);
  RETURN expense_id;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.generate_recurring_template_cycle(UUID, DATE)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.generate_due_recurring_household_expenses(
  p_as_of_date DATE,
  p_horizon_date DATE,
  p_household_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  template_record RECORD;
  cycle_start DATE;
  cycle_due_date DATE;
  generated_count INTEGER := 0;
  existed BOOLEAN;
BEGIN
  IF p_as_of_date IS NULL OR p_horizon_date IS NULL
    OR p_horizon_date < p_as_of_date
    OR p_horizon_date > p_as_of_date + 62 THEN
    RAISE EXCEPTION 'Recurring generation window is invalid.' USING ERRCODE = '22023';
  END IF;
  FOR template_record IN
    SELECT template.*
    FROM public."HouseholdRecurringExpenseTemplate" AS template
    JOIN public."Household" AS household ON household."id" = template."householdId"
    WHERE template."status" = 'ACTIVE'::public."HouseholdRecurringTemplateStatus"
      AND household."status" = 'ACTIVE'::public."HouseholdStatus"
      AND (p_household_id IS NULL OR template."householdId" = p_household_id)
  LOOP
    FOR cycle_start IN
      SELECT series::DATE
      FROM generate_series(
        date_trunc('month', p_as_of_date)::DATE,
        date_trunc('month', p_horizon_date)::DATE,
        INTERVAL '1 month'
      ) AS series
    LOOP
      cycle_due_date := make_date(
        EXTRACT(YEAR FROM cycle_start)::INTEGER,
        EXTRACT(MONTH FROM cycle_start)::INTEGER,
        LEAST(
          template_record."dueDay",
          EXTRACT(DAY FROM (cycle_start + INTERVAL '1 month - 1 day'))::INTEGER
        )
      );
      IF cycle_due_date <= p_horizon_date
        AND cycle_due_date >= template_record."firstDueDate"
        AND (template_record."endDate" IS NULL OR cycle_due_date <= template_record."endDate") THEN
        SELECT EXISTS (
          SELECT 1 FROM public."HouseholdExpense"
          WHERE "recurringTemplateId" = template_record."id"
            AND "billingCycleStart" = cycle_start
        ) INTO existed;
        PERFORM nestmate_private.generate_recurring_template_cycle(template_record."id", cycle_start);
        IF NOT existed THEN generated_count := generated_count + 1; END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN generated_count;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.generate_due_recurring_household_expenses(
  DATE, DATE, UUID
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.create_recurring_household_expense_internal(
  p_household_id UUID,
  p_paid_by_id TEXT,
  p_category public."HouseholdExpenseCategory",
  p_title TEXT,
  p_description TEXT,
  p_amount_minor INTEGER,
  p_first_due_date DATE,
  p_end_date DATE,
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
  template_id UUID;
  position INTEGER;
  member_count INTEGER := array_length(p_member_ids, 1);
BEGIN
  PERFORM nestmate_private.assert_recurring_household_expense_input(
    p_household_id, p_paid_by_id, p_title, p_description, p_amount_minor,
    p_first_due_date, p_end_date, p_split_method, p_member_ids, p_custom_share_amounts
  );
  INSERT INTO public."HouseholdRecurringExpenseTemplate" (
    "householdId", "createdById", "paidById", "category", "title", "description",
    "amountMinor", "splitMethod", "firstDueDate", "dueDay", "endDate"
  ) VALUES (
    p_household_id, nestmate_private.current_nestmate_user_id(), p_paid_by_id,
    p_category, btrim(p_title), NULLIF(btrim(p_description), ''), p_amount_minor,
    p_split_method, p_first_due_date, EXTRACT(DAY FROM p_first_due_date)::INTEGER, p_end_date
  ) RETURNING "id" INTO template_id;
  FOR position IN 1..member_count LOOP
    INSERT INTO public."HouseholdRecurringExpenseParticipant" (
      "templateId", "memberId", "customAmountMinor"
    ) VALUES (
      template_id, p_member_ids[position],
      CASE WHEN p_split_method = 'CUSTOM'::public."HouseholdExpenseSplitMethod"
        THEN p_custom_share_amounts[position] ELSE NULL END
    );
  END LOOP;
  PERFORM nestmate_private.generate_due_recurring_household_expenses(
    CURRENT_DATE, CURRENT_DATE + 7, p_household_id
  );
  RETURN template_id;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.create_recurring_household_expense_internal(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION nestmate_private.create_recurring_household_expense_internal(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) TO authenticated;

CREATE FUNCTION nestmate_private.update_recurring_household_expense_internal(
  p_template_id UUID,
  p_paid_by_id TEXT,
  p_category public."HouseholdExpenseCategory",
  p_title TEXT,
  p_description TEXT,
  p_amount_minor INTEGER,
  p_first_due_date DATE,
  p_end_date DATE,
  p_split_method public."HouseholdExpenseSplitMethod",
  p_member_ids TEXT[],
  p_custom_share_amounts INTEGER[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  template_record public."HouseholdRecurringExpenseTemplate"%ROWTYPE;
  position INTEGER;
  member_count INTEGER := array_length(p_member_ids, 1);
BEGIN
  SELECT * INTO template_record FROM public."HouseholdRecurringExpenseTemplate"
  WHERE "id" = p_template_id FOR UPDATE;
  IF NOT FOUND OR template_record."status" = 'ENDED'::public."HouseholdRecurringTemplateStatus" THEN
    RAISE EXCEPTION 'Ended recurring templates cannot be edited.' USING ERRCODE = '42501';
  END IF;
  PERFORM nestmate_private.assert_recurring_household_expense_input(
    template_record."householdId", p_paid_by_id, p_title, p_description,
    p_amount_minor, p_first_due_date, p_end_date, p_split_method,
    p_member_ids, p_custom_share_amounts
  );
  UPDATE public."HouseholdRecurringExpenseTemplate"
  SET "paidById" = p_paid_by_id, "category" = p_category,
      "title" = btrim(p_title), "description" = NULLIF(btrim(p_description), ''),
      "amountMinor" = p_amount_minor, "splitMethod" = p_split_method,
      "firstDueDate" = p_first_due_date,
      "dueDay" = EXTRACT(DAY FROM p_first_due_date)::INTEGER,
      "endDate" = p_end_date, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_template_id;
  DELETE FROM public."HouseholdRecurringExpenseParticipant" WHERE "templateId" = p_template_id;
  FOR position IN 1..member_count LOOP
    INSERT INTO public."HouseholdRecurringExpenseParticipant" (
      "templateId", "memberId", "customAmountMinor"
    ) VALUES (
      p_template_id, p_member_ids[position],
      CASE WHEN p_split_method = 'CUSTOM'::public."HouseholdExpenseSplitMethod"
        THEN p_custom_share_amounts[position] ELSE NULL END
    );
  END LOOP;
  IF template_record."status" = 'ACTIVE'::public."HouseholdRecurringTemplateStatus" THEN
    PERFORM nestmate_private.generate_due_recurring_household_expenses(
      CURRENT_DATE, CURRENT_DATE + 7, template_record."householdId"
    );
  END IF;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.update_recurring_household_expense_internal(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION nestmate_private.update_recurring_household_expense_internal(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) TO authenticated;

CREATE FUNCTION nestmate_private.set_recurring_household_expense_status_internal(
  p_template_id UUID,
  p_status public."HouseholdRecurringTemplateStatus"
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE template_record public."HouseholdRecurringExpenseTemplate"%ROWTYPE;
BEGIN
  SELECT * INTO template_record FROM public."HouseholdRecurringExpenseTemplate"
  WHERE "id" = p_template_id FOR UPDATE;
  IF NOT FOUND OR NOT nestmate_private.can_manage_household(template_record."householdId")
    OR template_record."status" = 'ENDED'::public."HouseholdRecurringTemplateStatus"
    OR p_status NOT IN (
      'ACTIVE'::public."HouseholdRecurringTemplateStatus",
      'PAUSED'::public."HouseholdRecurringTemplateStatus",
      'ENDED'::public."HouseholdRecurringTemplateStatus"
    ) THEN
    RAISE EXCEPTION 'This recurring template cannot be changed.' USING ERRCODE = '42501';
  END IF;
  UPDATE public."HouseholdRecurringExpenseTemplate"
  SET "status" = p_status,
      "pausedAt" = CASE WHEN p_status = 'PAUSED'::public."HouseholdRecurringTemplateStatus"
        THEN CURRENT_TIMESTAMP ELSE NULL END,
      "endedAt" = CASE WHEN p_status = 'ENDED'::public."HouseholdRecurringTemplateStatus"
        THEN CURRENT_TIMESTAMP ELSE NULL END,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_template_id;
  IF p_status = 'ACTIVE'::public."HouseholdRecurringTemplateStatus" THEN
    PERFORM nestmate_private.generate_due_recurring_household_expenses(
      CURRENT_DATE, CURRENT_DATE + 7, template_record."householdId"
    );
  END IF;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.set_recurring_household_expense_status_internal(
  UUID, public."HouseholdRecurringTemplateStatus"
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION nestmate_private.set_recurring_household_expense_status_internal(
  UUID, public."HouseholdRecurringTemplateStatus"
) TO authenticated;

CREATE FUNCTION nestmate_private.generate_my_household_recurring_expenses_internal()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE household_record RECORD; generated_count INTEGER := 0;
BEGIN
  IF nestmate_private.current_nestmate_user_id() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  FOR household_record IN
    SELECT household."id"
    FROM public."Household" AS household
    JOIN public."HouseholdMember" AS member ON member."householdId" = household."id"
    WHERE member."userId" = nestmate_private.current_nestmate_user_id()
      AND member."status" = 'ACTIVE'::public."HouseholdMemberStatus"
      AND household."status" = 'ACTIVE'::public."HouseholdStatus"
      AND nestmate_private.can_manage_household(household."id")
  LOOP
    generated_count := generated_count + nestmate_private.generate_due_recurring_household_expenses(
      CURRENT_DATE, CURRENT_DATE + 7, household_record."id"
    );
  END LOOP;
  RETURN generated_count;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.generate_my_household_recurring_expenses_internal()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION nestmate_private.generate_my_household_recurring_expenses_internal()
TO authenticated;

CREATE FUNCTION public.create_recurring_household_expense(
  p_household_id UUID,
  p_paid_by_id TEXT,
  p_category public."HouseholdExpenseCategory",
  p_title TEXT,
  p_description TEXT,
  p_amount_minor INTEGER,
  p_first_due_date DATE,
  p_end_date DATE,
  p_split_method public."HouseholdExpenseSplitMethod",
  p_member_ids TEXT[],
  p_custom_share_amounts INTEGER[] DEFAULT NULL
)
RETURNS UUID LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT nestmate_private.create_recurring_household_expense_internal(
    p_household_id, p_paid_by_id, p_category, p_title, p_description,
    p_amount_minor, p_first_due_date, p_end_date, p_split_method,
    p_member_ids, p_custom_share_amounts
  );
$$;
REVOKE ALL ON FUNCTION public.create_recurring_household_expense(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_recurring_household_expense(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) TO authenticated;

CREATE FUNCTION public.update_recurring_household_expense(
  p_template_id UUID,
  p_paid_by_id TEXT,
  p_category public."HouseholdExpenseCategory",
  p_title TEXT,
  p_description TEXT,
  p_amount_minor INTEGER,
  p_first_due_date DATE,
  p_end_date DATE,
  p_split_method public."HouseholdExpenseSplitMethod",
  p_member_ids TEXT[],
  p_custom_share_amounts INTEGER[] DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT nestmate_private.update_recurring_household_expense_internal(
    p_template_id, p_paid_by_id, p_category, p_title, p_description,
    p_amount_minor, p_first_due_date, p_end_date, p_split_method,
    p_member_ids, p_custom_share_amounts
  );
$$;
REVOKE ALL ON FUNCTION public.update_recurring_household_expense(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_recurring_household_expense(
  UUID, TEXT, public."HouseholdExpenseCategory", TEXT, TEXT, INTEGER, DATE, DATE,
  public."HouseholdExpenseSplitMethod", TEXT[], INTEGER[]
) TO authenticated;

CREATE FUNCTION public.set_recurring_household_expense_status(
  p_template_id UUID,
  p_status public."HouseholdRecurringTemplateStatus"
)
RETURNS BOOLEAN LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT nestmate_private.set_recurring_household_expense_status_internal(p_template_id, p_status);
$$;
REVOKE ALL ON FUNCTION public.set_recurring_household_expense_status(
  UUID, public."HouseholdRecurringTemplateStatus"
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_recurring_household_expense_status(
  UUID, public."HouseholdRecurringTemplateStatus"
) TO authenticated;

CREATE FUNCTION public.generate_my_household_recurring_expenses()
RETURNS INTEGER LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT nestmate_private.generate_my_household_recurring_expenses_internal();
$$;
REVOKE ALL ON FUNCTION public.generate_my_household_recurring_expenses()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_my_household_recurring_expenses()
TO authenticated;

CREATE POLICY "Active members can read recurring household templates"
ON public."HouseholdRecurringExpenseTemplate" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_household("householdId")));
CREATE POLICY "Active members can read recurring template participants"
ON public."HouseholdRecurringExpenseParticipant" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_household((
  SELECT template."householdId"
  FROM public."HouseholdRecurringExpenseTemplate" AS template
  WHERE template."id" = "templateId"
))));

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
SELECT cron.schedule(
  'nestmate-recurring-household-expenses',
  '15 0 * * *',
  'SELECT nestmate_private.generate_due_recurring_household_expenses(CURRENT_DATE, CURRENT_DATE + 7, NULL);'
);
