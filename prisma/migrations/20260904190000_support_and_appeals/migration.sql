-- Private user support and appeal cases with moderator-only notes and audited
-- status management. Cases are visible only to their owner and moderators.
ALTER TYPE public."NotificationType"
ADD VALUE IF NOT EXISTS 'SUPPORT_CASE_UPDATE';
ALTER TYPE public."ModerationActionType"
ADD VALUE IF NOT EXISTS 'SUPPORT_CASE_UPDATE';
ALTER TYPE public."ModerationQueueType"
ADD VALUE IF NOT EXISTS 'SUPPORT_CASE';

CREATE TYPE public."SupportCaseCategory" AS ENUM (
  'GENERAL_SUPPORT',
  'ACCOUNT_ACCESS',
  'CONTENT_APPEAL',
  'RESTRICTION_APPEAL',
  'SAFETY_CONCERN',
  'TECHNICAL_ISSUE'
);
CREATE TYPE public."SupportCaseStatus" AS ENUM (
  'OPEN',
  'UNDER_REVIEW',
  'RESOLVED',
  'REJECTED'
);
CREATE TYPE public."SupportMessageRole" AS ENUM ('USER', 'MODERATOR');

CREATE TABLE public."SupportCase" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "category" public."SupportCaseCategory" NOT NULL,
  "subject" VARCHAR(120) NOT NULL,
  "description" VARCHAR(2000) NOT NULL,
  "reference" VARCHAR(200),
  "status" public."SupportCaseStatus" NOT NULL DEFAULT 'OPEN',
  "lastResponseAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportCase_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportCase_subject_check"
    CHECK (char_length(btrim("subject")) BETWEEN 5 AND 120),
  CONSTRAINT "SupportCase_description_check"
    CHECK (char_length(btrim("description")) BETWEEN 20 AND 2000),
  CONSTRAINT "SupportCase_reference_check"
    CHECK ("reference" IS NULL OR char_length(btrim("reference")) BETWEEN 1 AND 200)
);

CREATE TABLE public."SupportCaseMessage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "caseId" UUID NOT NULL,
  "senderId" TEXT NOT NULL,
  "senderRole" public."SupportMessageRole" NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupportCaseMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportCaseMessage_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES public."SupportCase"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportCaseMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupportCaseMessage_body_check"
    CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000)
);

CREATE TABLE public."SupportCaseInternalNote" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "caseId" UUID NOT NULL,
  "moderatorId" TEXT NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupportCaseInternalNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportCaseInternalNote_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES public."SupportCase"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportCaseInternalNote_moderatorId_fkey"
    FOREIGN KEY ("moderatorId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupportCaseInternalNote_body_check"
    CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000)
);

CREATE INDEX "SupportCase_userId_status_updatedAt_idx"
ON public."SupportCase"("userId", "status", "updatedAt" DESC);
CREATE INDEX "SupportCase_status_updatedAt_idx"
ON public."SupportCase"("status", "updatedAt" DESC);
CREATE INDEX "SupportCaseMessage_caseId_createdAt_id_idx"
ON public."SupportCaseMessage"("caseId", "createdAt", "id");
CREATE INDEX "SupportCaseMessage_senderId_createdAt_idx"
ON public."SupportCaseMessage"("senderId", "createdAt" DESC);
CREATE INDEX "SupportCaseInternalNote_caseId_createdAt_id_idx"
ON public."SupportCaseInternalNote"("caseId", "createdAt", "id");
CREATE INDEX "SupportCaseInternalNote_moderatorId_createdAt_idx"
ON public."SupportCaseInternalNote"("moderatorId", "createdAt" DESC);

CREATE OR REPLACE FUNCTION nestmate_private.touch_support_case_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public."SupportCase"
  SET "updatedAt" = NEW."createdAt",
      "lastResponseAt" = CASE
        WHEN NEW."senderRole" = 'MODERATOR'::public."SupportMessageRole"
          THEN NEW."createdAt"
        ELSE "lastResponseAt"
      END
  WHERE "id" = NEW."caseId";
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.touch_support_case_on_message()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "SupportCaseMessage_touch_case"
AFTER INSERT ON public."SupportCaseMessage"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.touch_support_case_on_message();

