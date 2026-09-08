CREATE TYPE public."FinalizedMatchStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CLOSED');
CREATE TYPE public."MatchClosureReason" AS ENUM (
  'MOVE_IN_COMPLETED',
  'MOVE_IN_CANCELLED',
  'CREATED_BY_MISTAKE',
  'ARCHIVED'
);

ALTER TABLE public."FinalizedDocumentSpace"
  ADD COLUMN "status" public."FinalizedMatchStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "statusBeforeClose" public."FinalizedMatchStatus",
  ADD COLUMN "closureReason" public."MatchClosureReason",
  ADD COLUMN "completedAt" TIMESTAMPTZ(3),
  ADD COLUMN "closedAt" TIMESTAMPTZ(3),
  ADD COLUMN "reopenedAt" TIMESTAMPTZ(3),
  ADD COLUMN "closedById" TEXT,
  ADD CONSTRAINT "FinalizedDocumentSpace_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES public."User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FinalizedDocumentSpace_lifecycle_check" CHECK (
    (
      "status" = 'ACTIVE'::public."FinalizedMatchStatus"
      AND "closedAt" IS NULL AND "closedById" IS NULL
      AND "closureReason" IS NULL AND "statusBeforeClose" IS NULL
      AND "completedAt" IS NULL
    ) OR (
      "status" = 'COMPLETED'::public."FinalizedMatchStatus"
      AND "closedAt" IS NULL AND "closedById" IS NULL
      AND "closureReason" IS NULL AND "statusBeforeClose" IS NULL
      AND "completedAt" IS NOT NULL
    ) OR (
      "status" = 'CLOSED'::public."FinalizedMatchStatus"
      AND "closedAt" IS NOT NULL AND "closedById" IS NOT NULL
      AND "closureReason" IS NOT NULL
      AND "statusBeforeClose" IN (
        'ACTIVE'::public."FinalizedMatchStatus",
        'COMPLETED'::public."FinalizedMatchStatus"
      )
    )
  );

CREATE INDEX "FinalizedDocumentSpace_status_updatedAt_idx"
ON public."FinalizedDocumentSpace"("status", "updatedAt" DESC);
CREATE INDEX "FinalizedDocumentSpace_closedById_idx"
ON public."FinalizedDocumentSpace"("closedById");

CREATE TABLE public."FinalizedMatchStatusChange" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "spaceId" UUID NOT NULL,
  "actorId" TEXT,
  "fromStatus" public."FinalizedMatchStatus" NOT NULL,
  "toStatus" public."FinalizedMatchStatus" NOT NULL,
  "reason" public."MatchClosureReason",
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinalizedMatchStatusChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinalizedMatchStatusChange_changed_check" CHECK ("fromStatus" <> "toStatus"),
  CONSTRAINT "FinalizedMatchStatusChange_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES public."FinalizedDocumentSpace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinalizedMatchStatusChange_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES public."User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "FinalizedMatchStatusChange_spaceId_createdAt_idx"
ON public."FinalizedMatchStatusChange"("spaceId", "createdAt" DESC);
CREATE INDEX "FinalizedMatchStatusChange_actorId_createdAt_idx"
ON public."FinalizedMatchStatusChange"("actorId", "createdAt" DESC);

ALTER TABLE public."FinalizedMatchStatusChange" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."FinalizedMatchStatusChange"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."FinalizedMatchStatusChange" TO authenticated;
GRANT UPDATE ("status", "closureReason")
ON TABLE public."FinalizedDocumentSpace" TO authenticated;
REVOKE ALL ON TYPE public."FinalizedMatchStatus" FROM PUBLIC;
REVOKE ALL ON TYPE public."MatchClosureReason" FROM PUBLIC;
GRANT USAGE ON TYPE public."FinalizedMatchStatus" TO authenticated;
GRANT USAGE ON TYPE public."MatchClosureReason" TO authenticated;

