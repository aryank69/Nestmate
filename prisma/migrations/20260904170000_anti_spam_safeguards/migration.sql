-- Private, rules-based anti-spam activity and moderation flags. These tables
-- intentionally have no client-facing grants or RLS policies: only trusted
-- trigger functions may inspect or write detection details.
CREATE TYPE public."SafetyActivityScope" AS ENUM (
  'POST',
  'DIRECT_MESSAGE',
  'COMMUNITY_MESSAGE',
  'ALL'
);

CREATE TYPE public."SafetyFlagCategory" AS ENUM (
  'DUPLICATE_CONTENT',
  'BURST_ACTIVITY',
  'REPEATED_CONTACT',
  'RAPID_ACCOUNT_ACTIVITY',
  'USER_REPORT'
);

CREATE TYPE public."SafetyFlagSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE public."SafetyFlagStatus" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED');

CREATE TABLE public."SafetyActivity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorId" TEXT NOT NULL,
  "scope" public."SafetyActivityScope" NOT NULL,
  "targetType" public."ReportTargetType" NOT NULL,
  "targetId" VARCHAR(128) NOT NULL,
  "contentFingerprint" CHAR(32),
  "contactFingerprint" CHAR(32),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SafetyActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SafetyActivity_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE public."SafetyFlag" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorId" TEXT NOT NULL,
  "targetType" public."ReportTargetType" NOT NULL,
  "targetId" VARCHAR(128) NOT NULL,
  "category" public."SafetyFlagCategory" NOT NULL,
  "severity" public."SafetyFlagSeverity" NOT NULL DEFAULT 'LOW',
  "status" public."SafetyFlagStatus" NOT NULL DEFAULT 'OPEN',
  "scope" public."SafetyActivityScope" NOT NULL,
  "restrictedUntil" TIMESTAMPTZ(3),
  "relatedReportId" UUID,
  "dedupeKey" VARCHAR(200) NOT NULL,
  "privateDetails" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SafetyFlag_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SafetyFlag_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SafetyFlag_relatedReportId_fkey"
    FOREIGN KEY ("relatedReportId") REFERENCES public."Report"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SafetyActivity_actorId_scope_createdAt_idx"
ON public."SafetyActivity"("actorId", "scope", "createdAt" DESC);
CREATE INDEX "SafetyActivity_actorId_contentFingerprint_createdAt_idx"
ON public."SafetyActivity"("actorId", "contentFingerprint", "createdAt" DESC);
CREATE INDEX "SafetyActivity_actorId_contactFingerprint_createdAt_idx"
ON public."SafetyActivity"("actorId", "contactFingerprint", "createdAt" DESC);

CREATE UNIQUE INDEX "SafetyFlag_relatedReportId_key"
ON public."SafetyFlag"("relatedReportId");
CREATE UNIQUE INDEX "SafetyFlag_dedupeKey_key"
ON public."SafetyFlag"("dedupeKey");
CREATE INDEX "SafetyFlag_actorId_status_restrictedUntil_idx"
ON public."SafetyFlag"("actorId", "status", "restrictedUntil");
CREATE INDEX "SafetyFlag_targetType_targetId_status_idx"
ON public."SafetyFlag"("targetType", "targetId", "status");
CREATE INDEX "SafetyFlag_category_status_createdAt_idx"
ON public."SafetyFlag"("category", "status", "createdAt" DESC);

ALTER TABLE public."SafetyActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SafetyFlag" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."SafetyActivity"
FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."SafetyFlag"
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TYPE public."SafetyFlagCategory" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TYPE public."SafetyFlagSeverity" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TYPE public."SafetyFlagStatus" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TYPE public."SafetyActivityScope" FROM PUBLIC, anon, authenticated;
GRANT USAGE ON TYPE public."SafetyActivityScope" TO authenticated;

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

