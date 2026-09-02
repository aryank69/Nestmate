-- In-app notifications for private messages, locality mentions/replies, and
-- member interest in structured posts.
CREATE TYPE public."NotificationType" AS ENUM (
  'PRIVATE_MESSAGE',
  'COMMUNITY_MENTION',
  'COMMUNITY_REPLY',
  'POST_ACTIVITY'
);

ALTER TABLE public."CommunityMessage"
ADD COLUMN "replyToId" UUID;

ALTER TABLE public."CommunityMessage"
ADD CONSTRAINT "CommunityMessage_replyToId_fkey"
FOREIGN KEY ("replyToId") REFERENCES public."CommunityMessage"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CommunityMessage_replyToId_idx"
ON public."CommunityMessage"("replyToId");

CREATE TABLE public."Notification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "type" public."NotificationType" NOT NULL,
  "title" VARCHAR(140) NOT NULL,
  "body" VARCHAR(300),
  "href" VARCHAR(500) NOT NULL,
  "resourceId" VARCHAR(128) NOT NULL,
  "readAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_not_self_check"
    CHECK ("actorId" IS NULL OR "actorId" <> "recipientId"),
  CONSTRAINT "Notification_title_check"
    CHECK (char_length(btrim("title")) BETWEEN 1 AND 140),
  CONSTRAINT "Notification_body_check"
    CHECK ("body" IS NULL OR char_length(btrim("body")) BETWEEN 1 AND 300),
  CONSTRAINT "Notification_href_check"
    CHECK (char_length(btrim("href")) BETWEEN 1 AND 500 AND left("href", 1) = '/'),
  CONSTRAINT "Notification_resourceId_check"
    CHECK (char_length(btrim("resourceId")) BETWEEN 1 AND 128),
  CONSTRAINT "Notification_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES public."User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Notification_recipientId_type_resourceId_actorId_key"
ON public."Notification"("recipientId", "type", "resourceId", "actorId");

CREATE INDEX "Notification_recipientId_readAt_createdAt_idx"
ON public."Notification"("recipientId", "readAt", "createdAt" DESC);

CREATE INDEX "Notification_actorId_idx"
ON public."Notification"("actorId");

CREATE INDEX "Notification_unread_recipient_createdAt_idx"
ON public."Notification"("recipientId", "createdAt" DESC)
WHERE "readAt" IS NULL;

ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."Notification"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."Notification" TO authenticated;
GRANT UPDATE ("readAt") ON TABLE public."Notification" TO authenticated;
GRANT USAGE ON TYPE public."NotificationType" TO authenticated;

CREATE POLICY "Users can read their own unblocked notifications"
ON public."Notification"
FOR SELECT
TO authenticated
USING (
  "recipientId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (
    "actorId" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public."UserBlock" AS user_block
      WHERE user_block."blockerId" = "Notification"."recipientId"
        AND user_block."blockedId" = "Notification"."actorId"
    )
  )
);

CREATE POLICY "Users can mark their own notifications read"
ON public."Notification"
FOR UPDATE
TO authenticated
USING (
  "recipientId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (
    "actorId" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public."UserBlock" AS user_block
      WHERE user_block."blockerId" = "Notification"."recipientId"
        AND user_block."blockedId" = "Notification"."actorId"
    )
  )
)
WITH CHECK (
  "recipientId" = (SELECT nestmate_private.current_nestmate_user_id())
);

-- The reply must point to a message in the same locality community.
CREATE OR REPLACE FUNCTION nestmate_private.validate_community_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public."CommunityMember" AS membership
    INNER JOIN public."Community" AS locality_community
      ON locality_community."id" = membership."communityId"
    WHERE membership."communityId" = NEW."communityId"
      AND membership."userId" = NEW."senderId"
      AND locality_community."isActive" = TRUE
  ) THEN
    RAISE EXCEPTION 'Message sender must belong to the locality community.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."replyToId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public."CommunityMessage" AS reply_target
    WHERE reply_target."id" = NEW."replyToId"
      AND reply_target."communityId" = NEW."communityId"
  ) THEN
    RAISE EXCEPTION 'Replies must reference a message in the same community.'
      USING ERRCODE = '23514';
  END IF;

  NEW."body" := btrim(NEW."body");
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.validate_community_message()
FROM PUBLIC, anon, authenticated;

