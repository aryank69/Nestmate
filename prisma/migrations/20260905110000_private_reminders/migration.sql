CREATE TYPE public."ReminderKind" AS ENUM (
  'UPCOMING_VISIT',
  'CHAT_FOLLOW_UP',
  'SHORTLIST_IDLE',
  'MOVE_IN_APPROACHING'
);

CREATE TYPE public."ReminderTargetType" AS ENUM (
  'VISIT',
  'CONVERSATION',
  'LISTING',
  'FLATMATE'
);

CREATE TABLE public."Reminder" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "reminderKey" VARCHAR(240) NOT NULL,
  "kind" public."ReminderKind" NOT NULL,
  "targetType" public."ReminderTargetType" NOT NULL,
  "targetId" VARCHAR(128) NOT NULL,
  "title" VARCHAR(140) NOT NULL,
  "description" VARCHAR(300),
  "href" VARCHAR(500) NOT NULL,
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "sourceUpdatedAt" TIMESTAMPTZ(3) NOT NULL,
  "snoozedUntil" TIMESTAMPTZ(3),
  "dismissedAt" TIMESTAMPTZ(3),
  "inactiveAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Reminder_key_check"
    CHECK (char_length(btrim("reminderKey")) BETWEEN 1 AND 240),
  CONSTRAINT "Reminder_target_check"
    CHECK (char_length(btrim("targetId")) BETWEEN 1 AND 128),
  CONSTRAINT "Reminder_title_check"
    CHECK (char_length(btrim("title")) BETWEEN 1 AND 140),
  CONSTRAINT "Reminder_description_check"
    CHECK ("description" IS NULL OR char_length(btrim("description")) BETWEEN 1 AND 300),
  CONSTRAINT "Reminder_href_check"
    CHECK (char_length(btrim("href")) BETWEEN 1 AND 500 AND left("href", 1) = '/'),
  CONSTRAINT "Reminder_state_check"
    CHECK ("dismissedAt" IS NULL OR "snoozedUntil" IS NULL)
);

CREATE UNIQUE INDEX "Reminder_userId_reminderKey_key"
ON public."Reminder"("userId", "reminderKey");
CREATE INDEX "Reminder_userId_inactiveAt_dismissedAt_snoozedUntil_dueAt_idx"
ON public."Reminder"("userId", "inactiveAt", "dismissedAt", "snoozedUntil", "dueAt");
CREATE INDEX "Reminder_userId_kind_updatedAt_idx"
ON public."Reminder"("userId", "kind", "updatedAt" DESC);

ALTER TABLE public."Reminder" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."Reminder"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."Reminder" TO authenticated;
GRANT UPDATE ("dismissedAt", "snoozedUntil", "updatedAt")
ON TABLE public."Reminder" TO authenticated;
GRANT USAGE ON TYPE public."ReminderKind", public."ReminderTargetType"
TO authenticated;

CREATE POLICY "Users can read their own reminders"
ON public."Reminder"
FOR SELECT
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
);

CREATE POLICY "Users can update their own reminder state"
ON public."Reminder"
FOR UPDATE
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
)
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
);
