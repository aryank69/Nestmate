-- Role-based moderation, private review state, content visibility, and an
-- append-only audit trail. No account receives a moderator role automatically.
CREATE TYPE public."ModeratorRole" AS ENUM ('ADMIN', 'MODERATOR');
CREATE TYPE public."ModerationActionType" AS ENUM (
  'DISMISS',
  'WARN',
  'HIDE_CONTENT',
  'RESTRICT',
  'SUSPEND',
  'RESTORE_USER'
);
CREATE TYPE public."ModerationQueueType" AS ENUM (
  'REPORT',
  'SAFETY_FLAG',
  'VERIFICATION_CHECK',
  'USER_STATE'
);
CREATE TYPE public."ModerationReviewStatus" AS ENUM ('DISMISSED', 'ACTIONED');
CREATE TYPE public."UserModerationStatus" AS ENUM ('RESTRICTED', 'SUSPENDED');
CREATE TYPE public."ContentModerationStatus" AS ENUM ('VISIBLE', 'HIDDEN');

ALTER TYPE public."NotificationType" ADD VALUE IF NOT EXISTS 'MODERATION_WARNING';

ALTER TABLE public."Post"
ADD COLUMN "moderationStatus" public."ContentModerationStatus"
NOT NULL DEFAULT 'VISIBLE';
ALTER TABLE public."Message"
ADD COLUMN "moderationStatus" public."ContentModerationStatus"
NOT NULL DEFAULT 'VISIBLE';
ALTER TABLE public."CommunityMessage"
ADD COLUMN "moderationStatus" public."ContentModerationStatus"
NOT NULL DEFAULT 'VISIBLE';