REVOKE INSERT ON TABLE public."CommunityMessage" FROM authenticated;
GRANT INSERT ("communityId", "senderId", "replyToId", "body")
ON TABLE public."CommunityMessage" TO authenticated;

-- Create a recipient-owned notification after a valid private message.
CREATE OR REPLACE FUNCTION nestmate_private.notify_direct_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recipient_id TEXT;
  actor_name TEXT;
BEGIN
  SELECT
    CASE
      WHEN conversation."participantOneId" = NEW."senderId"
        THEN conversation."participantTwoId"
      ELSE conversation."participantOneId"
    END
  INTO recipient_id
  FROM public."Conversation" AS conversation
  WHERE conversation."id" = NEW."conversationId";

  IF recipient_id IS NULL OR recipient_id = NEW."senderId" OR EXISTS (
    SELECT 1
    FROM public."UserBlock" AS user_block
    WHERE (
      user_block."blockerId" = recipient_id
      AND user_block."blockedId" = NEW."senderId"
    ) OR (
      user_block."blockerId" = NEW."senderId"
      AND user_block."blockedId" = recipient_id
    )
  ) THEN
    RETURN NEW;
  END IF;

  SELECT nestmate_user."name" INTO actor_name
  FROM public."User" AS nestmate_user
  WHERE nestmate_user."id" = NEW."senderId";

  INSERT INTO public."Notification" (
    "recipientId",
    "actorId",
    "type",
    "title",
    "body",
    "href",
    "resourceId"
  ) VALUES (
    recipient_id,
    NEW."senderId",
    'PRIVATE_MESSAGE'::public."NotificationType",
    left(actor_name || ' sent you a message', 140),
    left(NEW."body", 300),
    '/chat?conversation=' || NEW."conversationId"::TEXT,
    NEW."id"::TEXT
  )
  ON CONFLICT ("recipientId", "type", "resourceId", "actorId")
  DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.notify_direct_message()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "notify_after_direct_message_insert"
AFTER INSERT ON public."Message"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.notify_direct_message();

-- Reply notifications use the structured reply reference. Mention
-- notifications use a case-insensitive @Full Name match among community
-- members and skip the reply recipient to avoid duplicate alerts.
CREATE OR REPLACE FUNCTION nestmate_private.notify_community_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_name TEXT;
  reply_recipient_id TEXT;
  community_href TEXT;
  mentioned_member RECORD;
BEGIN
  SELECT nestmate_user."name" INTO actor_name
  FROM public."User" AS nestmate_user
  WHERE nestmate_user."id" = NEW."senderId";

  SELECT
    '/community/' || city."slug" || '/' || locality."slug"
      || '?view=chat&message=' || NEW."id"::TEXT
  INTO community_href
  FROM public."Community" AS locality_community
  INNER JOIN public."Locality" AS locality
    ON locality."id" = locality_community."localityId"
  INNER JOIN public."City" AS city
    ON city."id" = locality."cityId"
  WHERE locality_community."id" = NEW."communityId";

  IF NEW."replyToId" IS NOT NULL THEN
    SELECT reply_target."senderId" INTO reply_recipient_id
    FROM public."CommunityMessage" AS reply_target
    WHERE reply_target."id" = NEW."replyToId";

    IF reply_recipient_id IS NOT NULL
      AND reply_recipient_id <> NEW."senderId"
      AND NOT EXISTS (
        SELECT 1
        FROM public."UserBlock" AS user_block
        WHERE (
          user_block."blockerId" = reply_recipient_id
          AND user_block."blockedId" = NEW."senderId"
        ) OR (
          user_block."blockerId" = NEW."senderId"
          AND user_block."blockedId" = reply_recipient_id
        )
      )
    THEN
      INSERT INTO public."Notification" (
        "recipientId", "actorId", "type", "title", "body", "href", "resourceId"
      ) VALUES (
        reply_recipient_id,
        NEW."senderId",
        'COMMUNITY_REPLY'::public."NotificationType",
        left(actor_name || ' replied to you in a locality chat', 140),
        left(NEW."body", 300),
        community_href,
        NEW."id"::TEXT
      )
      ON CONFLICT ("recipientId", "type", "resourceId", "actorId")
      DO NOTHING;
    END IF;
  END IF;

  FOR mentioned_member IN
    SELECT member_user."id", member_user."name"
    FROM public."CommunityMember" AS membership
    INNER JOIN public."User" AS member_user
      ON member_user."id" = membership."userId"
    WHERE membership."communityId" = NEW."communityId"
      AND member_user."id" <> NEW."senderId"
      AND member_user."id" IS DISTINCT FROM reply_recipient_id
      AND position(lower('@' || member_user."name") IN lower(NEW."body")) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public."UserBlock" AS user_block
        WHERE (
          user_block."blockerId" = member_user."id"
          AND user_block."blockedId" = NEW."senderId"
        ) OR (
          user_block."blockerId" = NEW."senderId"
          AND user_block."blockedId" = member_user."id"
        )
      )
  LOOP
    INSERT INTO public."Notification" (
      "recipientId", "actorId", "type", "title", "body", "href", "resourceId"
    ) VALUES (
      mentioned_member."id",
      NEW."senderId",
      'COMMUNITY_MENTION'::public."NotificationType",
      left(actor_name || ' mentioned you in a locality chat', 140),
      left(NEW."body", 300),
      community_href,
      NEW."id"::TEXT
    )
    ON CONFLICT ("recipientId", "type", "resourceId", "actorId")
    DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.notify_community_message()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "notify_after_community_message_insert"