-- Preserve the original active-finalization predicate, then wrap it with archive access.
ALTER FUNCTION nestmate_private.can_access_finalized_document_space(UUID)
RENAME TO can_access_active_finalized_document_space;
REVOKE ALL ON FUNCTION nestmate_private.can_access_active_finalized_document_space(UUID)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.can_access_finalized_document_space(target_space_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  space_record public."FinalizedDocumentSpace"%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN RETURN FALSE; END IF;
  SELECT * INTO space_record
  FROM public."FinalizedDocumentSpace"
  WHERE "id" = target_space_id
    AND current_user_id IN ("participantOneId", "participantTwoId");
  IF NOT FOUND
    OR NOT nestmate_private.is_user_content_visible(space_record."participantOneId")
    OR NOT nestmate_private.is_user_content_visible(space_record."participantTwoId")
    OR EXISTS (
      SELECT 1 FROM public."UserBlock" AS block
      WHERE (block."blockerId", block."blockedId") IN (
        (space_record."participantOneId", space_record."participantTwoId"),
        (space_record."participantTwoId", space_record."participantOneId")
      )
    ) THEN
    RETURN FALSE;
  END IF;
  IF space_record."status" = 'CLOSED'::public."FinalizedMatchStatus" THEN
    RETURN TRUE;
  END IF;
  RETURN nestmate_private.can_access_active_finalized_document_space(target_space_id);
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.can_access_finalized_document_space(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_finalized_document_space(UUID)
TO authenticated;

CREATE FUNCTION nestmate_private.can_manage_finalized_document_space(target_space_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."FinalizedDocumentSpace" AS space
    WHERE space."id" = target_space_id
      AND space."status" <> 'CLOSED'::public."FinalizedMatchStatus"
      AND nestmate_private.can_access_finalized_document_space(space."id")
  );
$$;
REVOKE ALL ON FUNCTION nestmate_private.can_manage_finalized_document_space(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_manage_finalized_document_space(UUID)
TO authenticated;

CREATE FUNCTION nestmate_private.validate_finalized_match_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  internal_update BOOLEAN := current_setting('nestmate.internal_match_lifecycle_update', TRUE) = 'true';
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."targetType" IS DISTINCT FROM OLD."targetType"
    OR NEW."postId" IS DISTINCT FROM OLD."postId"
    OR NEW."targetUserId" IS DISTINCT FROM OLD."targetUserId"
    OR NEW."participantOneId" IS DISTINCT FROM OLD."participantOneId"
    OR NEW."participantTwoId" IS DISTINCT FROM OLD."participantTwoId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Finalized match identity cannot be changed.' USING ERRCODE = '42501';
  END IF;

  IF internal_update THEN
    IF OLD."status" = 'CLOSED'::public."FinalizedMatchStatus"
      OR NEW."status" NOT IN (
        'ACTIVE'::public."FinalizedMatchStatus",
        'COMPLETED'::public."FinalizedMatchStatus"
      ) THEN
      RAISE EXCEPTION 'Closed matches cannot be changed automatically.' USING ERRCODE = '42501';
    END IF;
    NEW."completedAt" := CASE
      WHEN NEW."status" = 'COMPLETED'::public."FinalizedMatchStatus"
        THEN COALESCE(OLD."completedAt", CURRENT_TIMESTAMP)
      ELSE NULL
    END;
    NEW."closedAt" := NULL;
    NEW."closedById" := NULL;
    NEW."closureReason" := NULL;
    NEW."statusBeforeClose" := NULL;
    NEW."updatedAt" := CURRENT_TIMESTAMP;
    RETURN NEW;
  END IF;

  IF current_user_id IS NULL
    OR current_user_id NOT IN (OLD."participantOneId", OLD."participantTwoId")
    OR NOT nestmate_private.can_access_finalized_document_space(OLD."id") THEN
    RAISE EXCEPTION 'This finalized match is private or unavailable.' USING ERRCODE = '42501';
  END IF;

  IF OLD."status" <> 'CLOSED'::public."FinalizedMatchStatus"
    AND NEW."status" = 'CLOSED'::public."FinalizedMatchStatus" THEN
    IF NEW."closureReason" IS NULL
      OR (NEW."closureReason" = 'MOVE_IN_COMPLETED'::public."MatchClosureReason"
          AND OLD."status" <> 'COMPLETED'::public."FinalizedMatchStatus") THEN
      RAISE EXCEPTION 'Choose a valid reason for closing this match.' USING ERRCODE = '22023';
    END IF;
    NEW."statusBeforeClose" := OLD."status";
    NEW."closedAt" := CURRENT_TIMESTAMP;
    NEW."closedById" := current_user_id;
    NEW."completedAt" := OLD."completedAt";
    NEW."updatedAt" := CURRENT_TIMESTAMP;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'CLOSED'::public."FinalizedMatchStatus"
    AND NEW."status" <> 'CLOSED'::public."FinalizedMatchStatus" THEN
    IF OLD."closedById" <> current_user_id
      OR OLD."closedAt" < CURRENT_TIMESTAMP - INTERVAL '7 days'
      OR OLD."closureReason" NOT IN (
        'MOVE_IN_CANCELLED'::public."MatchClosureReason",
        'CREATED_BY_MISTAKE'::public."MatchClosureReason"
      )
      OR NEW."status" IS DISTINCT FROM OLD."statusBeforeClose" THEN
      RAISE EXCEPTION 'Only the participant who closed this match can reopen it within seven days.'
        USING ERRCODE = '42501';
    END IF;
    NEW."completedAt" := CASE
      WHEN NEW."status" = 'COMPLETED'::public."FinalizedMatchStatus"
        THEN OLD."completedAt"
      ELSE NULL
    END;
    NEW."statusBeforeClose" := NULL;
    NEW."closureReason" := NULL;
    NEW."closedAt" := NULL;
    NEW."closedById" := NULL;
    NEW."reopenedAt" := CURRENT_TIMESTAMP;
    NEW."updatedAt" := CURRENT_TIMESTAMP;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Use the supported close or reopen transition.' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_finalized_match_lifecycle()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_finalized_match_lifecycle_before_update"
BEFORE UPDATE OF "status", "closureReason" ON public."FinalizedDocumentSpace"
FOR EACH ROW EXECUTE FUNCTION nestmate_private.validate_finalized_match_lifecycle();

CREATE FUNCTION nestmate_private.audit_finalized_match_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    INSERT INTO public."FinalizedMatchStatusChange" (
      "spaceId", "actorId", "fromStatus", "toStatus", "reason"
    ) VALUES (
      NEW."id", nestmate_private.current_nestmate_user_id(),
      OLD."status", NEW."status",
      CASE WHEN NEW."status" = 'CLOSED'::public."FinalizedMatchStatus"
        THEN NEW."closureReason" ELSE OLD."closureReason" END
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.audit_finalized_match_lifecycle()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "audit_finalized_match_lifecycle_after_update"
AFTER UPDATE OF "status" ON public."FinalizedDocumentSpace"
FOR EACH ROW EXECUTE FUNCTION nestmate_private.audit_finalized_match_lifecycle();

CREATE FUNCTION nestmate_private.sync_match_completion_from_milestones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE both_completed BOOLEAN;
BEGIN
  IF NEW."kind" <> 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind" THEN
    RETURN NEW;
  END IF;
  SELECT count(*) = 2 INTO both_completed
  FROM public."FinalizedMatchMilestone" AS milestone
  WHERE milestone."spaceId" = NEW."spaceId"
    AND milestone."kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind"
    AND milestone."status" = 'COMPLETED'::public."FinalizedMilestoneStatus";
  PERFORM set_config('nestmate.internal_match_lifecycle_update', 'true', TRUE);
  UPDATE public."FinalizedDocumentSpace"
  SET "status" = CASE WHEN both_completed
        THEN 'COMPLETED'::public."FinalizedMatchStatus"
        ELSE 'ACTIVE'::public."FinalizedMatchStatus" END
  WHERE "id" = NEW."spaceId"
    AND "status" <> 'CLOSED'::public."FinalizedMatchStatus"
    AND "status" IS DISTINCT FROM CASE WHEN both_completed
        THEN 'COMPLETED'::public."FinalizedMatchStatus"
        ELSE 'ACTIVE'::public."FinalizedMatchStatus" END;
  PERFORM set_config('nestmate.internal_match_lifecycle_update', 'false', TRUE);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.sync_match_completion_from_milestones()
FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "sync_match_completion_from_milestones_after_write"
AFTER INSERT OR UPDATE OF "status" ON public."FinalizedMatchMilestone"
FOR EACH ROW EXECUTE FUNCTION nestmate_private.sync_match_completion_from_milestones();

CREATE POLICY "Participants can read finalized match status history"
ON public."FinalizedMatchStatusChange" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_finalized_document_space("spaceId")));

CREATE POLICY "Participants can close or safely reopen finalized matches"
ON public."FinalizedDocumentSpace" FOR UPDATE TO authenticated
USING ((SELECT nestmate_private.can_access_finalized_document_space("id")))
WITH CHECK ((SELECT nestmate_private.can_access_finalized_document_space("id")));

DROP POLICY "Participants can read active documents and uploaders can manage metadata"
ON public."SharedDocument";
CREATE POLICY "Participants can read available archived documents"
ON public."SharedDocument" FOR SELECT TO authenticated
USING (
  "revokedAt" IS NULL
  AND (SELECT nestmate_private.can_access_finalized_document_space("spaceId"))
);
DROP POLICY "Finalized participants can register their own uploaded documents"
ON public."SharedDocument";
CREATE POLICY "Active participants can register their own uploaded documents"
ON public."SharedDocument" FOR INSERT TO authenticated
WITH CHECK (
  "uploaderId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND "revokedAt" IS NULL
  AND (SELECT nestmate_private.can_manage_finalized_document_space("spaceId"))
);
DROP POLICY "Uploaders can revoke their own documents" ON public."SharedDocument";
CREATE POLICY "Active uploaders can revoke their own documents"
ON public."SharedDocument" FOR UPDATE TO authenticated
USING (
  "uploaderId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_manage_finalized_document_space("spaceId"))
)
WITH CHECK (
  "uploaderId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_manage_finalized_document_space("spaceId"))
);
DROP POLICY "Uploaders can delete their own document metadata" ON public."SharedDocument";
CREATE POLICY "Active uploaders can delete their own document metadata"
ON public."SharedDocument" FOR DELETE TO authenticated
USING (
  "uploaderId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_manage_finalized_document_space("spaceId"))
);

DROP POLICY "Participants can update only their own milestone progress"
ON public."FinalizedMatchMilestone";
CREATE POLICY "Active participants can update only their own milestone progress"
ON public."FinalizedMatchMilestone" FOR UPDATE TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_manage_finalized_document_space("spaceId"))
)
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_manage_finalized_document_space("spaceId"))
);

