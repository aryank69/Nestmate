-- Rollback-only integration test for notification generation and recipient RLS.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'notify-a@example.test', '', now(), '{}', '{"full_name":"Notify A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'notify-b@example.test', '', now(), '{}', '{"full_name":"Notify B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'notify-c@example.test', '', now(), '{}', '{"full_name":"Notify C"}', now(), now());

SELECT set_config(
  'nestmate.notify_user_a',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '30000000-0000-4000-8000-0000000000a1'),
  true
);
SELECT set_config(
  'nestmate.notify_user_b',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '30000000-0000-4000-8000-0000000000b2'),
  true
);
SELECT set_config(
  'nestmate.notify_community',
  (SELECT "id" FROM public."Community" WHERE "isActive" = TRUE ORDER BY "createdAt", "id" LIMIT 1),
  true
);

INSERT INTO public."CommunityMember" ("userId", "communityId", "role", "joinedAt")
VALUES
  (current_setting('nestmate.notify_user_a'), current_setting('nestmate.notify_community'), 'MEMBER'::public."CommunityRole", now()),
  (current_setting('nestmate.notify_user_b'), current_setting('nestmate.notify_community'), 'MEMBER'::public."CommunityRole", now());

INSERT INTO public."Post" (
  "id", "type", "status", "title", "description", "currency",
  "genderPreference", "amenities", "tags", "authorId", "communityId",
  "createdAt", "updatedAt", "publishedAt"
) VALUES (
  'notification-post-test',
  'ROOM_AVAILABLE'::public."PostType",
  'ACTIVE'::public."PostStatus",
  'Notification test room',
  'A structured post used only inside this rollback-only test.',
  'INR',
  'ANY'::public."GenderPreference",
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  current_setting('nestmate.notify_user_b'),
  current_setting('nestmate.notify_community'),
  now(),
  now(),
  now()
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);

DO $$
DECLARE
  conversation_id UUID;
  community_message_id UUID;
BEGIN
  conversation_id := public.start_direct_conversation(
    '30000000-0000-4000-8000-0000000000b2',
    'notification-post-test'
  );

  INSERT INTO public."Message" ("conversationId", "senderId", "body")
  VALUES (
    conversation_id,
    current_setting('nestmate.notify_user_a'),
    'Hello from private chat'
  );

  INSERT INTO public."CommunityMessage" (
    "communityId", "senderId", "body"
  ) VALUES (
    current_setting('nestmate.notify_community'),
    current_setting('nestmate.notify_user_a'),
    '@Notify B can you review this room?'
  )
  RETURNING "id" INTO community_message_id;

  PERFORM set_config(
    'nestmate.notify_community_message',
    community_message_id::TEXT,
    true
  );

  IF (SELECT count(*) FROM public."Notification") <> 0 THEN
    RAISE EXCEPTION 'An actor could read notifications created for another user.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-0000000000b2","role":"authenticated"}',
  true
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public."Notification") <> 3 THEN
    RAISE EXCEPTION 'Private-message, mention, or post-activity notification was missing.';
  END IF;

  UPDATE public."Notification"
  SET "readAt" = now()
  WHERE "readAt" IS NULL;

  IF EXISTS (
    SELECT 1 FROM public."Notification" WHERE "readAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'Recipient could not mark notifications read.';
  END IF;

  INSERT INTO public."CommunityMessage" (
    "communityId", "senderId", "replyToId", "body"
  ) VALUES (
    current_setting('nestmate.notify_community'),
    current_setting('nestmate.notify_user_b'),
    current_setting('nestmate.notify_community_message')::UUID,
    'Yes, I will take a look.'
  );
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public."Notification"
    WHERE "type" = 'COMMUNITY_REPLY'::public."NotificationType"
  ) THEN
    RAISE EXCEPTION 'Structured community reply notification was missing.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-0000000000b2","role":"authenticated"}',
  true
);

INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (
  current_setting('nestmate.notify_user_b'),
  current_setting('nestmate.notify_user_a')
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public."Notification") <> 0 THEN
    RAISE EXCEPTION 'Notifications from a blocked actor remained visible.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-0000000000c3","role":"authenticated"}',
  true
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public."Notification") <> 0 THEN
    RAISE EXCEPTION 'A third party could read another recipient notification.';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
