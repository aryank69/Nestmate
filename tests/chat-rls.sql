-- Rollback-only integration test for NestMate direct-chat authorization.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'chat-a@example.test', '', now(), '{}', '{"full_name":"Chat Test A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'chat-b@example.test', '', now(), '{}', '{"full_name":"Chat Test B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'chat-c@example.test', '', now(), '{}', '{"full_name":"Chat Test C"}', now(), now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);

DO $$
DECLARE
  test_conversation_id UUID;
  duplicate_id UUID;
  spoof_blocked BOOLEAN := FALSE;
BEGIN
  test_conversation_id := public.start_direct_conversation(
    '00000000-0000-4000-8000-0000000000b2'
  );
  duplicate_id := public.start_direct_conversation(
    '00000000-0000-4000-8000-0000000000b2'
  );

  IF test_conversation_id IS NULL OR duplicate_id <> test_conversation_id THEN
    RAISE EXCEPTION 'Conversation creation was not idempotent.';
  END IF;

  PERFORM set_config(
    'nestmate.test_conversation_id',
    test_conversation_id::TEXT,
    true
  );

  IF (SELECT count(*) FROM public."Conversation") <> 1 THEN
    RAISE EXCEPTION 'Participant A could not read the conversation.';
  END IF;

  INSERT INTO public."Message" ("conversationId", "senderId", "body")
  VALUES (
    test_conversation_id,
    '00000000-0000-4000-8000-0000000000a1',
    ' Hello from A '
  );

  IF (
    SELECT "body"
    FROM public."Message"
    WHERE "conversationId" = test_conversation_id
  ) <> 'Hello from A' THEN
    RAISE EXCEPTION 'Message trimming or participant read failed.';
  END IF;

  BEGIN
    INSERT INTO public."Message" ("conversationId", "senderId", "body")
    VALUES (
      test_conversation_id,
      '00000000-0000-4000-8000-0000000000b2',
      'spoofed sender'
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    spoof_blocked := TRUE;
  END;

  IF NOT spoof_blocked THEN
    RAISE EXCEPTION 'Participant A could spoof participant B.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000b2',
  true
);

DO $$
DECLARE
  test_conversation_id UUID :=
    current_setting('nestmate.test_conversation_id')::UUID;
BEGIN
  IF (SELECT count(*) FROM public."Conversation") <> 1 OR
     (SELECT count(*) FROM public."Message") <> 1 THEN
    RAISE EXCEPTION 'Participant B could not read the private history.';
  END IF;

  IF (
    SELECT unread_count
    FROM public.get_my_conversations() AS mine
    WHERE mine.conversation_id = test_conversation_id
  ) <> 1 THEN
    RAISE EXCEPTION 'Participant B unread count was incorrect.';
  END IF;

  PERFORM public.mark_conversation_read(test_conversation_id);

  IF (
    SELECT unread_count
    FROM public.get_my_conversations() AS mine
    WHERE mine.conversation_id = test_conversation_id
  ) <> 0 THEN
    RAISE EXCEPTION 'Participant B read state was not cleared.';
  END IF;

  INSERT INTO public."Message" ("conversationId", "senderId", "body")
  VALUES (
    test_conversation_id,
    '00000000-0000-4000-8000-0000000000b2',
    'Reply from B'
  );
END;
$$;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000a1',
  true
);

DO $$
DECLARE
  test_conversation_id UUID :=
    current_setting('nestmate.test_conversation_id')::UUID;
BEGIN
  IF (SELECT count(*) FROM public."Message") <> 2 THEN
    RAISE EXCEPTION 'Participant A did not receive the reply.';
  END IF;

  IF (
    SELECT unread_count
    FROM public.get_my_conversations() AS mine
    WHERE mine.conversation_id = test_conversation_id
  ) <> 1 THEN
    RAISE EXCEPTION 'Participant A unread count was incorrect.';
  END IF;

  PERFORM public.mark_conversation_read(test_conversation_id);

  IF (
    SELECT unread_count
    FROM public.get_my_conversations() AS mine
    WHERE mine.conversation_id = test_conversation_id
  ) <> 0 THEN
    RAISE EXCEPTION 'Participant A read state was not cleared.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000c3',
  true
);

DO $$
DECLARE
  test_conversation_id UUID :=
    current_setting('nestmate.test_conversation_id')::UUID;
  send_blocked BOOLEAN := FALSE;
  read_update_blocked BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."Conversation") <> 0 OR
     (SELECT count(*) FROM public."Message") <> 0 OR
     (SELECT count(*) FROM public.get_my_conversations()) <> 0 THEN
    RAISE EXCEPTION 'Non-participant C could read private chat data.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.list_chat_users()
    WHERE auth_user_id = '00000000-0000-4000-8000-0000000000a1'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.list_chat_users()
    WHERE auth_user_id = '00000000-0000-4000-8000-0000000000b2'
  ) THEN
    RAISE EXCEPTION 'Authenticated chat directory omitted test users.';
  END IF;

  BEGIN
    INSERT INTO public."Message" ("conversationId", "senderId", "body")
    VALUES (
      test_conversation_id,
      '00000000-0000-4000-8000-0000000000c3',
      'intrusion'
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    send_blocked := TRUE;
  END;

  IF NOT send_blocked THEN
    RAISE EXCEPTION 'Non-participant C could send a message.';
  END IF;

  BEGIN
    PERFORM public.mark_conversation_read(test_conversation_id);
  EXCEPTION WHEN insufficient_privilege THEN
    read_update_blocked := TRUE;
  END;

  IF NOT read_update_blocked THEN
    RAISE EXCEPTION 'Non-participant C could change read state.';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
