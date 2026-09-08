-- Rollback-only integration test for private reminder ownership and state updates.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '52000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'reminder-a@example.test', '', now(), '{}', '{"full_name":"Reminder A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '52000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'reminder-b@example.test', '', now(), '{}', '{"full_name":"Reminder B"}', now(), now());

SELECT set_config('nestmate.reminder_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '52000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.reminder_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '52000000-0000-4000-8000-0000000000b2'), true);

INSERT INTO public."Reminder" (
  "userId", "reminderKey", "kind", "targetType", "targetId",
  "title", "description", "href", "dueAt", "sourceUpdatedAt", "updatedAt"
) VALUES
  (current_setting('nestmate.reminder_a'), 'CHAT_FOLLOW_UP:CONVERSATION:test-a', 'CHAT_FOLLOW_UP', 'CONVERSATION', 'test-a', 'Follow up safely', 'No message content is stored.', '/chat?conversation=test-a', now() + interval '1 day', now(), now()),
  (current_setting('nestmate.reminder_b'), 'SHORTLIST_IDLE:FLATMATE:test-b', 'SHORTLIST_IDLE', 'FLATMATE', 'test-b', 'Review shortlist', 'No private profile data is stored.', '/flatmates/test-b', now() + interval '1 day', now(), now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '52000000-0000-4000-8000-0000000000a1', true);

DO $$
DECLARE
  insert_denied BOOLEAN := FALSE;
  delete_denied BOOLEAN := FALSE;
  owner_swap_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."Reminder") <> 1 THEN
    RAISE EXCEPTION 'The owner could not read exactly their own reminder.';
  END IF;
  BEGIN
    INSERT INTO public."Reminder" (
      "userId", "reminderKey", "kind", "targetType", "targetId",
      "title", "href", "dueAt", "sourceUpdatedAt"
    ) VALUES (
      current_setting('nestmate.reminder_a'), 'forbidden', 'UPCOMING_VISIT',
      'VISIT', 'forbidden', 'Forbidden insert', '/visits', now(), now()
    );
  EXCEPTION WHEN insufficient_privilege THEN insert_denied := TRUE;
  END;
  BEGIN
    DELETE FROM public."Reminder";
  EXCEPTION WHEN insufficient_privilege THEN delete_denied := TRUE;
  END;
  BEGIN
    UPDATE public."Reminder"
    SET "userId" = current_setting('nestmate.reminder_b');
  EXCEPTION WHEN insufficient_privilege THEN owner_swap_denied := TRUE;
  END;
  IF NOT insert_denied OR NOT delete_denied OR NOT owner_swap_denied THEN
    RAISE EXCEPTION 'Reminder privileges allowed a protected mutation.';
  END IF;
END;
$$;

UPDATE public."Reminder"
SET "snoozedUntil" = now() + interval '3 days', "updatedAt" = now()
WHERE "userId" = current_setting('nestmate.reminder_a');
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Reminder"
    WHERE "userId" = current_setting('nestmate.reminder_a')
      AND "snoozedUntil" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The owner could not snooze their reminder.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '52000000-0000-4000-8000-0000000000b2', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public."Reminder") <> 1 THEN
    RAISE EXCEPTION 'The second user could not read exactly their own reminder.';
  END IF;
  UPDATE public."Reminder"
  SET "dismissedAt" = now(), "updatedAt" = now()
  WHERE "userId" = current_setting('nestmate.reminder_a');
  IF FOUND THEN
    RAISE EXCEPTION 'Another user could dismiss the owner reminder.';
  END IF;
END;
$$;

ROLLBACK;