AFTER INSERT ON public."CommunityMessage"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.notify_community_message();

-- Extend the conversation starter with an optional structured-post source.
-- The post author receives one deduplicated activity notification per member.
DROP FUNCTION IF EXISTS public.start_direct_conversation(UUID);
DROP FUNCTION IF EXISTS nestmate_private.start_direct_conversation(UUID);

CREATE FUNCTION nestmate_private.start_direct_conversation(
  other_auth_user_id UUID,
  source_post_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_auth_user_id UUID := (SELECT auth.uid());
  current_user_id TEXT;
  current_user_name TEXT;
  other_user_id TEXT;
  first_user_id TEXT;
  second_user_id TEXT;
  conversation_id UUID;
  source_post_title TEXT;
BEGIN
  IF current_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  IF other_auth_user_id IS NULL OR other_auth_user_id = current_auth_user_id THEN
    RAISE EXCEPTION 'Choose another NestMate user.' USING ERRCODE = '22023';
  END IF;

  SELECT "id", "name" INTO current_user_id, current_user_name
  FROM public."User"
  WHERE "authUserId" = current_auth_user_id;

  SELECT "id" INTO other_user_id
  FROM public."User"
  WHERE "authUserId" = other_auth_user_id;

  IF current_user_id IS NULL OR other_user_id IS NULL THEN
    RAISE EXCEPTION 'Both participants need NestMate profiles.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."UserBlock" AS user_block
    WHERE (
      user_block."blockerId" = current_user_id
      AND user_block."blockedId" = other_user_id
    ) OR (
      user_block."blockerId" = other_user_id
      AND user_block."blockedId" = current_user_id
    )
  ) THEN
    RAISE EXCEPTION 'This private conversation is unavailable.'
      USING ERRCODE = '42501';
  END IF;

  IF source_post_id IS NOT NULL THEN
    SELECT structured_post."title" INTO source_post_title
    FROM public."Post" AS structured_post
    WHERE structured_post."id" = source_post_id
      AND structured_post."authorId" = other_user_id
      AND structured_post."status" = 'ACTIVE'::public."PostStatus"
      AND structured_post."publishedAt" IS NOT NULL;

    IF source_post_title IS NULL THEN
      RAISE EXCEPTION 'That structured post is unavailable.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  first_user_id := LEAST(current_user_id, other_user_id);
  second_user_id := GREATEST(current_user_id, other_user_id);

  INSERT INTO public."Conversation" ("participantOneId", "participantTwoId")
  VALUES (first_user_id, second_user_id)
  ON CONFLICT ("participantOneId", "participantTwoId") DO NOTHING
  RETURNING "id" INTO conversation_id;

  IF conversation_id IS NULL THEN
    SELECT "id" INTO conversation_id
    FROM public."Conversation"
    WHERE "participantOneId" = first_user_id
      AND "participantTwoId" = second_user_id;
  END IF;

  IF source_post_id IS NOT NULL THEN
    INSERT INTO public."Notification" (
      "recipientId", "actorId", "type", "title", "body", "href", "resourceId"
    ) VALUES (
      other_user_id,
      current_user_id,
      'POST_ACTIVITY'::public."NotificationType",
      left(current_user_name || ' is interested in your post', 140),
      left(source_post_title, 300),
      '/chat?conversation=' || conversation_id::TEXT,
      source_post_id
    )
    ON CONFLICT ("recipientId", "type", "resourceId", "actorId")
    DO NOTHING;
  END IF;

  RETURN conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.start_direct_conversation(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.start_direct_conversation(UUID, TEXT)
TO authenticated;

CREATE FUNCTION public.start_direct_conversation(
  other_auth_user_id UUID,
  source_post_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nestmate_private.start_direct_conversation(
    other_auth_user_id,
    source_post_id
  );
$$;

REVOKE ALL ON FUNCTION public.start_direct_conversation(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_direct_conversation(UUID, TEXT)
TO authenticated;

-- Add safe reply previews to locality-chat history without leaking content
-- from a user blocked by the caller.
DROP FUNCTION IF EXISTS public.get_community_chat_messages(TEXT, UUID);
DROP FUNCTION IF EXISTS nestmate_private.get_community_chat_messages(TEXT, UUID);

CREATE FUNCTION nestmate_private.get_community_chat_messages(
  target_community_id TEXT,
  target_message_id UUID DEFAULT NULL
)
RETURNS TABLE (
  message_id UUID,
  community_id TEXT,
  sender_id TEXT,
  sender_name TEXT,
  sender_profession TEXT,
  message_body TEXT,
  reply_to_id UUID,
  reply_sender_name TEXT,
  reply_body TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF NOT nestmate_private.is_community_member(target_community_id) THEN
    RAISE EXCEPTION 'Locality community membership is required.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    community_message."id",
    community_message."communityId",
    community_message."senderId",
    sender."name",
    sender."profession",
    community_message."body"::TEXT,
    reply_preview.reply_id,
    reply_preview.reply_sender_name,
    reply_preview.reply_body,
    community_message."createdAt"
  FROM public."CommunityMessage" AS community_message
  INNER JOIN public."User" AS sender
    ON sender."id" = community_message."senderId"
  LEFT JOIN LATERAL (
    SELECT
      reply_target."id" AS reply_id,
      reply_sender."name" AS reply_sender_name,
      reply_target."body"::TEXT AS reply_body
    FROM public."CommunityMessage" AS reply_target
    INNER JOIN public."User" AS reply_sender
      ON reply_sender."id" = reply_target."senderId"
    WHERE reply_target."id" = community_message."replyToId"
      AND NOT EXISTS (
        SELECT 1
        FROM public."UserBlock" AS reply_block
        WHERE reply_block."blockerId" = current_user_id
          AND reply_block."blockedId" = reply_target."senderId"
      )
  ) AS reply_preview ON TRUE
  WHERE community_message."communityId" = target_community_id
    AND (
      target_message_id IS NULL
      OR community_message."id" = target_message_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public."UserBlock" AS user_block
      WHERE user_block."blockerId" = current_user_id
        AND user_block."blockedId" = community_message."senderId"
    )
  ORDER BY community_message."createdAt" DESC, community_message."id" DESC
  LIMIT CASE WHEN target_message_id IS NULL THEN 100 ELSE 1 END;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.get_community_chat_messages(TEXT, UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.get_community_chat_messages(TEXT, UUID)
TO authenticated;

CREATE FUNCTION public.get_community_chat_messages(
  target_community_id TEXT,
  target_message_id UUID DEFAULT NULL
)
RETURNS TABLE (
  message_id UUID,
  community_id TEXT,
  sender_id TEXT,
  sender_name TEXT,
  sender_profession TEXT,
  message_body TEXT,
  reply_to_id UUID,
  reply_sender_name TEXT,
  reply_body TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM nestmate_private.get_community_chat_messages(
    target_community_id,
    target_message_id
  );
$$;

REVOKE ALL ON FUNCTION public.get_community_chat_messages(TEXT, UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_chat_messages(TEXT, UUID)
TO authenticated;

-- Postgres Changes is sufficient for the lightweight navbar badge in this
-- first version. RLS limits every delivered row to its recipient.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Notification'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Notification";
  END IF;
END;
$$;