ALTER TABLE public."SupportCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SupportCaseMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SupportCaseInternalNote" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."SupportCase"
FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."SupportCaseMessage"
FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."SupportCaseInternalNote"
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE public."SupportCase" TO authenticated;
GRANT SELECT, INSERT ON TABLE public."SupportCaseMessage" TO authenticated;
GRANT SELECT ON TABLE public."SupportCaseInternalNote" TO authenticated;

REVOKE ALL ON TYPE public."SupportCaseCategory" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TYPE public."SupportCaseStatus" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TYPE public."SupportMessageRole" FROM PUBLIC, anon, authenticated;
GRANT USAGE ON TYPE public."SupportCaseCategory" TO authenticated;
GRANT USAGE ON TYPE public."SupportCaseStatus" TO authenticated;
GRANT USAGE ON TYPE public."SupportMessageRole" TO authenticated;

CREATE POLICY "Users and moderators can read support cases"
ON public."SupportCase"
FOR SELECT
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  OR (SELECT nestmate_private.is_current_moderator(FALSE))
);

CREATE POLICY "Users can create their own open support cases"
ON public."SupportCase"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND "status" = 'OPEN'::public."SupportCaseStatus"
);

CREATE POLICY "Case owners and moderators can read support messages"
ON public."SupportCaseMessage"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."SupportCase" AS support_case
    WHERE support_case."id" = "caseId"
      AND (
        support_case."userId" = (SELECT nestmate_private.current_nestmate_user_id())
        OR (SELECT nestmate_private.is_current_moderator(FALSE))
      )
  )
);

CREATE POLICY "Case owners can reply to active support cases"
ON public."SupportCaseMessage"
FOR INSERT
TO authenticated
WITH CHECK (
  "senderId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND "senderRole" = 'USER'::public."SupportMessageRole"
  AND EXISTS (
    SELECT 1
    FROM public."SupportCase" AS support_case
    WHERE support_case."id" = "caseId"
      AND support_case."userId" = "senderId"
      AND support_case."status" IN (
        'OPEN'::public."SupportCaseStatus",
        'UNDER_REVIEW'::public."SupportCaseStatus"
      )
  )
);

CREATE POLICY "Moderators can read support case internal notes"
ON public."SupportCaseInternalNote"
FOR SELECT
TO authenticated
USING ((SELECT nestmate_private.is_current_moderator(FALSE)));

