ALTER TYPE public."NotificationType" ADD VALUE IF NOT EXISTS 'HOUSEHOLD_BILL';

-- PostgreSQL treats NULL actor IDs as distinct in the original notification
-- constraint. System notifications need their own idempotency key.
CREATE UNIQUE INDEX "Notification_system_dedupe_idx"
ON public."Notification"("recipientId", "type", "resourceId")
WHERE "actorId" IS NULL;

DROP POLICY "Active members can read household settlement history"
ON public."HouseholdSettlement";

CREATE POLICY "Settlement participants can read household settlement history"
ON public."HouseholdSettlement" FOR SELECT TO authenticated
USING (
  (SELECT nestmate_private.can_access_household((
    SELECT expense."householdId"
    FROM public."HouseholdExpenseShare" AS share
    JOIN public."HouseholdExpense" AS expense ON expense."id" = share."expenseId"
    WHERE share."id" = "expenseShareId"
  )))
  AND (
    "fromUserId" = (SELECT nestmate_private.current_nestmate_user_id())
    OR "toUserId" = (SELECT nestmate_private.current_nestmate_user_id())
  )
);

CREATE FUNCTION nestmate_private.generate_household_bill_notifications(
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  IF p_as_of_date IS NULL THEN
    RAISE EXCEPTION 'A reminder date is required.' USING ERRCODE = '22023';
  END IF;

  WITH eligible_shares AS (
    SELECT
      share."id" AS share_id,
      share."memberId" AS recipient_id,
      expense."id" AS expense_id,
      expense."title" AS expense_title,
      expense."dueDate" AS due_date
    FROM public."HouseholdExpenseShare" AS share
    JOIN public."HouseholdExpense" AS expense
      ON expense."id" = share."expenseId"
    JOIN public."Household" AS household
      ON household."id" = expense."householdId"
    JOIN public."HouseholdMember" AS membership
      ON membership."householdId" = household."id"
      AND membership."userId" = share."memberId"
      AND membership."status" = 'ACTIVE'::public."HouseholdMemberStatus"
    WHERE household."status" = 'ACTIVE'::public."HouseholdStatus"
      AND expense."dueDate" IS NOT NULL
      AND share."creditorId" IS NOT NULL
      AND share."status" IN (
        'OUTSTANDING'::public."HouseholdExpenseShareStatus",
        'PARTIALLY_SETTLED'::public."HouseholdExpenseShareStatus"
      )
      AND share."settledAmountMinor" < share."shareAmountMinor"
      AND nestmate_private.is_user_content_visible(share."memberId")
      AND nestmate_private.is_user_content_visible(share."creditorId")
      AND NOT EXISTS (
        SELECT 1
        FROM public."UserBlock" AS user_block
        WHERE (
          user_block."blockerId" = share."memberId"
          AND user_block."blockedId" = share."creditorId"
        ) OR (
          user_block."blockerId" = share."creditorId"
          AND user_block."blockedId" = share."memberId"
        )
      )
  ), reminder_candidates AS (
    SELECT
      eligible.share_id,
      eligible.recipient_id,
      eligible.expense_id,
      eligible.expense_title,
      'UPCOMING'::TEXT AS reminder_state,
      'Bill due soon'::TEXT AS reminder_title,
      'Your share for “' || eligible.expense_title || '” is due in the next 3 days.' AS reminder_body
    FROM eligible_shares AS eligible
    WHERE eligible.due_date > p_as_of_date
      AND eligible.due_date <= p_as_of_date + 3

    UNION ALL

    SELECT
      eligible.share_id,
      eligible.recipient_id,
      eligible.expense_id,
      eligible.expense_title,
      'DUE_TODAY'::TEXT,
      'Bill due today'::TEXT,
      'Your share for “' || eligible.expense_title || '” is due today.'
    FROM eligible_shares AS eligible
    WHERE eligible.due_date = p_as_of_date

    UNION ALL

    SELECT
      eligible.share_id,
      eligible.recipient_id,
      eligible.expense_id,
      eligible.expense_title,
      'OVERDUE'::TEXT,
      'Bill overdue'::TEXT,
      'Your share for “' || eligible.expense_title || '” is overdue.'
    FROM eligible_shares AS eligible
    WHERE eligible.due_date < p_as_of_date
  )
  INSERT INTO public."Notification" (
    "recipientId",
    "actorId",
    "type",
    "title",
    "body",
    "href",
    "resourceId"
  )
  SELECT
    candidate.recipient_id,
    NULL,
    'HOUSEHOLD_BILL'::public."NotificationType",
    candidate.reminder_title,
    candidate.reminder_body,
    '/household#expense-' || candidate.expense_id::TEXT,
    candidate.share_id::TEXT || ':' || candidate.reminder_state
  FROM reminder_candidates AS candidate
  ON CONFLICT ("recipientId", "type", "resourceId")
    WHERE "actorId" IS NULL
  DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.generate_household_bill_notifications(DATE)
FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'nestmate-household-bill-reminders',
  '30 0 * * *',
  'SELECT nestmate_private.generate_household_bill_notifications(CURRENT_DATE);'
);