DROP POLICY "Participants can acknowledge current documents"
ON public."SharedDocumentAcknowledgement";
CREATE POLICY "Active participants can acknowledge current documents"
ON public."SharedDocumentAcknowledgement" FOR INSERT TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_shared_document("documentId", TRUE))
  AND EXISTS (
    SELECT 1 FROM public."SharedDocument" AS document
    WHERE document."id" = "documentId"
      AND nestmate_private.can_manage_finalized_document_space(document."spaceId")
  )
);
DROP POLICY "Participants can update their own current acknowledgement"
ON public."SharedDocumentAcknowledgement";
CREATE POLICY "Active participants can update their own current acknowledgement"
ON public."SharedDocumentAcknowledgement" FOR UPDATE TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_shared_document("documentId", TRUE))
  AND EXISTS (
    SELECT 1 FROM public."SharedDocument" AS document
    WHERE document."id" = "documentId"
      AND nestmate_private.can_manage_finalized_document_space(document."spaceId")
  )
)
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_shared_document("documentId", TRUE))
  AND EXISTS (
    SELECT 1 FROM public."SharedDocument" AS document
    WHERE document."id" = "documentId"
      AND nestmate_private.can_manage_finalized_document_space(document."spaceId")
  )
);

CREATE FUNCTION nestmate_private.can_manage_move_in_checklist(target_checklist_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT nestmate_private.can_access_move_in_checklist(checklist."id")
    AND EXISTS (
      SELECT 1
      FROM public."FinalizedDocumentSpace" AS space
      LEFT JOIN public."Post" AS listing ON listing."id" = checklist."postId"
      LEFT JOIN public."VisitRequest" AS visit ON visit."id" = checklist."visitId"
      WHERE space."targetType" = checklist."targetType"
        AND space."postId" IS NOT DISTINCT FROM checklist."postId"
        AND space."targetUserId" IS NOT DISTINCT FROM checklist."targetUserId"
        AND space."status" <> 'CLOSED'::public."FinalizedMatchStatus"
        AND LEAST(
          checklist."userId",
          CASE WHEN checklist."targetType" = 'FLATMATE'::public."InterestTargetType"
            THEN checklist."targetUserId"
            WHEN listing."authorId" <> checklist."userId" THEN listing."authorId"
            ELSE visit."requesterId" END
        ) = space."participantOneId"
        AND GREATEST(
          checklist."userId",
          CASE WHEN checklist."targetType" = 'FLATMATE'::public."InterestTargetType"
            THEN checklist."targetUserId"
            WHEN listing."authorId" <> checklist."userId" THEN listing."authorId"
            ELSE visit."requesterId" END
        ) = space."participantTwoId"
    )
  FROM public."MoveInChecklist" AS checklist
  WHERE checklist."id" = target_checklist_id;
$$;
REVOKE ALL ON FUNCTION nestmate_private.can_manage_move_in_checklist(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_manage_move_in_checklist(UUID)
TO authenticated;

DROP POLICY "Users can update their own finalized move-in tasks"
ON public."MoveInChecklistItem";
CREATE POLICY "Users can update active finalized move-in tasks"
ON public."MoveInChecklistItem" FOR UPDATE TO authenticated
USING ((SELECT nestmate_private.can_manage_move_in_checklist("checklistId")))
WITH CHECK ((SELECT nestmate_private.can_manage_move_in_checklist("checklistId")));

DROP POLICY "Finalized participants can upload private match documents" ON storage.objects;
CREATE POLICY "Active finalized participants can upload private match documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'match-documents'
  AND owner_id = (SELECT auth.uid())::TEXT
  AND array_length(storage.foldername(name), 1) = 2
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  AND lower(storage.extension(name)) IN ('pdf', 'jpg', 'jpeg', 'png')
  AND storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png)$'
  AND EXISTS (
    SELECT 1 FROM public."FinalizedDocumentSpace" AS space
    WHERE space."id"::TEXT = (storage.foldername(name))[2]
      AND nestmate_private.can_manage_finalized_document_space(space."id")
  )
);
DROP POLICY "Uploaders can delete their private match documents" ON storage.objects;
CREATE POLICY "Active uploaders can delete their private match documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'match-documents'
  AND owner_id = (SELECT auth.uid())::TEXT
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  AND EXISTS (
    SELECT 1 FROM public."SharedDocument" AS document
    WHERE document."objectPath" = storage.objects.name
      AND nestmate_private.can_manage_finalized_document_space(document."spaceId")
  )
);

