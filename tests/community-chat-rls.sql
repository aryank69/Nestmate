-- Rollback-only integration test for locality group-chat authorization.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'room-chat-a@example.test', '', now(), '{}', '{"full_name":"Room Chat A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'room-chat-b@example.test', '', now(), '{}', '{"full_name":"Room Chat B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'room-chat-c@example.test', '', now(), '{}', '{"full_name":"Room Chat C"}', now(), now());

SELECT set_config(
  'nestmate.test_community_id',
  (SELECT "id" FROM public."Community" WHERE "isActive" = TRUE ORDER BY "createdAt", "id" LIMIT 1),
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);

INSERT INTO public."CommunityMember" ("userId", "communityId", "role", "joinedAt")
SELECT "id", current_setting('nestmate.test_community_id'), 'MEMBER'::public."CommunityRole", now()
FROM public."User"
WHERE "authUserId" = (SELECT auth.uid());

DO $$
DECLARE
  sender_id TEXT;
  test_message_id UUID;
BEGIN
  SELECT "id" INTO sender_id
  FROM public."User"
  WHERE "authUserId" = (SELECT auth.uid());

  INSERT INTO public."CommunityMessage" ("communityId", "senderId", "body")
  VALUES (
    current_setting('nestmate.test_community_id'),
    sender_id,
    '  Hello locality members  '
  )
  RETURNING "id" INTO test_message_id;

  PERFORM set_config('nestmate.test_community_message_id', test_message_id::TEXT, true);

  IF (
    SELECT "body"
    FROM public."CommunityMessage"
    WHERE "id" = test_message_id
  ) <> 'Hello locality members' THEN
    RAISE EXCEPTION 'Message trimming or member read failed.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-0000000000b2","role":"authenticated"}',
  true
);

INSERT INTO public."CommunityMember" ("userId", "communityId", "role", "joinedAt")
SELECT "id", current_setting('nestmate.test_community_id'), 'MEMBER'::public."CommunityRole", now()
FROM public."User"
WHERE "authUserId" = (SELECT auth.uid());

DO $$
DECLARE
  returned_name TEXT;
BEGIN
  IF (SELECT count(*) FROM public."CommunityMessage") <> 1 THEN
    RAISE EXCEPTION 'A second locality member could not read the group history.';
  END IF;

  SELECT sender_name INTO returned_name
  FROM public.get_community_chat_messages(
    current_setting('nestmate.test_community_id'),
    current_setting('nestmate.test_community_message_id')::UUID
  );

  IF returned_name <> 'Room Chat A' THEN
    RAISE EXCEPTION 'Safe sender profile hydration failed.';
  END IF;

  PERFORM public.mark_community_chat_read(
    current_setting('nestmate.test_community_id')
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public."CommunityMember"
    WHERE "communityId" = current_setting('nestmate.test_community_id')
      AND "lastChatReadAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The locality chat read cursor was not stored.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-0000000000c3","role":"authenticated"}',
  true
);

DO $$
DECLARE
  outsider_id TEXT;
  send_blocked BOOLEAN := FALSE;
  history_blocked BOOLEAN := FALSE;
  read_blocked BOOLEAN := FALSE;
BEGIN
  SELECT "id" INTO outsider_id
  FROM public."User"
  WHERE "authUserId" = (SELECT auth.uid());

  IF (SELECT count(*) FROM public."CommunityMessage") <> 0 THEN
    RAISE EXCEPTION 'A non-member could read locality chat rows.';
  END IF;

  BEGIN
    INSERT INTO public."CommunityMessage" ("communityId", "senderId", "body")
    VALUES (
      current_setting('nestmate.test_community_id'),
      outsider_id,
      'intrusion'
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    send_blocked := TRUE;
  END;

  BEGIN
    PERFORM *
    FROM public.get_community_chat_messages(
      current_setting('nestmate.test_community_id'),
      NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN
    history_blocked := TRUE;
  END;

  BEGIN
    PERFORM public.mark_community_chat_read(
      current_setting('nestmate.test_community_id')
    );
  EXCEPTION WHEN insufficient_privilege THEN
    read_blocked := TRUE;
  END;

  IF NOT send_blocked OR NOT history_blocked OR NOT read_blocked THEN
    RAISE EXCEPTION 'A non-member retained locality chat access.';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