CREATE OR REPLACE FUNCTION nestmate_private.upsert_safety_flag(
  target_actor_id TEXT,
  target_type public."ReportTargetType",
  target_id TEXT,
  flag_category public."SafetyFlagCategory",
  flag_severity public."SafetyFlagSeverity",
  activity_scope public."SafetyActivityScope",
  restriction_ends_at TIMESTAMPTZ,
  flag_dedupe_key TEXT,
  details JSONB,
  related_report_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."SafetyFlag" (
    "actorId",
    "targetType",
    "targetId",
    "category",
    "severity",
    "status",
    "scope",
    "restrictedUntil",
    "relatedReportId",
    "dedupeKey",
    "privateDetails"
  )
  VALUES (
    target_actor_id,
    target_type,
    target_id,
    flag_category,
    flag_severity,
    'OPEN'::public."SafetyFlagStatus",
    activity_scope,
    restriction_ends_at,
    related_report_id,
    left(flag_dedupe_key, 200),
    details
  )
  ON CONFLICT ("dedupeKey") DO UPDATE
  SET
    "targetType" = EXCLUDED."targetType",
    "targetId" = EXCLUDED."targetId",
    "severity" = CASE
      WHEN EXCLUDED."severity" = 'HIGH'::public."SafetyFlagSeverity"
        OR public."SafetyFlag"."severity" = 'HIGH'::public."SafetyFlagSeverity"
        THEN 'HIGH'::public."SafetyFlagSeverity"
      WHEN EXCLUDED."severity" = 'MEDIUM'::public."SafetyFlagSeverity"
        OR public."SafetyFlag"."severity" = 'MEDIUM'::public."SafetyFlagSeverity"
        THEN 'MEDIUM'::public."SafetyFlagSeverity"
      ELSE 'LOW'::public."SafetyFlagSeverity"
    END,
    "status" = 'OPEN'::public."SafetyFlagStatus",
    "scope" = EXCLUDED."scope",
    "restrictedUntil" = CASE
      WHEN public."SafetyFlag"."restrictedUntil" IS NULL THEN EXCLUDED."restrictedUntil"
      WHEN EXCLUDED."restrictedUntil" IS NULL THEN public."SafetyFlag"."restrictedUntil"
      ELSE greatest(public."SafetyFlag"."restrictedUntil", EXCLUDED."restrictedUntil")
    END,
    "privateDetails" = EXCLUDED."privateDetails",
    "updatedAt" = CURRENT_TIMESTAMP;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.upsert_safety_flag(
  TEXT,
  public."ReportTargetType",
  TEXT,
  public."SafetyFlagCategory",
  public."SafetyFlagSeverity",
  public."SafetyActivityScope",
  TIMESTAMPTZ,
  TEXT,
  JSONB,
  UUID
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION nestmate_private.record_safety_activity(
  target_actor_id TEXT,
  activity_scope public."SafetyActivityScope",
  target_type public."ReportTargetType",
  target_id TEXT,
  raw_content TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_content TEXT;
  extracted_contact TEXT;
  content_fingerprint CHAR(32);
  contact_fingerprint CHAR(32);
  duplicate_count INTEGER := 0;
  contact_count INTEGER := 0;
  burst_count INTEGER := 0;
  recent_account_activity_count INTEGER := 0;
  duplicate_limit INTEGER;
  burst_limit INTEGER;
  burst_window INTERVAL;
  restriction_duration INTERVAL;
BEGIN
  IF target_actor_id IS NULL OR target_id IS NULL THEN
    RETURN;
  END IF;

  normalized_content := lower(
    regexp_replace(btrim(coalesce(raw_content, '')), '[[:space:]]+', ' ', 'g')
  );

  IF char_length(normalized_content) >= 20 THEN
    content_fingerprint := md5(normalized_content);
  END IF;

  extracted_contact := substring(
    raw_content FROM '(?i)(https?://[^[:space:]]+|www\.[^[:space:]]+|[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}|(?:\+?91[[:space:]\-]?)?[6-9][0-9[:space:]\-]{8,12})'
  );

  IF extracted_contact IS NOT NULL THEN
    contact_fingerprint := md5(
      lower(regexp_replace(extracted_contact, '[[:space:]\-]+', '', 'g'))
    );
  END IF;

  INSERT INTO public."SafetyActivity" (
    "actorId",
    "scope",
    "targetType",
    "targetId",
    "contentFingerprint",
    "contactFingerprint"
  )
  VALUES (
    target_actor_id,
    activity_scope,
    target_type,
    left(target_id, 128),
    content_fingerprint,
    contact_fingerprint
  );

  IF activity_scope = 'POST'::public."SafetyActivityScope" THEN
    duplicate_limit := 2;
    burst_limit := 5;
    burst_window := INTERVAL '30 minutes';
    restriction_duration := INTERVAL '1 hour';
  ELSIF activity_scope = 'DIRECT_MESSAGE'::public."SafetyActivityScope" THEN
    duplicate_limit := 3;
    burst_limit := 20;
    burst_window := INTERVAL '5 minutes';
    restriction_duration := INTERVAL '15 minutes';
  ELSE
    duplicate_limit := 3;
    burst_limit := 25;
    burst_window := INTERVAL '5 minutes';
    restriction_duration := INTERVAL '15 minutes';
  END IF;

  IF content_fingerprint IS NOT NULL THEN
    SELECT count(*) INTO duplicate_count
    FROM public."SafetyActivity" AS activity
    WHERE activity."actorId" = target_actor_id
      AND activity."scope" = activity_scope
      AND activity."contentFingerprint" = content_fingerprint
      AND activity."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours';

    IF duplicate_count >= duplicate_limit THEN
      PERFORM nestmate_private.upsert_safety_flag(
        target_actor_id,
        target_type,
        target_id,
        'DUPLICATE_CONTENT'::public."SafetyFlagCategory",
        'MEDIUM'::public."SafetyFlagSeverity",
        activity_scope,
        CURRENT_TIMESTAMP + restriction_duration,
        target_actor_id || ':duplicate:' || activity_scope::TEXT || ':' || content_fingerprint,
        jsonb_build_object('count', duplicate_count, 'lookback', '24 hours')
      );
    END IF;
  END IF;

  IF contact_fingerprint IS NOT NULL THEN
    SELECT count(*) INTO contact_count
    FROM public."SafetyActivity" AS activity
    WHERE activity."actorId" = target_actor_id
      AND activity."scope" = activity_scope
      AND activity."contactFingerprint" = contact_fingerprint
      AND activity."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours';

    IF contact_count >= (CASE
      WHEN activity_scope = 'POST'::public."SafetyActivityScope" THEN 2
      ELSE 3
    END) THEN
      PERFORM nestmate_private.upsert_safety_flag(
        target_actor_id,
        target_type,
        target_id,
        'REPEATED_CONTACT'::public."SafetyFlagCategory",
        'MEDIUM'::public."SafetyFlagSeverity",
        activity_scope,
        CURRENT_TIMESTAMP + restriction_duration,
        target_actor_id || ':contact:' || activity_scope::TEXT || ':' || contact_fingerprint,
        jsonb_build_object('count', contact_count, 'lookback', '24 hours')
      );
    END IF;
  END IF;

  SELECT count(*) INTO burst_count
  FROM public."SafetyActivity" AS activity
  WHERE activity."actorId" = target_actor_id
    AND activity."scope" = activity_scope
    AND activity."createdAt" >= CURRENT_TIMESTAMP - burst_window;

  IF burst_count >= burst_limit THEN
    PERFORM nestmate_private.upsert_safety_flag(
      target_actor_id,
      target_type,
      target_id,
      'BURST_ACTIVITY'::public."SafetyFlagCategory",
      'MEDIUM'::public."SafetyFlagSeverity",
      activity_scope,
      CURRENT_TIMESTAMP + restriction_duration,
      target_actor_id || ':burst:' || activity_scope::TEXT,
      jsonb_build_object('count', burst_count, 'lookback', burst_window::TEXT)
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = target_actor_id
      AND app_user."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  ) THEN
    SELECT count(*) INTO recent_account_activity_count
    FROM public."SafetyActivity" AS activity
    WHERE activity."actorId" = target_actor_id
      AND activity."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '10 minutes';

    IF recent_account_activity_count >= 15 THEN
      PERFORM nestmate_private.upsert_safety_flag(
        target_actor_id,
        target_type,
        target_id,
        'RAPID_ACCOUNT_ACTIVITY'::public."SafetyFlagCategory",
        'HIGH'::public."SafetyFlagSeverity",
        'ALL'::public."SafetyActivityScope",
        CURRENT_TIMESTAMP + INTERVAL '30 minutes',
        target_actor_id || ':rapid-account-activity',
        jsonb_build_object(
          'count', recent_account_activity_count,
          'lookback', '10 minutes',
          'accountAgeWindow', '24 hours'
        )
      );
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.record_safety_activity(
  TEXT,
  public."SafetyActivityScope",
  public."ReportTargetType",
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION nestmate_private.record_post_safety_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM nestmate_private.record_safety_activity(
    NEW."authorId",
    'POST'::public."SafetyActivityScope",
    'POST'::public."ReportTargetType",
    NEW."id",
    NEW."title" || E'\n' || NEW."description"
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION nestmate_private.record_direct_message_safety_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM nestmate_private.record_safety_activity(
    NEW."senderId",
    'DIRECT_MESSAGE'::public."SafetyActivityScope",
    'DIRECT_MESSAGE'::public."ReportTargetType",
    NEW."id"::TEXT,
    NEW."body"
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION nestmate_private.record_community_message_safety_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM nestmate_private.record_safety_activity(
    NEW."senderId",
    'COMMUNITY_MESSAGE'::public."SafetyActivityScope",
    'COMMUNITY_MESSAGE'::public."ReportTargetType",
    NEW."id"::TEXT,
    NEW."body"
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION nestmate_private.flag_submitted_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM nestmate_private.upsert_safety_flag(
    NEW."reportedUserId",
    NEW."targetType",
    NEW."targetId",
    'USER_REPORT'::public."SafetyFlagCategory",
    'LOW'::public."SafetyFlagSeverity",
    CASE NEW."targetType"
      WHEN 'POST'::public."ReportTargetType"
        THEN 'POST'::public."SafetyActivityScope"
      WHEN 'DIRECT_MESSAGE'::public."ReportTargetType"
        THEN 'DIRECT_MESSAGE'::public."SafetyActivityScope"
      WHEN 'COMMUNITY_MESSAGE'::public."ReportTargetType"
        THEN 'COMMUNITY_MESSAGE'::public."SafetyActivityScope"
      ELSE 'ALL'::public."SafetyActivityScope"
    END,
    NULL,
    'report:' || NEW."id"::TEXT,
    jsonb_build_object(
      'reason', NEW."reason"::TEXT,
      'reporterId', NEW."reporterId"
    ),
    NEW."id"
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.record_post_safety_activity()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.record_direct_message_safety_activity()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.record_community_message_safety_activity()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.flag_submitted_report()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "Post_record_safety_activity"
AFTER INSERT ON public."Post"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.record_post_safety_activity();

CREATE TRIGGER "Message_record_safety_activity"
AFTER INSERT ON public."Message"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.record_direct_message_safety_activity();

CREATE TRIGGER "CommunityMessage_record_safety_activity"
AFTER INSERT ON public."CommunityMessage"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.record_community_message_safety_activity();

CREATE TRIGGER "Report_create_safety_flag"
AFTER INSERT ON public."Report"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.flag_submitted_report();

-- Preserve all existing ownership/membership checks and add only the private,
-- scoped restriction predicate. Restrictions expire automatically.
DROP POLICY IF EXISTS "Users can create their own community posts" ON public."Post";
CREATE POLICY "Users can create their own community posts"
ON public."Post"
FOR INSERT
TO authenticated
WITH CHECK (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "availabilityStatus" = 'AVAILABLE'::public."ListingAvailabilityStatus"
  AND "publishedAt" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "Post"."authorId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public."Community" AS locality_community
    WHERE locality_community."id" = "Post"."communityId"
      AND locality_community."isActive" = TRUE
  )
  AND (SELECT nestmate_private.can_perform_safety_scoped_activity(
    "authorId",
    'POST'::public."SafetyActivityScope"
  ))
);

DROP POLICY IF EXISTS "conversation_participants_can_send_messages"
ON public."Message";
CREATE POLICY "conversation_participants_can_send_messages"
ON public."Message"
FOR INSERT
TO authenticated
WITH CHECK (
  nestmate_private.is_conversation_participant("conversationId")
  AND "senderId" = nestmate_private.current_nestmate_user_id()
  AND (SELECT nestmate_private.can_perform_safety_scoped_activity(
    "senderId",
    'DIRECT_MESSAGE'::public."SafetyActivityScope"
  ))
);

DROP POLICY IF EXISTS "Locality members can send community messages"
ON public."CommunityMessage";
CREATE POLICY "Locality members can send community messages"
ON public."CommunityMessage"
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT nestmate_private.is_community_member("communityId"))
  AND "senderId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_perform_safety_scoped_activity(
    "senderId",
    'COMMUNITY_MESSAGE'::public."SafetyActivityScope"
  ))
);