CREATE TABLE public."ModeratorMembership" (
  "userId" TEXT NOT NULL,
  "role" public."ModeratorRole" NOT NULL,
  "grantedByAuthUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ModeratorMembership_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "ModeratorMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE public."UserModerationState" (
  "userId" TEXT NOT NULL,
  "status" public."UserModerationStatus" NOT NULL,
  "restrictedUntil" TIMESTAMPTZ(3),
  "privateReason" VARCHAR(500) NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserModerationState_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserModerationState_expiry_check" CHECK (
    ("status" = 'RESTRICTED'::public."UserModerationStatus" AND "restrictedUntil" IS NOT NULL)
    OR ("status" = 'SUSPENDED'::public."UserModerationStatus" AND "restrictedUntil" IS NULL)
  ),
  CONSTRAINT "UserModerationState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserModerationState_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE public."ModerationReview" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "queueType" public."ModerationQueueType" NOT NULL,
  "queueId" VARCHAR(128) NOT NULL,
  "status" public."ModerationReviewStatus" NOT NULL,
  "reviewedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ModerationReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModerationReview_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE public."ModerationAuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "moderatorId" TEXT NOT NULL,
  "action" public."ModerationActionType" NOT NULL,
  "queueType" public."ModerationQueueType" NOT NULL,
  "queueId" VARCHAR(128) NOT NULL,
  "subjectUserId" TEXT NOT NULL,
  "targetType" VARCHAR(40) NOT NULL,
  "targetId" VARCHAR(128) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "privateDetails" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ModerationAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModerationAuditLog_moderatorId_fkey"
    FOREIGN KEY ("moderatorId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ModerationAuditLog_subjectUserId_fkey"
    FOREIGN KEY ("subjectUserId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Post_moderationStatus_status_publishedAt_idx"
ON public."Post"("moderationStatus", "status", "publishedAt" DESC);
CREATE INDEX "Message_moderationStatus_conversationId_createdAt_idx"
ON public."Message"("moderationStatus", "conversationId", "createdAt");
CREATE INDEX "CommunityMessage_moderationStatus_communityId_createdAt_idx"
ON public."CommunityMessage"("moderationStatus", "communityId", "createdAt");
CREATE INDEX "ModeratorMembership_role_createdAt_idx"
ON public."ModeratorMembership"("role", "createdAt");
CREATE INDEX "UserModerationState_status_restrictedUntil_idx"
ON public."UserModerationState"("status", "restrictedUntil");
CREATE INDEX "UserModerationState_updatedById_updatedAt_idx"
ON public."UserModerationState"("updatedById", "updatedAt" DESC);
CREATE UNIQUE INDEX "ModerationReview_queueType_queueId_key"
ON public."ModerationReview"("queueType", "queueId");
CREATE INDEX "ModerationReview_reviewedById_updatedAt_idx"
ON public."ModerationReview"("reviewedById", "updatedAt" DESC);
CREATE INDEX "ModerationAuditLog_moderatorId_createdAt_idx"
ON public."ModerationAuditLog"("moderatorId", "createdAt" DESC);
CREATE INDEX "ModerationAuditLog_subjectUserId_createdAt_idx"
ON public."ModerationAuditLog"("subjectUserId", "createdAt" DESC);
CREATE INDEX "ModerationAuditLog_queueType_queueId_createdAt_idx"
ON public."ModerationAuditLog"("queueType", "queueId", "createdAt" DESC);

ALTER TABLE public."ModeratorMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserModerationState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ModerationReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ModerationAuditLog" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."ModeratorMembership"
FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."UserModerationState"
FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."ModerationReview"
FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."ModerationAuditLog"
FROM PUBLIC, anon, authenticated;

GRANT SELECT ("userId", "role") ON TABLE public."ModeratorMembership"
TO authenticated;
GRANT SELECT ON TABLE public."UserModerationState" TO authenticated;
GRANT SELECT ON TABLE public."ModerationReview" TO authenticated;
GRANT SELECT ON TABLE public."ModerationAuditLog" TO authenticated;

REVOKE ALL ON TYPE public."ModeratorRole" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TYPE public."ModerationActionType" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TYPE public."ModerationQueueType" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TYPE public."ModerationReviewStatus" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TYPE public."UserModerationStatus" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TYPE public."ContentModerationStatus" FROM PUBLIC, anon, authenticated;
GRANT USAGE ON TYPE public."ModeratorRole" TO authenticated;
GRANT USAGE ON TYPE public."ModerationActionType" TO authenticated;
GRANT USAGE ON TYPE public."ModerationQueueType" TO authenticated;
GRANT USAGE ON TYPE public."ModerationReviewStatus" TO authenticated;
GRANT USAGE ON TYPE public."UserModerationStatus" TO authenticated;
GRANT USAGE ON TYPE public."ContentModerationStatus" TO anon, authenticated;

CREATE OR REPLACE FUNCTION nestmate_private.current_moderator_role()
RETURNS public."ModeratorRole"
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT membership."role"
  FROM public."ModeratorMembership" AS membership
  INNER JOIN public."User" AS app_user
    ON app_user."id" = membership."userId"
  WHERE app_user."authUserId" = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION nestmate_private.is_current_moderator(
  require_admin BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL THEN FALSE
    WHEN require_admin THEN
      nestmate_private.current_moderator_role() = 'ADMIN'::public."ModeratorRole"
    ELSE
      nestmate_private.current_moderator_role() IN (
        'ADMIN'::public."ModeratorRole",
        'MODERATOR'::public."ModeratorRole"
      )
  END;
$$;

CREATE OR REPLACE FUNCTION nestmate_private.is_user_content_visible(
  target_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public."UserModerationState" AS moderation_state
    WHERE moderation_state."userId" = target_user_id
      AND moderation_state."status" = 'SUSPENDED'::public."UserModerationStatus"
  );
$$;

REVOKE ALL ON FUNCTION nestmate_private.current_moderator_role()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.is_current_moderator(BOOLEAN)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.is_user_content_visible(TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.current_moderator_role()
TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.is_current_moderator(BOOLEAN)
TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.is_user_content_visible(TEXT)
TO anon, authenticated;

CREATE POLICY "Users can read their own moderator role"
ON public."ModeratorMembership"
FOR SELECT
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
);

CREATE POLICY "Moderators can read user moderation states"
ON public."UserModerationState"
FOR SELECT
TO authenticated
USING ((SELECT nestmate_private.is_current_moderator(FALSE)));

CREATE POLICY "Moderators can read moderation reviews"
ON public."ModerationReview"
FOR SELECT
TO authenticated
USING ((SELECT nestmate_private.is_current_moderator(FALSE)));

CREATE POLICY "Moderators can read the audit trail"
ON public."ModerationAuditLog"
FOR SELECT
TO authenticated
USING ((SELECT nestmate_private.is_current_moderator(FALSE)));

CREATE POLICY "Moderators can review reports"
ON public."Report"
FOR SELECT
TO authenticated
USING ((SELECT nestmate_private.is_current_moderator(FALSE)));

GRANT SELECT ON TABLE public."SafetyFlag" TO authenticated;
CREATE POLICY "Moderators can review suspicious activity flags"
ON public."SafetyFlag"
FOR SELECT
TO authenticated
USING ((SELECT nestmate_private.is_current_moderator(FALSE)));

CREATE POLICY "Moderators can review safe verification status fields"
ON public."VerificationCheck"
FOR SELECT
TO authenticated
USING ((SELECT nestmate_private.is_current_moderator(FALSE)));

-- Extend the existing scoped anti-spam gate with explicit moderator-enforced
-- restrictions and suspensions. The reason remains inaccessible to users.
CREATE OR REPLACE FUNCTION nestmate_private.can_perform_safety_scoped_activity(
  target_actor_id TEXT,
  target_scope public."SafetyActivityScope"
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
  IF current_user_id IS NULL OR current_user_id <> target_actor_id THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."UserModerationState" AS moderation_state
    WHERE moderation_state."userId" = target_actor_id
      AND (
        moderation_state."status" = 'SUSPENDED'::public."UserModerationStatus"
        OR (
          moderation_state."status" = 'RESTRICTED'::public."UserModerationStatus"
          AND moderation_state."restrictedUntil" > CURRENT_TIMESTAMP
        )
      )
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public."SafetyFlag" AS safety_flag
    WHERE safety_flag."actorId" = target_actor_id
      AND safety_flag."status" = 'OPEN'::public."SafetyFlagStatus"
      AND safety_flag."restrictedUntil" > CURRENT_TIMESTAMP
      AND safety_flag."scope" IN (
        target_scope,
        'ALL'::public."SafetyActivityScope"
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.can_perform_safety_scoped_activity(
  TEXT, public."SafetyActivityScope"
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_perform_safety_scoped_activity(
  TEXT, public."SafetyActivityScope"
) TO authenticated;

CREATE OR REPLACE FUNCTION nestmate_private.perform_moderation_action(
  requested_queue_type TEXT,
  requested_queue_id TEXT,
  requested_action TEXT,
  requested_reason TEXT,
  requested_restriction_hours INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  moderator_id TEXT := nestmate_private.current_nestmate_user_id();
  moderator_role public."ModeratorRole" := nestmate_private.current_moderator_role();
  queue_type public."ModerationQueueType";
  action_type public."ModerationActionType";
  subject_user_id TEXT;
  resolved_target_type TEXT;
  resolved_target_id TEXT;
  audit_id UUID := gen_random_uuid();
  affected_rows INTEGER := 0;
BEGIN
  IF moderator_id IS NULL OR moderator_role IS NULL THEN
    RAISE EXCEPTION 'Moderator access is required.' USING ERRCODE = '42501';
  END IF;
  IF requested_queue_id IS NULL OR char_length(btrim(requested_queue_id)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Choose a valid moderation item.' USING ERRCODE = '22023';
  END IF;
  IF requested_reason IS NULL OR char_length(btrim(requested_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'A private reason between 5 and 500 characters is required.' USING ERRCODE = '22023';
  END IF;
  IF requested_queue_type NOT IN ('REPORT', 'SAFETY_FLAG', 'VERIFICATION_CHECK', 'USER_STATE')
    OR requested_action NOT IN ('DISMISS', 'WARN', 'HIDE_CONTENT', 'RESTRICT', 'SUSPEND', 'RESTORE_USER')
  THEN
    RAISE EXCEPTION 'Choose a supported moderation action.' USING ERRCODE = '22023';
  END IF;

  queue_type := requested_queue_type::public."ModerationQueueType";
  action_type := requested_action::public."ModerationActionType";

  IF queue_type = 'REPORT'::public."ModerationQueueType" THEN
    SELECT report."reportedUserId", report."targetType"::TEXT, report."targetId"
    INTO subject_user_id, resolved_target_type, resolved_target_id
    FROM public."Report" AS report
    WHERE report."id"::TEXT = requested_queue_id;
  ELSIF queue_type = 'SAFETY_FLAG'::public."ModerationQueueType" THEN
    SELECT safety_flag."actorId", safety_flag."targetType"::TEXT, safety_flag."targetId"
    INTO subject_user_id, resolved_target_type, resolved_target_id
    FROM public."SafetyFlag" AS safety_flag
    WHERE safety_flag."id"::TEXT = requested_queue_id;
  ELSIF queue_type = 'VERIFICATION_CHECK'::public."ModerationQueueType" THEN
    SELECT
      COALESCE(verification."userId", listing."authorId"),
      CASE WHEN verification."postId" IS NULL THEN 'USER' ELSE 'POST' END,
      COALESCE(verification."userId", verification."postId")
    INTO subject_user_id, resolved_target_type, resolved_target_id
    FROM public."VerificationCheck" AS verification
    LEFT JOIN public."Post" AS listing ON listing."id" = verification."postId"
    WHERE verification."id"::TEXT = requested_queue_id;
  ELSE
    subject_user_id := requested_queue_id;
    resolved_target_type := 'USER';
    resolved_target_id := requested_queue_id;
    IF NOT EXISTS (
      SELECT 1 FROM public."UserModerationState"
      WHERE "userId" = requested_queue_id
    ) THEN
      subject_user_id := NULL;
    END IF;
  END IF;

  IF subject_user_id IS NULL OR resolved_target_type IS NULL OR resolved_target_id IS NULL THEN
    RAISE EXCEPTION 'That moderation item is no longer available.' USING ERRCODE = 'P0002';
  END IF;
  IF subject_user_id = moderator_id THEN
    RAISE EXCEPTION 'Moderators cannot act on their own account or content.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."ModeratorMembership"
    WHERE "userId" = subject_user_id
  ) AND moderator_role <> 'ADMIN'::public."ModeratorRole" THEN
    RAISE EXCEPTION 'Only an admin can review another moderator.' USING ERRCODE = '42501';
  END IF;
  IF action_type IN (
    'SUSPEND'::public."ModerationActionType",
    'RESTORE_USER'::public."ModerationActionType"
  ) AND moderator_role <> 'ADMIN'::public."ModeratorRole" THEN
    RAISE EXCEPTION 'Only an admin can suspend or restore an account.' USING ERRCODE = '42501';
  END IF;

  IF action_type = 'DISMISS'::public."ModerationActionType" THEN
    IF queue_type = 'USER_STATE'::public."ModerationQueueType" THEN
      RAISE EXCEPTION 'Use restore to lift an account restriction.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public."ModerationReview" (
      "queueType", "queueId", "status", "reviewedById"
    ) VALUES (
      queue_type, requested_queue_id,
      'DISMISSED'::public."ModerationReviewStatus", moderator_id
    )
    ON CONFLICT ("queueType", "queueId") DO UPDATE SET
      "status" = EXCLUDED."status",
      "reviewedById" = EXCLUDED."reviewedById",
      "updatedAt" = CURRENT_TIMESTAMP;

    IF queue_type = 'SAFETY_FLAG'::public."ModerationQueueType" THEN
      UPDATE public."SafetyFlag"
      SET "status" = 'DISMISSED'::public."SafetyFlagStatus", "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id"::TEXT = requested_queue_id;
    END IF;
  ELSIF action_type = 'HIDE_CONTENT'::public."ModerationActionType" THEN
    IF resolved_target_type = 'POST' THEN
      UPDATE public."Post"
      SET "moderationStatus" = 'HIDDEN'::public."ContentModerationStatus",
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = resolved_target_id;
    ELSIF resolved_target_type = 'DIRECT_MESSAGE' THEN
      UPDATE public."Message"
      SET "moderationStatus" = 'HIDDEN'::public."ContentModerationStatus"
      WHERE "id"::TEXT = resolved_target_id;
    ELSIF resolved_target_type = 'COMMUNITY_MESSAGE' THEN
      UPDATE public."CommunityMessage"
      SET "moderationStatus" = 'HIDDEN'::public."ContentModerationStatus"
      WHERE "id"::TEXT = resolved_target_id;
    ELSE
      RAISE EXCEPTION 'This moderation item has no hideable content.' USING ERRCODE = '22023';
    END IF;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows <> 1 THEN
      RAISE EXCEPTION 'The content is no longer available.' USING ERRCODE = 'P0002';
    END IF;
  ELSIF action_type = 'WARN'::public."ModerationActionType" THEN
    INSERT INTO public."Notification" (
      "recipientId", "actorId", "type", "title", "body", "href", "resourceId"
    ) VALUES (
      subject_user_id,
      moderator_id,
      'MODERATION_WARNING'::public."NotificationType",
      'A note from NestMate safety',
      'Please review the community guidelines before posting or messaging again.',
      '/profile',
      audit_id::TEXT
    );
  ELSIF action_type = 'RESTRICT'::public."ModerationActionType" THEN
    IF requested_restriction_hours IS NULL OR requested_restriction_hours NOT BETWEEN 1 AND 168 THEN
      RAISE EXCEPTION 'Restrictions must last between 1 and 168 hours.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public."UserModerationState" (
      "userId", "status", "restrictedUntil", "privateReason", "updatedById"
    ) VALUES (
      subject_user_id,
      'RESTRICTED'::public."UserModerationStatus",
      CURRENT_TIMESTAMP + make_interval(hours => requested_restriction_hours),
      btrim(requested_reason),
      moderator_id
    )
    ON CONFLICT ("userId") DO UPDATE SET
      "status" = EXCLUDED."status",
      "restrictedUntil" = EXCLUDED."restrictedUntil",
      "privateReason" = EXCLUDED."privateReason",
      "updatedById" = EXCLUDED."updatedById",
      "updatedAt" = CURRENT_TIMESTAMP;
  ELSIF action_type = 'SUSPEND'::public."ModerationActionType" THEN
    INSERT INTO public."UserModerationState" (
      "userId", "status", "restrictedUntil", "privateReason", "updatedById"
    ) VALUES (
      subject_user_id,
      'SUSPENDED'::public."UserModerationStatus",
      NULL,
      btrim(requested_reason),
      moderator_id
    )
    ON CONFLICT ("userId") DO UPDATE SET
      "status" = EXCLUDED."status",
      "restrictedUntil" = NULL,
      "privateReason" = EXCLUDED."privateReason",
      "updatedById" = EXCLUDED."updatedById",
      "updatedAt" = CURRENT_TIMESTAMP;
  ELSE
    DELETE FROM public."UserModerationState"
    WHERE "userId" = subject_user_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows <> 1 THEN
      RAISE EXCEPTION 'The account restriction is no longer active.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF action_type NOT IN (
    'DISMISS'::public."ModerationActionType",
    'RESTORE_USER'::public."ModerationActionType"
  ) AND queue_type <> 'USER_STATE'::public."ModerationQueueType" THEN
    INSERT INTO public."ModerationReview" (
      "queueType", "queueId", "status", "reviewedById"
    ) VALUES (
      queue_type, requested_queue_id,
      'ACTIONED'::public."ModerationReviewStatus", moderator_id
    )
    ON CONFLICT ("queueType", "queueId") DO UPDATE SET
      "status" = EXCLUDED."status",
      "reviewedById" = EXCLUDED."reviewedById",
      "updatedAt" = CURRENT_TIMESTAMP;

    IF queue_type = 'SAFETY_FLAG'::public."ModerationQueueType" THEN
      UPDATE public."SafetyFlag"
      SET "status" = 'REVIEWED'::public."SafetyFlagStatus", "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id"::TEXT = requested_queue_id;
    END IF;
  END IF;

  INSERT INTO public."ModerationAuditLog" (
    "id", "moderatorId", "action", "queueType", "queueId",
    "subjectUserId", "targetType", "targetId", "reason", "privateDetails"
  ) VALUES (
    audit_id,
    moderator_id,
    action_type,
    queue_type,
    requested_queue_id,
    subject_user_id,
    resolved_target_type,
    resolved_target_id,
    btrim(requested_reason),
    CASE WHEN action_type = 'RESTRICT'::public."ModerationActionType"
      THEN jsonb_build_object('restrictionHours', requested_restriction_hours)
      ELSE NULL
    END
  );

  RETURN audit_id;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.perform_moderation_action(
  TEXT, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.perform_moderation_action(
  TEXT, TEXT, TEXT, TEXT, INTEGER
) TO authenticated;

CREATE OR REPLACE FUNCTION public.perform_moderation_action(
  requested_queue_type TEXT,
  requested_queue_id TEXT,
  requested_action TEXT,
  requested_reason TEXT,
  requested_restriction_hours INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nestmate_private.perform_moderation_action(
    requested_queue_type,
    requested_queue_id,
    requested_action,
    requested_reason,
    requested_restriction_hours
  );
$$;

REVOKE ALL ON FUNCTION public.perform_moderation_action(
  TEXT, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_moderation_action(
  TEXT, TEXT, TEXT, TEXT, INTEGER
) TO authenticated;

-- Hidden content and suspended accounts are excluded in the same database
-- boundary used by normal feeds and chats.
DROP POLICY IF EXISTS "Visitors can read available community posts" ON public."Post";
CREATE POLICY "Visitors can read available community posts"
ON public."Post"
FOR SELECT
TO anon
USING (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "publishedAt" IS NOT NULL
  AND "moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
  AND (SELECT nestmate_private.is_user_content_visible("authorId"))
  AND "availabilityStatus" IN (
    'AVAILABLE'::public."ListingAvailabilityStatus",
    'RESERVED'::public."ListingAvailabilityStatus"
  )
);

DROP POLICY IF EXISTS "Users can read available unblocked or owned community posts" ON public."Post";
CREATE POLICY "Users can read available unblocked or owned community posts"
ON public."Post"
FOR SELECT
TO authenticated
USING (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "publishedAt" IS NOT NULL
  AND "moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
  AND (SELECT nestmate_private.is_user_content_visible("authorId"))
  AND (
    (
      "availabilityStatus" IN (
        'AVAILABLE'::public."ListingAvailabilityStatus",
        'RESERVED'::public."ListingAvailabilityStatus"
      )
      AND NOT EXISTS (
        SELECT 1 FROM public."UserBlock" AS user_block
        WHERE user_block."blockerId" = (SELECT nestmate_private.current_nestmate_user_id())
          AND user_block."blockedId" = "Post"."authorId"
      )
    )
    OR EXISTS (
      SELECT 1 FROM public."User" AS app_user
      WHERE app_user."id" = "Post"."authorId"
        AND app_user."authUserId" = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Users can create their own community posts" ON public."Post";
CREATE POLICY "Users can create their own community posts"
ON public."Post"
FOR INSERT
TO authenticated
WITH CHECK (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "availabilityStatus" = 'AVAILABLE'::public."ListingAvailabilityStatus"
  AND "moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
  AND "publishedAt" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public."User" AS app_user
    WHERE app_user."id" = "Post"."authorId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM public."Community" AS locality_community
    WHERE locality_community."id" = "Post"."communityId"
      AND locality_community."isActive" = TRUE
  )
  AND (SELECT nestmate_private.can_perform_safety_scoped_activity(
    "authorId", 'POST'::public."SafetyActivityScope"
  ))
);

DROP POLICY IF EXISTS "Users can update their own community posts" ON public."Post";
CREATE POLICY "Users can update their own community posts"
ON public."Post"
FOR UPDATE
TO authenticated
USING (
  "moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
  AND EXISTS (
    SELECT 1 FROM public."User" AS app_user
    WHERE app_user."id" = "Post"."authorId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
  AND (SELECT nestmate_private.can_perform_safety_scoped_activity(
    "authorId", 'POST'::public."SafetyActivityScope"
  ))
)
WITH CHECK (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
  AND "publishedAt" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public."User" AS app_user
    WHERE app_user."id" = "Post"."authorId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM public."Community" AS locality_community
    WHERE locality_community."id" = "Post"."communityId"
      AND locality_community."isActive" = TRUE
  )
  AND (SELECT nestmate_private.can_perform_safety_scoped_activity(
    "authorId", 'POST'::public."SafetyActivityScope"
  ))
);

DROP POLICY IF EXISTS "conversation_participants_can_read_messages" ON public."Message";
CREATE POLICY "conversation_participants_can_read_messages"
ON public."Message"
FOR SELECT
TO authenticated
USING (
  nestmate_private.is_conversation_participant("conversationId")
  AND "moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
  AND (SELECT nestmate_private.is_user_content_visible("senderId"))
);

DROP POLICY IF EXISTS "Locality members can read unblocked community messages" ON public."CommunityMessage";
CREATE POLICY "Locality members can read unblocked community messages"
ON public."CommunityMessage"
FOR SELECT
TO authenticated
USING (
  (SELECT nestmate_private.is_community_member("communityId"))
  AND "moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
  AND (SELECT nestmate_private.is_user_content_visible("senderId"))
  AND NOT EXISTS (
    SELECT 1 FROM public."UserBlock" AS user_block
    WHERE user_block."blockerId" = (SELECT nestmate_private.current_nestmate_user_id())
      AND user_block."blockedId" = "CommunityMessage"."senderId"
  )
);

-- Refresh the private chat summaries so hidden messages and suspended members
-- cannot reappear through security-definer read helpers.
CREATE OR REPLACE FUNCTION nestmate_private.list_chat_users()
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
    AND nestmate_private.is_user_content_visible(nestmate_user."id")
    AND NOT EXISTS (
      SELECT 1 FROM public."UserBlock" AS user_block
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

CREATE OR REPLACE FUNCTION nestmate_private.get_my_conversations()
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
    COALESCE(latest_message."createdAt", conversation."lastMessageAt", conversation."createdAt"),
    (
      SELECT count(*)
      FROM public."Message" AS unread_message
      WHERE unread_message."conversationId" = conversation."id"
        AND unread_message."senderId" <> current_nestmate_user.id
        AND unread_message."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
        AND nestmate_private.is_user_content_visible(unread_message."senderId")
        AND unread_message."createdAt" > COALESCE(
          CASE WHEN conversation."participantOneId" = current_nestmate_user.id
            THEN conversation."participantOneLastReadAt"
            ELSE conversation."participantTwoLastReadAt" END,
          '-infinity'::TIMESTAMPTZ
        )
    )
  FROM current_nestmate_user
  JOIN public."Conversation" AS conversation
    ON current_nestmate_user.id IN (conversation."participantOneId", conversation."participantTwoId")
  JOIN public."User" AS other_user
    ON other_user."id" = CASE
      WHEN conversation."participantOneId" = current_nestmate_user.id
        THEN conversation."participantTwoId"
      ELSE conversation."participantOneId" END
  LEFT JOIN LATERAL (
    SELECT message."body", message."createdAt"
    FROM public."Message" AS message
    WHERE message."conversationId" = conversation."id"
      AND message."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
      AND nestmate_private.is_user_content_visible(message."senderId")
    ORDER BY message."createdAt" DESC, message."id" DESC
    LIMIT 1
  ) AS latest_message ON TRUE
  WHERE current_nestmate_user.id IS NOT NULL
    AND nestmate_private.is_user_content_visible(other_user."id")
    AND NOT EXISTS (
      SELECT 1 FROM public."UserBlock" AS user_block
      WHERE (
        user_block."blockerId" = current_nestmate_user.id
        AND user_block."blockedId" = other_user."id"
      ) OR (
        user_block."blockerId" = other_user."id"
        AND user_block."blockedId" = current_nestmate_user.id
      )
    )
  ORDER BY COALESCE(latest_message."createdAt", conversation."lastMessageAt", conversation."createdAt") DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION nestmate_private.list_chat_users()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.get_my_conversations()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.list_chat_users() TO authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.get_my_conversations() TO authenticated;

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
    RAISE EXCEPTION 'Locality community membership is required.' USING ERRCODE = '42501';
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
  INNER JOIN public."User" AS sender ON sender."id" = community_message."senderId"
  LEFT JOIN LATERAL (
    SELECT
      reply_target."id" AS reply_id,
      reply_sender."name" AS reply_sender_name,
      reply_target."body"::TEXT AS reply_body
    FROM public."CommunityMessage" AS reply_target
    INNER JOIN public."User" AS reply_sender ON reply_sender."id" = reply_target."senderId"
    WHERE reply_target."id" = community_message."replyToId"
      AND reply_target."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
      AND nestmate_private.is_user_content_visible(reply_target."senderId")
      AND NOT EXISTS (
        SELECT 1 FROM public."UserBlock" AS reply_block
        WHERE reply_block."blockerId" = current_user_id
          AND reply_block."blockedId" = reply_target."senderId"
      )
  ) AS reply_preview ON TRUE
  WHERE community_message."communityId" = target_community_id
    AND community_message."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
    AND nestmate_private.is_user_content_visible(community_message."senderId")
    AND (target_message_id IS NULL OR community_message."id" = target_message_id)
    AND NOT EXISTS (
      SELECT 1 FROM public."UserBlock" AS user_block
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

DROP POLICY IF EXISTS "Anyone can view valid listing images" ON storage.objects;
CREATE POLICY "Anyone can view valid listing images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'listing-images'
  AND EXISTS (
    SELECT 1 FROM public."Post" AS listing_post
    WHERE listing_post."id" = (storage.foldername(storage.objects.name))[2]
      AND listing_post."status" = 'ACTIVE'::public."PostStatus"
      AND listing_post."publishedAt" IS NOT NULL
      AND listing_post."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
      AND nestmate_private.is_user_content_visible(listing_post."authorId")
      AND listing_post."type" IN (
        'ROOM_AVAILABLE'::public."PostType",
        'PG_AVAILABLE'::public."PostType"
      )
      AND storage.objects.name = ANY(listing_post."imagePaths")
  )
);
