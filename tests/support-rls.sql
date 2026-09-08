-- Rollback-only integration test for support ownership, moderator access,
-- private notes, audited status changes, and user notifications.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '49000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'support-mod@example.test', '', now(), '{}', '{"full_name":"Support Moderator"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '49000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'support-owner@example.test', '', now(), '{}', '{"full_name":"Support Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '49000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'support-outsider@example.test', '', now(), '{}', '{"full_name":"Support Outsider"}', now(), now());

SELECT set_config('nestmate.support_mod', (SELECT "id" FROM public."User" WHERE "authUserId" = '49000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.support_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '49000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.support_outsider', (SELECT "id" FROM public."User" WHERE "authUserId" = '49000000-0000-4000-8000-0000000000c3'), true);

INSERT INTO public."ModeratorMembership" ("userId", "role")
VALUES (current_setting('nestmate.support_mod'), 'MODERATOR'::public."ModeratorRole");

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"49000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-0000000000b2', true);

INSERT INTO public."SupportCase" (
  "id", "userId", "category", "subject", "description", "reference"
) VALUES (
  '49000000-0000-4000-8000-000000000101',
  current_setting('nestmate.support_owner'),
  'RESTRICTION_APPEAL'::public."SupportCaseCategory",
  'Please review my account restriction',
  'I would like the safety team to review the context around this restriction.',
  'Account restriction shown today'
);
INSERT INTO public."SupportCaseMessage" (
  "id", "caseId", "senderId", "senderRole", "body"
) VALUES (
  '49000000-0000-4000-8000-000000000102',
  '49000000-0000-4000-8000-000000000101',
  current_setting('nestmate.support_owner'),
  'USER'::public."SupportMessageRole",
  'This is additional context for my private appeal.'
);

DO $$
DECLARE
  update_denied BOOLEAN := FALSE;
  note_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."SupportCase") <> 1
    OR (SELECT count(*) FROM public."SupportCaseMessage") <> 1 THEN
    RAISE EXCEPTION 'The owner could not read their case and message.';
  END IF;
  IF EXISTS (SELECT 1 FROM public."SupportCaseInternalNote") THEN
    RAISE EXCEPTION 'Internal notes were exposed to the case owner.';
  END IF;
  BEGIN
    UPDATE public."SupportCase"
    SET "status" = 'RESOLVED'::public."SupportCaseStatus"
    WHERE "id" = '49000000-0000-4000-8000-000000000101';
  EXCEPTION WHEN insufficient_privilege THEN
    update_denied := TRUE;
  END;
  IF NOT update_denied THEN
    RAISE EXCEPTION 'The owner directly changed a protected case status.';
  END IF;
  BEGIN
    INSERT INTO public."SupportCaseInternalNote" ("caseId", "moderatorId", "body")
    VALUES ('49000000-0000-4000-8000-000000000101', current_setting('nestmate.support_owner'), 'Leaked internal note');
  EXCEPTION WHEN insufficient_privilege THEN
    note_denied := TRUE;
  END;
  IF NOT note_denied THEN
    RAISE EXCEPTION 'The owner inserted an internal moderator note.';
  END IF;
END;
$$;

-- Unrelated users cannot discover or reply to the case.
SELECT set_config('request.jwt.claims', '{"sub":"49000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE
  reply_denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."SupportCase")
    OR EXISTS (SELECT 1 FROM public."SupportCaseMessage")
    OR EXISTS (SELECT 1 FROM public."SupportCaseInternalNote") THEN
    RAISE EXCEPTION 'Support case data leaked to an unrelated user.';
  END IF;
  BEGIN
    INSERT INTO public."SupportCaseMessage" ("caseId", "senderId", "senderRole", "body")
    VALUES ('49000000-0000-4000-8000-000000000101', current_setting('nestmate.support_outsider'), 'USER'::public."SupportMessageRole", 'Unauthorized reply');
  EXCEPTION WHEN insufficient_privilege THEN
    reply_denied := TRUE;
  END;
  IF NOT reply_denied THEN
    RAISE EXCEPTION 'An unrelated user replied to the case.';
  END IF;
END;
$$;

-- Authorized moderators can review and update cases only through the audited RPC.
SELECT set_config('request.jwt.claims', '{"sub":"49000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-0000000000a1', true);
SELECT public.manage_support_case(
  '49000000-0000-4000-8000-000000000101',
  'UNDER_REVIEW',
  'We are reviewing your appeal and will update this case here.',
  'Check the related restriction audit before making a final decision.'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."SupportCase"
    WHERE "id" = '49000000-0000-4000-8000-000000000101'
      AND "status" = 'UNDER_REVIEW'::public."SupportCaseStatus"
  ) THEN
    RAISE EXCEPTION 'The moderator status update was not recorded.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."SupportCaseInternalNote"
    WHERE "caseId" = '49000000-0000-4000-8000-000000000101'
      AND "body" ILIKE '%restriction audit%'
  ) THEN
    RAISE EXCEPTION 'The moderator-only note was not stored.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."ModerationAuditLog"
    WHERE "queueType" = 'SUPPORT_CASE'::public."ModerationQueueType"
      AND "action" = 'SUPPORT_CASE_UPDATE'::public."ModerationActionType"
      AND "queueId" = '49000000-0000-4000-8000-000000000101'
  ) THEN
    RAISE EXCEPTION 'The case update was not audited.';
  END IF;
END;
$$;

-- The owner sees the response and privacy-safe notification, never the note/audit.
SELECT set_config('request.jwt.claims', '{"sub":"49000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-0000000000b2', true);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."SupportCaseMessage"
    WHERE "caseId" = '49000000-0000-4000-8000-000000000101'
      AND "senderRole" = 'MODERATOR'::public."SupportMessageRole"
  ) THEN
    RAISE EXCEPTION 'The owner could not read the moderator response.';
  END IF;
  IF EXISTS (SELECT 1 FROM public."SupportCaseInternalNote")
    OR EXISTS (
      SELECT 1 FROM public."ModerationAuditLog"
      WHERE "queueType" = 'SUPPORT_CASE'::public."ModerationQueueType"
    ) THEN
    RAISE EXCEPTION 'Private moderator context leaked to the owner.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."Notification"
    WHERE "type" = 'SUPPORT_CASE_UPDATE'::public."NotificationType"
      AND "href" = '/support/49000000-0000-4000-8000-000000000101'
      AND "body" NOT ILIKE '%restriction audit%'
  ) THEN
    RAISE EXCEPTION 'The owner did not receive a privacy-safe case notification.';
  END IF;
END;
$$;

ROLLBACK;