CREATE OR REPLACE FUNCTION nestmate_private.manage_support_case(
  requested_case_id UUID,
  requested_status TEXT,
  response_body TEXT DEFAULT NULL,
  internal_note_body TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  moderator_id TEXT := nestmate_private.current_nestmate_user_id();
  case_owner_id TEXT;
  current_status public."SupportCaseStatus";
  next_status public."SupportCaseStatus";
  clean_response TEXT := NULLIF(btrim(response_body), '');
  clean_note TEXT := NULLIF(btrim(internal_note_body), '');
  audit_id UUID := gen_random_uuid();
BEGIN
  IF moderator_id IS NULL OR NOT nestmate_private.is_current_moderator(FALSE) THEN
    RAISE EXCEPTION 'Moderator access is required' USING ERRCODE = '42501';
  END IF;

  IF requested_status NOT IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Invalid support case status' USING ERRCODE = '22023';
  END IF;
  next_status := requested_status::public."SupportCaseStatus";

  IF clean_response IS NOT NULL AND char_length(clean_response) > 2000 THEN
    RAISE EXCEPTION 'Response is too long' USING ERRCODE = '22001';
  END IF;
  IF clean_note IS NOT NULL AND char_length(clean_note) > 2000 THEN
    RAISE EXCEPTION 'Internal note is too long' USING ERRCODE = '22001';
  END IF;

  SELECT support_case."userId", support_case."status"
  INTO case_owner_id, current_status
  FROM public."SupportCase" AS support_case
  WHERE support_case."id" = requested_case_id
  FOR UPDATE;

  IF case_owner_id IS NULL THEN
    RAISE EXCEPTION 'Support case was not found' USING ERRCODE = 'P0002';
  END IF;
  IF case_owner_id = moderator_id THEN
    RAISE EXCEPTION 'Moderators cannot manage their own case' USING ERRCODE = '42501';
  END IF;
  IF next_status = current_status AND clean_response IS NULL AND clean_note IS NULL THEN
    RAISE EXCEPTION 'No support case change was supplied' USING ERRCODE = '22023';
  END IF;

  UPDATE public."SupportCase"
  SET "status" = next_status,
      "lastResponseAt" = CASE
        WHEN clean_response IS NOT NULL THEN CURRENT_TIMESTAMP
        ELSE "lastResponseAt"
      END,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = requested_case_id;

  IF clean_response IS NOT NULL THEN
    INSERT INTO public."SupportCaseMessage" (
      "caseId", "senderId", "senderRole", "body"
    ) VALUES (
      requested_case_id,
      moderator_id,
      'MODERATOR'::public."SupportMessageRole",
      clean_response
    );
  END IF;

  IF clean_note IS NOT NULL THEN
    INSERT INTO public."SupportCaseInternalNote" (
      "caseId", "moderatorId", "body"
    ) VALUES (requested_case_id, moderator_id, clean_note);
  END IF;

  INSERT INTO public."Notification" (
    "recipientId",
    "actorId",
    "type",
    "title",
    "body",
    "href",
    "resourceId"
  ) VALUES (
    case_owner_id,
    moderator_id,
    'SUPPORT_CASE_UPDATE'::public."NotificationType",
    'Your support case was updated',
    CASE
      WHEN next_status = 'UNDER_REVIEW'::public."SupportCaseStatus"
        THEN 'The NestMate team is reviewing your case.'
      WHEN next_status = 'RESOLVED'::public."SupportCaseStatus"
        THEN 'Your support case has been resolved.'
      WHEN next_status = 'REJECTED'::public."SupportCaseStatus"
        THEN 'A decision has been recorded for your support case.'
      ELSE 'There is an update on your support case.'
    END,
    '/support/' || requested_case_id::TEXT,
    requested_case_id::TEXT
  )
  ON CONFLICT ("recipientId", "type", "resourceId", "actorId")
  DO UPDATE SET
    "title" = EXCLUDED."title",
    "body" = EXCLUDED."body",
    "href" = EXCLUDED."href",
    "readAt" = NULL,
    "createdAt" = CURRENT_TIMESTAMP;

  INSERT INTO public."ModerationAuditLog" (
    "id",
    "moderatorId",
    "action",
    "queueType",
    "queueId",
    "subjectUserId",
    "targetType",
    "targetId",
    "reason",
    "privateDetails"
  ) VALUES (
    audit_id,
    moderator_id,
    'SUPPORT_CASE_UPDATE'::public."ModerationActionType",
    'SUPPORT_CASE'::public."ModerationQueueType",
    requested_case_id::TEXT,
    case_owner_id,
    'SUPPORT_CASE',
    requested_case_id::TEXT,
    COALESCE(left(clean_note, 500), 'Support case status updated to ' || requested_status),
    jsonb_build_object(
      'previousStatus', current_status::TEXT,
      'newStatus', next_status::TEXT,
      'responseAdded', clean_response IS NOT NULL,
      'internalNoteAdded', clean_note IS NOT NULL
    )
  );

  RETURN audit_id;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.manage_support_case(
  UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.manage_support_case(
  UUID, TEXT, TEXT, TEXT
) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_support_case(
  requested_case_id UUID,
  requested_status TEXT,
  response_body TEXT DEFAULT NULL,
  internal_note_body TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nestmate_private.manage_support_case(
    requested_case_id,
    requested_status,
    response_body,
    internal_note_body
  );
$$;

REVOKE ALL ON FUNCTION public.manage_support_case(
  UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_support_case(
  UUID, TEXT, TEXT, TEXT
) TO authenticated;
