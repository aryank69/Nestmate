-- Basic trust and safety: private reports, directional user blocks, and
-- block-aware community and private chat reads.
CREATE TYPE public."ReportTargetType" AS ENUM (
  'USER',
  'POST',
  'DIRECT_MESSAGE',
  'COMMUNITY_MESSAGE'
);

CREATE TYPE public."ReportReason" AS ENUM (
  'SPAM',
  'SCAM',
  'HARASSMENT',
  'INAPPROPRIATE_CONTENT',
  'IMPERSONATION',
  'SAFETY_CONCERN',
  'OTHER'
);

CREATE TABLE public."UserBlock" (
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId", "blockedId"),
  CONSTRAINT "UserBlock_distinct_users_check" CHECK ("blockerId" <> "blockedId"),
  CONSTRAINT "UserBlock_blockerId_fkey"
    FOREIGN KEY ("blockerId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserBlock_blockedId_fkey"
    FOREIGN KEY ("blockedId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE public."Report" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reporterId" TEXT NOT NULL,
  "reportedUserId" TEXT NOT NULL,
  "targetType" public."ReportTargetType" NOT NULL,
  "targetId" VARCHAR(128) NOT NULL,
  "reason" public."ReportReason" NOT NULL,
  "details" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Report_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Report_distinct_users_check" CHECK ("reporterId" <> "reportedUserId"),
  CONSTRAINT "Report_target_id_check"
    CHECK (char_length(btrim("targetId")) BETWEEN 1 AND 128),
  CONSTRAINT "Report_details_check"
    CHECK ("details" IS NULL OR char_length(btrim("details")) BETWEEN 1 AND 500),
  CONSTRAINT "Report_reporterId_fkey"
    FOREIGN KEY ("reporterId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserBlock_blockedId_idx"
ON public."UserBlock"("blockedId");

CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key"
ON public."Report"("reporterId", "targetType", "targetId");

CREATE INDEX "Report_reporterId_createdAt_idx"
ON public."Report"("reporterId", "createdAt" DESC);

CREATE INDEX "Report_reportedUserId_createdAt_idx"
ON public."Report"("reportedUserId", "createdAt" DESC);

CREATE INDEX "Report_targetType_targetId_idx"
ON public."Report"("targetType", "targetId");

ALTER TABLE public."UserBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Report" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."UserBlock"
FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."Report"
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public."UserBlock" TO authenticated;
GRANT SELECT, INSERT ON TABLE public."Report" TO authenticated;
GRANT USAGE ON TYPE public."ReportTargetType" TO authenticated;
GRANT USAGE ON TYPE public."ReportReason" TO authenticated;

CREATE POLICY "Users can read their own blocks"
ON public."UserBlock"
FOR SELECT
TO authenticated
USING (
  "blockerId" = (SELECT nestmate_private.current_nestmate_user_id())
);

CREATE POLICY "Users can create their own blocks"
ON public."UserBlock"
FOR INSERT
TO authenticated
WITH CHECK (
  "blockerId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND "blockedId" <> "blockerId"
);

CREATE POLICY "Users can remove their own blocks"
ON public."UserBlock"
FOR DELETE
TO authenticated
USING (
  "blockerId" = (SELECT nestmate_private.current_nestmate_user_id())
);

-- Validate both target ownership and the reporter's access without exposing
-- report data or privileged tables through a public security-definer RPC.
CREATE OR REPLACE FUNCTION nestmate_private.can_report_target(
  target_type public."ReportTargetType",
  target_id TEXT,
  reported_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF current_user_id IS NULL
    OR reported_user_id IS NULL
    OR reported_user_id = current_user_id
    OR target_id IS NULL
  THEN
    RETURN FALSE;
  END IF;

  IF target_type = 'USER'::public."ReportTargetType" THEN
    RETURN target_id = reported_user_id
      AND EXISTS (
        SELECT 1 FROM public."User" AS reported_user
        WHERE reported_user."id" = reported_user_id
      );
  END IF;

  IF target_type = 'POST'::public."ReportTargetType" THEN
    RETURN EXISTS (
      SELECT 1
      FROM public."Post" AS reported_post
      WHERE reported_post."id" = target_id
        AND reported_post."authorId" = reported_user_id
        AND reported_post."status" = 'ACTIVE'::public."PostStatus"
        AND reported_post."publishedAt" IS NOT NULL
    );
  END IF;

  IF target_type = 'DIRECT_MESSAGE'::public."ReportTargetType" THEN
    RETURN EXISTS (
      SELECT 1
      FROM public."Message" AS reported_message
      INNER JOIN public."Conversation" AS conversation
        ON conversation."id" = reported_message."conversationId"
      WHERE reported_message."id"::TEXT = target_id
        AND reported_message."senderId" = reported_user_id
        AND current_user_id IN (
          conversation."participantOneId",
          conversation."participantTwoId"
        )
    );
  END IF;

  IF target_type = 'COMMUNITY_MESSAGE'::public."ReportTargetType" THEN
    RETURN EXISTS (
      SELECT 1
      FROM public."CommunityMessage" AS reported_message
      INNER JOIN public."CommunityMember" AS reporter_membership
        ON reporter_membership."communityId" = reported_message."communityId"
       AND reporter_membership."userId" = current_user_id
      WHERE reported_message."id"::TEXT = target_id
        AND reported_message."senderId" = reported_user_id
    );
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.can_report_target(
  public."ReportTargetType", TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_report_target(
  public."ReportTargetType", TEXT, TEXT
) TO authenticated;

CREATE POLICY "Users can read their own reports"
ON public."Report"
FOR SELECT
TO authenticated
USING (
  "reporterId" = (SELECT nestmate_private.current_nestmate_user_id())
);

CREATE POLICY "Users can submit their own valid reports"
ON public."Report"
FOR INSERT
TO authenticated
WITH CHECK (
  "reporterId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_report_target(
    "targetType",
    "targetId"::TEXT,
    "reportedUserId"
  ))
);

-- Public visitors retain the existing public feed. Authenticated users no
-- longer receive active posts authored by users they blocked.
DROP POLICY IF EXISTS "Anyone can read active community posts"
ON public."Post";

CREATE POLICY "Visitors can read active community posts"
ON public."Post"
FOR SELECT
TO anon
USING (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "publishedAt" IS NOT NULL
);

CREATE POLICY "Users can read unblocked active community posts"
ON public."Post"
FOR SELECT
TO authenticated
USING (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "publishedAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public."UserBlock" AS user_block
    WHERE user_block."blockerId" = (SELECT nestmate_private.current_nestmate_user_id())
      AND user_block."blockedId" = "Post"."authorId"
  )
);

DROP POLICY IF EXISTS "Locality members can read community messages"
ON public."CommunityMessage";

CREATE POLICY "Locality members can read unblocked community messages"
ON public."CommunityMessage"
FOR SELECT
TO authenticated
USING (
  (SELECT nestmate_private.is_community_member("communityId"))
  AND NOT EXISTS (
    SELECT 1
    FROM public."UserBlock" AS user_block
    WHERE user_block."blockerId" = (SELECT nestmate_private.current_nestmate_user_id())
      AND user_block."blockedId" = "CommunityMessage"."senderId"
  )
);

-- A block in either direction closes an existing private conversation and
-- prevents new messages. Updating this helper automatically hardens the
-- existing Conversation and Message RLS policies.
CREATE OR REPLACE FUNCTION nestmate_private.is_conversation_participant(
  conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH current_nestmate_user AS (
    SELECT nestmate_private.current_nestmate_user_id() AS user_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public."Conversation" AS conversation
    CROSS JOIN current_nestmate_user
    WHERE current_nestmate_user.user_id IS NOT NULL
      AND conversation."id" = conversation_id
      AND current_nestmate_user.user_id IN (
        conversation."participantOneId",
        conversation."participantTwoId"
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public."UserBlock" AS user_block
        WHERE (
          user_block."blockerId" = conversation."participantOneId"
          AND user_block."blockedId" = conversation."participantTwoId"
        ) OR (
          user_block."blockerId" = conversation."participantTwoId"
          AND user_block."blockedId" = conversation."participantOneId"
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION nestmate_private.is_conversation_participant(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.is_conversation_participant(UUID)
TO authenticated;

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
      AND NOT EXISTS (
        SELECT 1
        FROM public."UserBlock" AS user_block
        WHERE (
          user_block."blockerId" = conversation."participantOneId"
          AND user_block."blockedId" = conversation."participantTwoId"
        ) OR (
          user_block."blockerId" = conversation."participantTwoId"
          AND user_block."blockedId" = conversation."participantOneId"
        )
      )
  ) THEN
    RAISE EXCEPTION 'This private conversation is unavailable.'
      USING ERRCODE = '42501';
  END IF;

  NEW."body" := btrim(NEW."body");
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.validate_direct_message()
FROM PUBLIC, anon, authenticated;

-- Return internal profile IDs as well as auth IDs so client safety actions
-- never need to infer or expose another user's authentication identity.
DROP FUNCTION IF EXISTS public.list_chat_users();
DROP FUNCTION IF EXISTS public.get_my_conversations();
DROP FUNCTION IF EXISTS nestmate_private.list_chat_users();
DROP FUNCTION IF EXISTS nestmate_private.get_my_conversations();

CREATE FUNCTION nestmate_private.list_chat_users()
RETURNS TABLE (
  user_id TEXT,
  auth_user_id UUID,
  display_name TEXT,
  profession TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH current_nestmate_user AS (
    SELECT nestmate_private.current_nestmate_user_id() AS user_id
  )
  SELECT
    nestmate_user."id",
    nestmate_user."authUserId",
    nestmate_user."name",
    nestmate_user."profession"
  FROM public."User" AS nestmate_user
  CROSS JOIN current_nestmate_user
  WHERE current_nestmate_user.user_id IS NOT NULL
    AND nestmate_user."id" <> current_nestmate_user.user_id
    AND NOT EXISTS (
      SELECT 1
      FROM public."UserBlock" AS user_block
      WHERE (
        user_block."blockerId" = current_nestmate_user.user_id
        AND user_block."blockedId" = nestmate_user."id"
      ) OR (
        user_block."blockerId" = nestmate_user."id"
        AND user_block."blockedId" = current_nestmate_user.user_id
      )
    )
  ORDER BY nestmate_user."name"
  LIMIT 100;
$$;

CREATE FUNCTION nestmate_private.get_my_conversations()
RETURNS TABLE (
  conversation_id UUID,
  other_user_id TEXT,
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
    SELECT nestmate_private.current_nestmate_user_id() AS id
  )
  SELECT
    conversation."id",
    other_user."id",
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
        AND unread_message."senderId" <> current_nestmate_user.id
        AND unread_message."createdAt" > COALESCE(
          CASE
            WHEN conversation."participantOneId" = current_nestmate_user.id
              THEN conversation."participantOneLastReadAt"
            ELSE conversation."participantTwoLastReadAt"
          END,
          '-infinity'::TIMESTAMPTZ
        )
    )
  FROM current_nestmate_user
  JOIN public."Conversation" AS conversation
    ON current_nestmate_user.id IN (
      conversation."participantOneId",
      conversation."participantTwoId"
    )
  JOIN public."User" AS other_user
    ON other_user."id" = CASE
      WHEN conversation."participantOneId" = current_nestmate_user.id
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
  WHERE current_nestmate_user.id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public."UserBlock" AS user_block
      WHERE (
        user_block."blockerId" = current_nestmate_user.id
        AND user_block."blockedId" = other_user."id"
      ) OR (
        user_block."blockerId" = other_user."id"
        AND user_block."blockedId" = current_nestmate_user.id
      )
    )
  ORDER BY COALESCE(
    latest_message."createdAt",
    conversation."lastMessageAt",
    conversation."createdAt"
  ) DESC
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

  RETURN conversation_id;
END;
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
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  affected_rows INTEGER;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public."Conversation" AS conversation
  SET
    "participantOneLastReadAt" = CASE
      WHEN conversation."participantOneId" = current_user_id
        THEN CURRENT_TIMESTAMP
      ELSE conversation."participantOneLastReadAt"
    END,
    "participantTwoLastReadAt" = CASE
      WHEN conversation."participantTwoId" = current_user_id
        THEN CURRENT_TIMESTAMP
      ELSE conversation."participantTwoLastReadAt"
    END
  WHERE conversation."id" = target_conversation_id
    AND current_user_id IN (
      conversation."participantOneId",
      conversation."participantTwoId"
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public."UserBlock" AS user_block
      WHERE (
        user_block."blockerId" = conversation."participantOneId"
        AND user_block."blockedId" = conversation."participantTwoId"
      ) OR (
        user_block."blockerId" = conversation."participantTwoId"
        AND user_block."blockedId" = conversation."participantOneId"
      )
    );

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

GRANT EXECUTE ON FUNCTION nestmate_private.list_chat_users() TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.start_direct_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.get_my_conversations() TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.mark_conversation_read(UUID) TO authenticated;

CREATE FUNCTION public.list_chat_users()
RETURNS TABLE (
  user_id TEXT,
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

CREATE FUNCTION public.get_my_conversations()
RETURNS TABLE (
  conversation_id UUID,
  other_user_id TEXT,
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

REVOKE ALL ON FUNCTION public.list_chat_users()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_conversations()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_chat_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_conversations() TO authenticated;

-- Member-safe group history also hides messages from users blocked by the
-- caller. The public wrapper keeps its existing signature.
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
    community_message."createdAt"
  FROM public."CommunityMessage" AS community_message
  INNER JOIN public."User" AS sender
    ON sender."id" = community_message."senderId"
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
