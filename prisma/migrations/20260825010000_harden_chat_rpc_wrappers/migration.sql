-- Keep all privileged chat logic outside the exposed public API schema.
CREATE OR REPLACE FUNCTION nestmate_private.list_chat_users()
RETURNS TABLE (
  auth_user_id UUID,
  display_name TEXT,
  profession TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    nestmate_user."authUserId",
    nestmate_user."name",
    nestmate_user."profession"
  FROM public."User" AS nestmate_user
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND nestmate_user."authUserId" <> (SELECT auth.uid())
  ORDER BY nestmate_user."name"
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION nestmate_private.start_direct_conversation(
  other_auth_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_auth_user_id UUID := (SELECT auth.uid());
  current_user_id TEXT;
  other_user_id TEXT;
  first_user_id TEXT;
  second_user_id TEXT;
  conversation_id UUID;
BEGIN
  IF current_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  IF other_auth_user_id IS NULL OR other_auth_user_id = current_auth_user_id THEN
    RAISE EXCEPTION 'Choose another NestMate user.' USING ERRCODE = '22023';
  END IF;

  SELECT "id" INTO current_user_id
  FROM public."User"
  WHERE "authUserId" = current_auth_user_id;

  SELECT "id" INTO other_user_id
  FROM public."User"
  WHERE "authUserId" = other_auth_user_id;

  IF current_user_id IS NULL OR other_user_id IS NULL THEN
    RAISE EXCEPTION 'Both participants need NestMate profiles.'
      USING ERRCODE = '22023';
  END IF;

  first_user_id := LEAST(current_user_id, other_user_id);
  second_user_id := GREATEST(current_user_id, other_user_id);

  INSERT INTO public."Conversation" (
    "participantOneId",
    "participantTwoId"
  )
  VALUES (first_user_id, second_user_id)
  ON CONFLICT ("participantOneId", "participantTwoId") DO NOTHING
  RETURNING "id" INTO conversation_id;

  IF conversation_id IS NULL THEN
    SELECT "id" INTO conversation_id
    FROM public."Conversation"
    WHERE "participantOneId" = first_user_id
      AND "participantTwoId" = second_user_id;
  END IF;

  RETURN conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION nestmate_private.get_my_conversations()
RETURNS TABLE (
  conversation_id UUID,
  other_auth_user_id UUID,
  other_name TEXT,
  other_profession TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH current_nestmate_user AS (
    SELECT nestmate_user."id"
    FROM public."User" AS nestmate_user
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND nestmate_user."authUserId" = (SELECT auth.uid())
    LIMIT 1
  )
  SELECT
    conversation."id",
    other_user."authUserId",
    other_user."name",
    other_user."profession",
    latest_message."body",
    COALESCE(
      latest_message."createdAt",
      conversation."lastMessageAt",
      conversation."createdAt"
    ),
    (
      SELECT count(*)
      FROM public."Message" AS unread_message
      WHERE unread_message."conversationId" = conversation."id"
        AND unread_message."senderId" <> current_nestmate_user."id"
        AND unread_message."createdAt" > COALESCE(
          CASE
            WHEN conversation."participantOneId" = current_nestmate_user."id"
              THEN conversation."participantOneLastReadAt"
            ELSE conversation."participantTwoLastReadAt"
          END,
          '-infinity'::TIMESTAMPTZ
        )
    )
  FROM current_nestmate_user
  JOIN public."Conversation" AS conversation
    ON current_nestmate_user."id" IN (
      conversation."participantOneId",
      conversation."participantTwoId"
    )
  JOIN public."User" AS other_user
    ON other_user."id" = CASE
      WHEN conversation."participantOneId" = current_nestmate_user."id"
        THEN conversation."participantTwoId"
      ELSE conversation."participantOneId"
    END
  LEFT JOIN LATERAL (
    SELECT message."body", message."createdAt"
    FROM public."Message" AS message
    WHERE message."conversationId" = conversation."id"
    ORDER BY message."createdAt" DESC, message."id" DESC
    LIMIT 1
  ) AS latest_message ON TRUE
  ORDER BY COALESCE(
    latest_message."createdAt",
    conversation."lastMessageAt",
    conversation."createdAt"
  ) DESC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION nestmate_private.mark_conversation_read(
  target_conversation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT;
  affected_rows INTEGER;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT "id" INTO current_user_id
  FROM public."User"
  WHERE "authUserId" = (SELECT auth.uid());

  UPDATE public."Conversation"
  SET
    "participantOneLastReadAt" = CASE
      WHEN "participantOneId" = current_user_id THEN CURRENT_TIMESTAMP
      ELSE "participantOneLastReadAt"
    END,
    "participantTwoLastReadAt" = CASE
      WHEN "participantTwoId" = current_user_id THEN CURRENT_TIMESTAMP
      ELSE "participantTwoLastReadAt"
    END
  WHERE "id" = target_conversation_id
    AND current_user_id IN ("participantOneId", "participantTwoId");

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows = 0 THEN
    RAISE EXCEPTION 'Conversation not found.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.list_chat_users()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.start_direct_conversation(UUID)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.get_my_conversations()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.mark_conversation_read(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION nestmate_private.list_chat_users()
TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.start_direct_conversation(UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.get_my_conversations()
TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.mark_conversation_read(UUID)
TO authenticated;

-- Public RPCs run with caller privileges and delegate to the private helpers.
CREATE OR REPLACE FUNCTION public.list_chat_users()
RETURNS TABLE (
  auth_user_id UUID,
  display_name TEXT,
  profession TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM nestmate_private.list_chat_users();
$$;

CREATE OR REPLACE FUNCTION public.start_direct_conversation(
  other_auth_user_id UUID
)
RETURNS UUID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nestmate_private.start_direct_conversation(other_auth_user_id);
$$;

CREATE OR REPLACE FUNCTION public.get_my_conversations()
RETURNS TABLE (
  conversation_id UUID,
  other_auth_user_id UUID,
  other_name TEXT,
  other_profession TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM nestmate_private.get_my_conversations();
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(
  target_conversation_id UUID
)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nestmate_private.mark_conversation_read(target_conversation_id);
$$;

REVOKE ALL ON FUNCTION public.list_chat_users()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_direct_conversation(UUID)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_conversations()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_conversation_read(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_chat_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_direct_conversation(UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_conversations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID)
TO authenticated;
