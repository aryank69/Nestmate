-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "participantOneId" TEXT NOT NULL,
    "participantTwoId" TEXT NOT NULL,
    "participantOneLastReadAt" TIMESTAMPTZ(3),
    "participantTwoLastReadAt" TIMESTAMPTZ(3),
    "lastMessageAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Conversation_distinct_participants_check"
      CHECK ("participantOneId" < "participantTwoId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Message_body_length_check"
      CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000)
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_participantOneId_participantTwoId_key"
ON "Conversation"("participantOneId", "participantTwoId");

-- CreateIndex
CREATE INDEX "Conversation_participantOneId_lastMessageAt_idx"
ON "Conversation"("participantOneId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Conversation_participantTwoId_lastMessageAt_idx"
ON "Conversation"("participantTwoId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_id_idx"
ON "Message"("conversationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- AddForeignKey
ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_participantOneId_fkey"
FOREIGN KEY ("participantOneId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_participantTwoId_fkey"
FOREIGN KEY ("participantTwoId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message"
ADD CONSTRAINT "Message_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message"
ADD CONSTRAINT "Message_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep authorization helpers outside the exposed public schema.
CREATE SCHEMA IF NOT EXISTS nestmate_private;
REVOKE ALL ON SCHEMA nestmate_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA nestmate_private TO authenticated;

CREATE OR REPLACE FUNCTION nestmate_private.current_nestmate_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT nestmate_user."id"
  FROM public."User" AS nestmate_user
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND nestmate_user."authUserId" = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION nestmate_private.is_conversation_participant(
  conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Conversation" AS conversation
    JOIN public."User" AS nestmate_user
      ON nestmate_user."authUserId" = (SELECT auth.uid())
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND conversation."id" = conversation_id
      AND nestmate_user."id" IN (
        conversation."participantOneId",
        conversation."participantTwoId"
      )
  );
$$;

REVOKE ALL ON FUNCTION nestmate_private.current_nestmate_user_id()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.is_conversation_participant(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.current_nestmate_user_id()
TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.is_conversation_participant(UUID)
TO authenticated;

-- Enforce message membership even for trusted server-side inserts.
CREATE OR REPLACE FUNCTION nestmate_private.validate_direct_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public."Conversation" AS conversation
    WHERE conversation."id" = NEW."conversationId"
      AND NEW."senderId" IN (
        conversation."participantOneId",
        conversation."participantTwoId"
      )
  ) THEN
    RAISE EXCEPTION 'Message sender must be a conversation participant.'
      USING ERRCODE = '23514';
  END IF;

  NEW."body" := btrim(NEW."body");
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION nestmate_private.touch_conversation_after_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public."Conversation"
  SET
    "lastMessageAt" = NEW."createdAt",
    "updatedAt" = NEW."createdAt"
  WHERE "id" = NEW."conversationId";

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.validate_direct_message()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.touch_conversation_after_message()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_direct_message_before_insert"
BEFORE INSERT ON public."Message"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_direct_message();

CREATE TRIGGER "touch_conversation_after_message_insert"
AFTER INSERT ON public."Message"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.touch_conversation_after_message();

-- Expose only participant-safe operations through authenticated sessions.
ALTER TABLE public."Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."Conversation" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public."Message" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."Conversation" TO authenticated;
GRANT SELECT ON TABLE public."Message" TO authenticated;
GRANT INSERT ("conversationId", "senderId", "body")
ON TABLE public."Message" TO authenticated;

CREATE POLICY "conversation_participants_can_read"
ON public."Conversation"
FOR SELECT
TO authenticated
USING (
  nestmate_private.is_conversation_participant("id")
);

CREATE POLICY "conversation_participants_can_read_messages"
ON public."Message"
FOR SELECT
TO authenticated
USING (
  nestmate_private.is_conversation_participant("conversationId")
);

CREATE POLICY "conversation_participants_can_send_messages"
ON public."Message"
FOR INSERT
TO authenticated
WITH CHECK (
  nestmate_private.is_conversation_participant("conversationId")
  AND "senderId" = nestmate_private.current_nestmate_user_id()
);

-- Minimal authenticated user directory for starting a private conversation.
CREATE OR REPLACE FUNCTION public.list_chat_users()
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

-- Atomically creates or returns the one conversation for a pair of users.
CREATE OR REPLACE FUNCTION public.start_direct_conversation(
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

-- Return a batched conversation list with previews and unread counts.
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

CREATE OR REPLACE FUNCTION public.mark_conversation_read(
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

-- Realtime Postgres Changes requires Message in the Supabase publication.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Message'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."Message"';
  END IF;
END;
$$;
