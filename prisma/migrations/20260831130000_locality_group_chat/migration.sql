-- Store member-only locality chat messages and a per-member read cursor.
ALTER TABLE public."CommunityMember"
ADD COLUMN "lastChatReadAt" TIMESTAMPTZ(3);

CREATE TABLE public."CommunityMessage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "communityId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommunityMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunityMessage_body_length_check"
    CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000),
  CONSTRAINT "CommunityMessage_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES public."Community"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommunityMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CommunityMessage_communityId_createdAt_id_idx"
ON public."CommunityMessage"("communityId", "createdAt", "id");

CREATE INDEX "CommunityMessage_senderId_idx"
ON public."CommunityMessage"("senderId");

-- Membership checks live in the private schema and always bind the result to
-- the caller's authenticated Supabase identity.
CREATE OR REPLACE FUNCTION nestmate_private.is_community_member(
  target_community_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."CommunityMember" AS membership
    INNER JOIN public."User" AS member_user
      ON member_user."id" = membership."userId"
    INNER JOIN public."Community" AS locality_community
      ON locality_community."id" = membership."communityId"
    WHERE membership."communityId" = target_community_id
      AND member_user."authUserId" = (SELECT auth.uid())
      AND locality_community."isActive" = TRUE
  );
$$;

REVOKE ALL ON FUNCTION nestmate_private.is_community_member(TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.is_community_member(TEXT)
TO authenticated;

-- Trim bodies and enforce locality membership even for trusted inserts.
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

  NEW."body" := btrim(NEW."body");
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.validate_community_message()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_community_message_before_insert"
BEFORE INSERT ON public."CommunityMessage"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_community_message();

-- The table is exposed only to authenticated sessions and every row is
-- protected by locality membership RLS.
ALTER TABLE public."CommunityMessage" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."CommunityMessage"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."CommunityMessage" TO authenticated;
GRANT INSERT ("communityId", "senderId", "body")
ON TABLE public."CommunityMessage" TO authenticated;

CREATE POLICY "Locality members can read community messages"
ON public."CommunityMessage"
FOR SELECT
TO authenticated
USING (
  (SELECT nestmate_private.is_community_member("communityId"))
);

CREATE POLICY "Locality members can send community messages"
ON public."CommunityMessage"
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT nestmate_private.is_community_member("communityId"))
  AND "senderId" = (SELECT nestmate_private.current_nestmate_user_id())
);

-- Member-safe message history with only the sender profile fields needed by
-- the chat UI. Supplying a message ID hydrates a single Realtime event.
CREATE OR REPLACE FUNCTION nestmate_private.get_community_chat_messages(
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
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
    community_message."createdAt"
  FROM public."CommunityMessage" AS community_message
  INNER JOIN public."User" AS sender
    ON sender."id" = community_message."senderId"
  WHERE community_message."communityId" = target_community_id
    AND (
      target_message_id IS NULL
      OR community_message."id" = target_message_id
    )
  ORDER BY community_message."createdAt" DESC, community_message."id" DESC
  LIMIT CASE WHEN target_message_id IS NULL THEN 100 ELSE 1 END;
END;
$$;

CREATE OR REPLACE FUNCTION nestmate_private.mark_community_chat_read(
  target_community_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
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

  SELECT nestmate_user."id" INTO current_user_id
  FROM public."User" AS nestmate_user
  WHERE nestmate_user."authUserId" = (SELECT auth.uid());

  UPDATE public."CommunityMember"
  SET "lastChatReadAt" = CURRENT_TIMESTAMP
  WHERE "communityId" = target_community_id
    AND "userId" = current_user_id;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows = 0 THEN
    RAISE EXCEPTION 'Locality community membership is required.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.get_community_chat_messages(TEXT, UUID)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.mark_community_chat_read(TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.get_community_chat_messages(TEXT, UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.mark_community_chat_read(TEXT)
TO authenticated;

-- Public RPC wrappers retain caller privileges and delegate to the audited
-- private helpers.
CREATE OR REPLACE FUNCTION public.get_community_chat_messages(
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

CREATE OR REPLACE FUNCTION public.mark_community_chat_read(
  target_community_id TEXT
)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nestmate_private.mark_community_chat_read(target_community_id);
$$;

REVOKE ALL ON FUNCTION public.get_community_chat_messages(TEXT, UUID)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_community_chat_read(TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_chat_messages(TEXT, UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_community_chat_read(TEXT)
TO authenticated;

-- Realtime Postgres Changes requires the persisted messages in the Supabase
-- publication. The client subscribes with a communityId filter.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'CommunityMessage'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."CommunityMessage"';
  END IF;
END;
$$;