-- Closed spaces stay readable, while all document mutation triggers also fail closed.
CREATE OR REPLACE FUNCTION nestmate_private.validate_shared_document_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  current_auth_user_id TEXT := (SELECT auth.uid())::TEXT;
  actual_mime_type TEXT; actual_size_bytes BIGINT; file_extension TEXT;
  previous_document public."SharedDocument"%ROWTYPE;
BEGIN
  IF current_user_id IS NULL OR current_auth_user_id IS NULL
    OR NOT nestmate_private.can_manage_finalized_document_space(NEW."spaceId") THEN
    RAISE EXCEPTION 'This finalized document space is read-only or unavailable.' USING ERRCODE = '42501';
  END IF;
  IF array_length(storage.foldername(NEW."objectPath"), 1) <> 2
    OR (storage.foldername(NEW."objectPath"))[1] <> current_auth_user_id
    OR (storage.foldername(NEW."objectPath"))[2] <> NEW."spaceId"::TEXT
    OR storage.filename(NEW."objectPath") !~* ('^' || NEW."id"::TEXT || '\.(pdf|jpg|jpeg|png)$') THEN
    RAISE EXCEPTION 'The private document path is invalid.' USING ERRCODE = '22023';
  END IF;
  SELECT lower(object.metadata ->> 'mimetype'),
    (object.metadata ->> 'size')::BIGINT, lower(storage.extension(object.name))
  INTO actual_mime_type, actual_size_bytes, file_extension
  FROM storage.objects AS object
  WHERE object.bucket_id = 'match-documents' AND object.name = NEW."objectPath"
    AND object.owner_id = current_auth_user_id;
  IF NOT FOUND OR actual_mime_type NOT IN ('application/pdf','image/jpeg','image/png')
    OR actual_size_bytes NOT BETWEEN 1 AND 10485760
    OR (actual_mime_type = 'application/pdf' AND file_extension <> 'pdf')
    OR (actual_mime_type = 'image/jpeg' AND file_extension NOT IN ('jpg','jpeg'))
    OR (actual_mime_type = 'image/png' AND file_extension <> 'png') THEN
    RAISE EXCEPTION 'The uploaded document type or size is invalid.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public."SharedDocument" AS document
      WHERE document."spaceId" = NEW."spaceId" AND document."uploaderId" = current_user_id) >= 20 THEN
    RAISE EXCEPTION 'A participant can share at most 20 documents in this space.' USING ERRCODE = '22023';
  END IF;

  IF NEW."replacesDocumentId" IS NOT NULL THEN
    SELECT * INTO previous_document
    FROM public."SharedDocument" AS document
    WHERE document."id" = NEW."replacesDocumentId"
    FOR UPDATE;
    IF NOT FOUND OR previous_document."spaceId" <> NEW."spaceId"
      OR previous_document."uploaderId" <> current_user_id
      OR previous_document."isCurrent" = FALSE
      OR previous_document."revokedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Only the uploader can revise the current version.' USING ERRCODE = '42501';
    END IF;
    NEW."seriesId" := previous_document."seriesId";
    NEW."versionNumber" := previous_document."versionNumber" + 1;
    NEW."category" := previous_document."category";
    UPDATE public."SharedDocument"
    SET "isCurrent" = FALSE, "supersededAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = previous_document."id";
  ELSE
    NEW."seriesId" := NEW."id";
    NEW."versionNumber" := 1;
  END IF;
  NEW."uploaderId" := current_user_id;
  NEW."isCurrent" := TRUE;
  NEW."objectPath" := btrim(NEW."objectPath"); NEW."originalName" := btrim(NEW."originalName");
  NEW."mimeType" := actual_mime_type; NEW."sizeBytes" := actual_size_bytes::INTEGER;
  NEW."revokedAt" := NULL; NEW."supersededAt" := NULL;
  NEW."createdAt" := CURRENT_TIMESTAMP; NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_shared_document_insert()
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION nestmate_private.validate_shared_document_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD."uploaderId" <> nestmate_private.current_nestmate_user_id()
    OR NOT nestmate_private.can_manage_finalized_document_space(OLD."spaceId") THEN
    RAISE EXCEPTION 'Only the uploader can manage this document in an open match.' USING ERRCODE = '42501';
  END IF;

  IF OLD."isCurrent" = TRUE AND NEW."isCurrent" = FALSE
    AND OLD."supersededAt" IS NULL AND NEW."supersededAt" IS NOT NULL
    AND NEW."id" IS NOT DISTINCT FROM OLD."id" AND NEW."spaceId" IS NOT DISTINCT FROM OLD."spaceId"
    AND NEW."uploaderId" IS NOT DISTINCT FROM OLD."uploaderId"
    AND NEW."seriesId" IS NOT DISTINCT FROM OLD."seriesId"
    AND NEW."versionNumber" IS NOT DISTINCT FROM OLD."versionNumber"
    AND NEW."replacesDocumentId" IS NOT DISTINCT FROM OLD."replacesDocumentId"
    AND NEW."category" IS NOT DISTINCT FROM OLD."category"
    AND NEW."objectPath" IS NOT DISTINCT FROM OLD."objectPath"
    AND NEW."originalName" IS NOT DISTINCT FROM OLD."originalName"
    AND NEW."mimeType" IS NOT DISTINCT FROM OLD."mimeType"
    AND NEW."sizeBytes" IS NOT DISTINCT FROM OLD."sizeBytes"
    AND NEW."revokedAt" IS NOT DISTINCT FROM OLD."revokedAt"
    AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt" THEN
    NEW."supersededAt" := CURRENT_TIMESTAMP; NEW."updatedAt" := CURRENT_TIMESTAMP;
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."spaceId" IS DISTINCT FROM OLD."spaceId"
    OR NEW."uploaderId" IS DISTINCT FROM OLD."uploaderId"
    OR NEW."seriesId" IS DISTINCT FROM OLD."seriesId"
    OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
    OR NEW."isCurrent" IS DISTINCT FROM OLD."isCurrent"
    OR NEW."replacesDocumentId" IS DISTINCT FROM OLD."replacesDocumentId"
    OR NEW."category" IS DISTINCT FROM OLD."category"
    OR NEW."objectPath" IS DISTINCT FROM OLD."objectPath"
    OR NEW."originalName" IS DISTINCT FROM OLD."originalName"
    OR NEW."mimeType" IS DISTINCT FROM OLD."mimeType"
    OR NEW."sizeBytes" IS DISTINCT FROM OLD."sizeBytes"
    OR NEW."supersededAt" IS DISTINCT FROM OLD."supersededAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL THEN
    RAISE EXCEPTION 'Only the uploader can revoke an active document in an open match.' USING ERRCODE = '42501';
  END IF;
  NEW."revokedAt" := CURRENT_TIMESTAMP; NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_shared_document_update()
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION nestmate_private.validate_finalized_match_milestone_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('nestmate.internal_milestone_update', TRUE) = 'true'
    AND OLD."status" = 'PENDING'::public."FinalizedMilestoneStatus"
    AND NEW."status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
    AND NEW."id" IS NOT DISTINCT FROM OLD."id" AND NEW."spaceId" IS NOT DISTINCT FROM OLD."spaceId"
    AND NEW."userId" IS NOT DISTINCT FROM OLD."userId" AND NEW."kind" IS NOT DISTINCT FROM OLD."kind"
    AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt" THEN
    NEW."completedAt" := COALESCE(OLD."completedAt", CURRENT_TIMESTAMP);
    NEW."updatedAt" := CURRENT_TIMESTAMP; RETURN NEW;
  END IF;
  IF OLD."userId" <> nestmate_private.current_nestmate_user_id()
    OR NOT nestmate_private.can_manage_finalized_document_space(OLD."spaceId")
    OR NEW."id" IS DISTINCT FROM OLD."id" OR NEW."spaceId" IS DISTINCT FROM OLD."spaceId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Participants can update only their own milestones in an open match.' USING ERRCODE = '42501';
  END IF;
  IF NEW."status" = 'COMPLETED'::public."FinalizedMilestoneStatus" THEN
    NEW."completedAt" := COALESCE(OLD."completedAt", CURRENT_TIMESTAMP);
  ELSE NEW."completedAt" := NULL; END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP; RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_finalized_match_milestone_update()
FROM PUBLIC, anon, authenticated;

DO $$
DECLARE existing_space RECORD; both_completed BOOLEAN;
BEGIN
  FOR existing_space IN SELECT "id" FROM public."FinalizedDocumentSpace" LOOP
    SELECT count(*) = 2 INTO both_completed
    FROM public."FinalizedMatchMilestone"
    WHERE "spaceId" = existing_space."id"
      AND "kind" = 'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind"
      AND "status" = 'COMPLETED'::public."FinalizedMilestoneStatus";
    IF both_completed THEN
      PERFORM set_config('nestmate.internal_match_lifecycle_update', 'true', TRUE);
      UPDATE public."FinalizedDocumentSpace"
      SET "status" = 'COMPLETED'::public."FinalizedMatchStatus"
      WHERE "id" = existing_space."id";
      PERFORM set_config('nestmate.internal_match_lifecycle_update', 'false', TRUE);
    END IF;
  END LOOP;
END;
$$;
