CREATE TYPE public."SharedDocumentCategory" AS ENUM (
  'ID_PROOF',
  'AGREEMENT_DRAFT',
  'DEPOSIT_RECEIPT',
  'INVENTORY_SHEET',
  'MOVE_IN_DOCUMENT'
);

CREATE TABLE public."FinalizedDocumentSpace" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "targetType" public."InterestTargetType" NOT NULL,
  "postId" TEXT,
  "targetUserId" TEXT,
  "participantOneId" TEXT NOT NULL,
  "participantTwoId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinalizedDocumentSpace_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinalizedDocumentSpace_target_check" CHECK (
    ("targetType" = 'LISTING'::public."InterestTargetType" AND "postId" IS NOT NULL AND "targetUserId" IS NULL)
    OR
    ("targetType" = 'FLATMATE'::public."InterestTargetType" AND "postId" IS NULL AND "targetUserId" IS NOT NULL)
  ),
  CONSTRAINT "FinalizedDocumentSpace_participants_check" CHECK (
    "participantOneId" < "participantTwoId"
  ),
  CONSTRAINT "FinalizedDocumentSpace_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES public."Post"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinalizedDocumentSpace_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinalizedDocumentSpace_participantOneId_fkey"
    FOREIGN KEY ("participantOneId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinalizedDocumentSpace_participantTwoId_fkey"
    FOREIGN KEY ("participantTwoId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinalizedDocumentSpace_postId_participantOneId_participantTwoId_key"
ON public."FinalizedDocumentSpace"("postId", "participantOneId", "participantTwoId");
CREATE UNIQUE INDEX "FinalizedDocumentSpace_targetUserId_participantOneId_participantTwoId_key"
ON public."FinalizedDocumentSpace"("targetUserId", "participantOneId", "participantTwoId");
CREATE INDEX "FinalizedDocumentSpace_participantOneId_updatedAt_idx"
ON public."FinalizedDocumentSpace"("participantOneId", "updatedAt" DESC);
CREATE INDEX "FinalizedDocumentSpace_participantTwoId_updatedAt_idx"
ON public."FinalizedDocumentSpace"("participantTwoId", "updatedAt" DESC);
CREATE INDEX "FinalizedDocumentSpace_postId_idx"
ON public."FinalizedDocumentSpace"("postId");
CREATE INDEX "FinalizedDocumentSpace_targetUserId_idx"
ON public."FinalizedDocumentSpace"("targetUserId");

CREATE TABLE public."SharedDocument" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "category" public."SharedDocumentCategory" NOT NULL,
  "objectPath" VARCHAR(500) NOT NULL,
  "originalName" VARCHAR(180) NOT NULL,
  "mimeType" VARCHAR(80) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SharedDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SharedDocument_objectPath_key" UNIQUE ("objectPath"),
  CONSTRAINT "SharedDocument_name_check" CHECK (
    char_length("originalName") BETWEEN 1 AND 180
    AND "originalName" = btrim("originalName")
    AND "originalName" !~ '[/\\]'
    AND "originalName" !~ '[[:cntrl:]]'
  ),
  CONSTRAINT "SharedDocument_mime_check" CHECK (
    "mimeType" IN ('application/pdf', 'image/jpeg', 'image/png')
  ),
  CONSTRAINT "SharedDocument_size_check" CHECK (
    "sizeBytes" BETWEEN 1 AND 10485760
  ),
  CONSTRAINT "SharedDocument_path_check" CHECK (
    "objectPath" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png)$'
  ),
  CONSTRAINT "SharedDocument_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES public."FinalizedDocumentSpace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SharedDocument_uploaderId_fkey"
    FOREIGN KEY ("uploaderId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SharedDocument_spaceId_revokedAt_createdAt_idx"
ON public."SharedDocument"("spaceId", "revokedAt", "createdAt" DESC);
CREATE INDEX "SharedDocument_uploaderId_createdAt_idx"
ON public."SharedDocument"("uploaderId", "createdAt" DESC);

ALTER TABLE public."FinalizedDocumentSpace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SharedDocument" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."FinalizedDocumentSpace" FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."SharedDocument" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."FinalizedDocumentSpace" TO authenticated;
GRANT SELECT, DELETE ON TABLE public."SharedDocument" TO authenticated;
GRANT INSERT ("id", "spaceId", "category", "objectPath", "originalName")
ON TABLE public."SharedDocument" TO authenticated;
GRANT UPDATE ("revokedAt") ON TABLE public."SharedDocument" TO authenticated;
REVOKE ALL ON TYPE public."SharedDocumentCategory" FROM PUBLIC;
GRANT USAGE ON TYPE public."SharedDocumentCategory" TO authenticated;

INSERT INTO storage.buckets (
  "id", "name", "public", "file_size_limit", "allowed_mime_types"
) VALUES (
  'match-documents',
  'match-documents',
  FALSE,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::TEXT[]
)
ON CONFLICT ("id") DO UPDATE
SET
  "public" = FALSE,
  "file_size_limit" = EXCLUDED."file_size_limit",
  "allowed_mime_types" = EXCLUDED."allowed_mime_types";

CREATE FUNCTION nestmate_private.can_access_finalized_document_space(
  target_space_id UUID
)
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
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO space_record
  FROM public."FinalizedDocumentSpace" AS document_space
  WHERE document_space."id" = target_space_id
    AND current_user_id IN (
      document_space."participantOneId",
      document_space."participantTwoId"
    );
  IF NOT FOUND
    OR NOT nestmate_private.is_user_content_visible(space_record."participantOneId")
    OR NOT nestmate_private.is_user_content_visible(space_record."participantTwoId")
    OR EXISTS (
      SELECT 1
      FROM public."UserBlock" AS user_block
      WHERE (
        user_block."blockerId" = space_record."participantOneId"
        AND user_block."blockedId" = space_record."participantTwoId"
      ) OR (
        user_block."blockerId" = space_record."participantTwoId"
        AND user_block."blockedId" = space_record."participantOneId"
      )
    ) THEN
    RETURN FALSE;
  END IF;

  IF space_record."targetType" = 'LISTING'::public."InterestTargetType" THEN
    RETURN EXISTS (
      SELECT 1
      FROM public."MoveInChecklist" AS checklist
      JOIN public."Post" AS listing ON listing."id" = checklist."postId"
      WHERE checklist."targetType" = 'LISTING'::public."InterestTargetType"
        AND checklist."postId" = space_record."postId"
        AND checklist."userId" IN (
          space_record."participantOneId",
          space_record."participantTwoId"
        )
        AND listing."type" IN (
          'ROOM_AVAILABLE'::public."PostType",
          'PG_AVAILABLE'::public."PostType"
        )
        AND listing."status" = 'ACTIVE'::public."PostStatus"
        AND listing."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
        AND listing."publishedAt" IS NOT NULL
        AND (
          (
            checklist."activityId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public."InterestActivity" AS activity
              WHERE activity."id" = checklist."activityId"
                AND activity."userId" = checklist."userId"
                AND activity."stage" = 'FINALIZED'::public."InterestStage"
                AND activity."targetType" = checklist."targetType"
                AND activity."postId" = checklist."postId"
            )
          ) OR (
            checklist."visitId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public."VisitRequest" AS visit_request
              JOIN public."VisitOutcome" AS outcome
                ON outcome."visitId" = visit_request."id"
               AND outcome."userId" = checklist."userId"
               AND outcome."outcome" = 'FINALIZED'::public."VisitOutcomeType"
              WHERE visit_request."id" = checklist."visitId"
                AND visit_request."postId" = checklist."postId"
                AND checklist."userId" IN (
                  visit_request."requesterId",
                  visit_request."ownerId"
                )
            )
          )
        )
        AND (
          (
            listing."authorId" <> checklist."userId"
            AND listing."authorId" IN (
              space_record."participantOneId",
              space_record."participantTwoId"
            )
          ) OR (
            listing."authorId" = checklist."userId"
            AND EXISTS (
              SELECT 1
              FROM public."VisitRequest" AS owner_visit
              WHERE owner_visit."id" = checklist."visitId"
                AND owner_visit."ownerId" = checklist."userId"
                AND owner_visit."requesterId" IN (
                  space_record."participantOneId",
                  space_record."participantTwoId"
                )
            )
          )
        )
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public."MoveInChecklist" AS checklist
    JOIN public."InterestActivity" AS activity
      ON activity."id" = checklist."activityId"
     AND activity."userId" = checklist."userId"
     AND activity."stage" = 'FINALIZED'::public."InterestStage"
    WHERE checklist."targetType" = 'FLATMATE'::public."InterestTargetType"
      AND checklist."postId" IS NULL
      AND checklist."targetUserId" = space_record."targetUserId"
      AND checklist."userId" IN (
        space_record."participantOneId",
        space_record."participantTwoId"
      )
      AND checklist."targetUserId" IN (
        space_record."participantOneId",
        space_record."participantTwoId"
      )
      AND checklist."targetUserId" <> checklist."userId"
      AND EXISTS (
        SELECT 1
        FROM public."UserPreferences" AS preferences
        WHERE preferences."userId" = checklist."targetUserId"
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.can_access_finalized_document_space(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_finalized_document_space(UUID)
TO authenticated;

CREATE FUNCTION nestmate_private.sync_finalized_document_space(
  target_checklist_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  checklist_record public."MoveInChecklist"%ROWTYPE;
  counterpart_id TEXT;
  first_participant_id TEXT;
  second_participant_id TEXT;
  has_finalized_source BOOLEAN;
BEGIN
  SELECT * INTO checklist_record
  FROM public."MoveInChecklist"
  WHERE "id" = target_checklist_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT (
    (
      checklist_record."activityId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public."InterestActivity" AS activity
        WHERE activity."id" = checklist_record."activityId"
          AND activity."userId" = checklist_record."userId"
          AND activity."stage" = 'FINALIZED'::public."InterestStage"
      )
    ) OR (
      checklist_record."visitId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public."VisitOutcome" AS outcome
        WHERE outcome."visitId" = checklist_record."visitId"
          AND outcome."userId" = checklist_record."userId"
          AND outcome."outcome" = 'FINALIZED'::public."VisitOutcomeType"
      )
    )
  ) INTO has_finalized_source;
  IF NOT has_finalized_source THEN RETURN; END IF;

  IF checklist_record."targetType" = 'LISTING'::public."InterestTargetType" THEN
    SELECT listing."authorId" INTO counterpart_id
    FROM public."Post" AS listing
    WHERE listing."id" = checklist_record."postId"
      AND listing."type" IN (
        'ROOM_AVAILABLE'::public."PostType",
        'PG_AVAILABLE'::public."PostType"
      );
    IF counterpart_id = checklist_record."userId" THEN
      SELECT visit."requesterId" INTO counterpart_id
      FROM public."VisitRequest" AS visit
      WHERE visit."id" = checklist_record."visitId"
        AND visit."ownerId" = checklist_record."userId"
        AND visit."postId" = checklist_record."postId";
    END IF;
  ELSE
    counterpart_id := checklist_record."targetUserId";
  END IF;

  IF counterpart_id IS NULL OR counterpart_id = checklist_record."userId" THEN
    RETURN;
  END IF;
  first_participant_id := LEAST(checklist_record."userId", counterpart_id);
  second_participant_id := GREATEST(checklist_record."userId", counterpart_id);

  IF checklist_record."targetType" = 'LISTING'::public."InterestTargetType" THEN
    INSERT INTO public."FinalizedDocumentSpace" (
      "targetType", "postId", "targetUserId", "participantOneId", "participantTwoId"
    ) VALUES (
      checklist_record."targetType", checklist_record."postId", NULL,
      first_participant_id, second_participant_id
    )
    ON CONFLICT ("postId", "participantOneId", "participantTwoId") DO UPDATE
    SET "updatedAt" = CURRENT_TIMESTAMP;
  ELSE
    INSERT INTO public."FinalizedDocumentSpace" (
      "targetType", "postId", "targetUserId", "participantOneId", "participantTwoId"
    ) VALUES (
      checklist_record."targetType", NULL, checklist_record."targetUserId",
      first_participant_id, second_participant_id
    )
    ON CONFLICT ("targetUserId", "participantOneId", "participantTwoId") DO UPDATE
    SET "updatedAt" = CURRENT_TIMESTAMP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.sync_finalized_document_space(UUID)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.sync_finalized_document_space_after_checklist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM nestmate_private.sync_finalized_document_space(NEW."id");
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.sync_finalized_document_space_after_checklist()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "sync_document_space_after_checklist"
AFTER INSERT OR UPDATE OF "activityId", "visitId", "targetType", "postId", "targetUserId"
ON public."MoveInChecklist"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.sync_finalized_document_space_after_checklist();

DO $$
DECLARE existing_checklist RECORD;
BEGIN
  FOR existing_checklist IN SELECT "id" FROM public."MoveInChecklist" LOOP
    PERFORM nestmate_private.sync_finalized_document_space(existing_checklist."id");
  END LOOP;
END;
$$;

CREATE FUNCTION nestmate_private.validate_shared_document_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  current_auth_user_id TEXT := (SELECT auth.uid())::TEXT;
  actual_mime_type TEXT;
  actual_size_bytes BIGINT;
  file_extension TEXT;
BEGIN
  IF current_user_id IS NULL
    OR current_auth_user_id IS NULL
    OR NOT nestmate_private.can_access_finalized_document_space(NEW."spaceId") THEN
    RAISE EXCEPTION 'This finalized document space is unavailable.' USING ERRCODE = '42501';
  END IF;
  IF array_length(storage.foldername(NEW."objectPath"), 1) <> 2
    OR (storage.foldername(NEW."objectPath"))[1] <> current_auth_user_id
    OR (storage.foldername(NEW."objectPath"))[2] <> NEW."spaceId"::TEXT
    OR storage.filename(NEW."objectPath") !~* ('^' || NEW."id"::TEXT || '\.(pdf|jpg|jpeg|png)$') THEN
    RAISE EXCEPTION 'The private document path is invalid.' USING ERRCODE = '22023';
  END IF;

  SELECT
    lower(stored_object.metadata ->> 'mimetype'),
    (stored_object.metadata ->> 'size')::BIGINT,
    lower(storage.extension(stored_object.name))
  INTO actual_mime_type, actual_size_bytes, file_extension
  FROM storage.objects AS stored_object
  WHERE stored_object.bucket_id = 'match-documents'
    AND stored_object.name = NEW."objectPath"
    AND stored_object.owner_id = current_auth_user_id;

  IF NOT FOUND
    OR actual_mime_type IS NULL
    OR actual_size_bytes IS NULL
    OR file_extension IS NULL
    OR actual_mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png')
    OR actual_size_bytes NOT BETWEEN 1 AND 10485760
    OR (actual_mime_type = 'application/pdf' AND file_extension <> 'pdf')
    OR (actual_mime_type = 'image/jpeg' AND file_extension NOT IN ('jpg', 'jpeg'))
    OR (actual_mime_type = 'image/png' AND file_extension <> 'png') THEN
    RAISE EXCEPTION 'The uploaded document type or size is invalid.' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(*)
    FROM public."SharedDocument" AS existing_document
    WHERE existing_document."spaceId" = NEW."spaceId"
      AND existing_document."uploaderId" = current_user_id
  ) >= 20 THEN
    RAISE EXCEPTION 'A participant can share at most 20 documents in this space.' USING ERRCODE = '22023';
  END IF;

  NEW."uploaderId" := current_user_id;
  NEW."objectPath" := btrim(NEW."objectPath");
  NEW."originalName" := btrim(NEW."originalName");
  NEW."mimeType" := actual_mime_type;
  NEW."sizeBytes" := actual_size_bytes::INTEGER;
  NEW."revokedAt" := NULL;
  NEW."createdAt" := CURRENT_TIMESTAMP;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_shared_document_insert()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_shared_document_before_insert"
BEFORE INSERT ON public."SharedDocument"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_shared_document_insert();

CREATE FUNCTION nestmate_private.validate_shared_document_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD."uploaderId" <> nestmate_private.current_nestmate_user_id()
    OR NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."spaceId" IS DISTINCT FROM OLD."spaceId"
    OR NEW."uploaderId" IS DISTINCT FROM OLD."uploaderId"
    OR NEW."category" IS DISTINCT FROM OLD."category"
    OR NEW."objectPath" IS DISTINCT FROM OLD."objectPath"
    OR NEW."originalName" IS DISTINCT FROM OLD."originalName"
    OR NEW."mimeType" IS DISTINCT FROM OLD."mimeType"
    OR NEW."sizeBytes" IS DISTINCT FROM OLD."sizeBytes"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR OLD."revokedAt" IS NOT NULL
    OR NEW."revokedAt" IS NULL THEN
    RAISE EXCEPTION 'Only the uploader can revoke an active document.' USING ERRCODE = '42501';
  END IF;
  NEW."revokedAt" := CURRENT_TIMESTAMP;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_shared_document_update()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_shared_document_before_update"
BEFORE UPDATE ON public."SharedDocument"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_shared_document_update();

CREATE POLICY "Finalized participants can read their document spaces"
ON public."FinalizedDocumentSpace"
FOR SELECT
TO authenticated
USING (
  (SELECT nestmate_private.can_access_finalized_document_space("id"))
);

CREATE POLICY "Participants can read active documents and uploaders can manage metadata"
ON public."SharedDocument"
FOR SELECT
TO authenticated
USING (
  "uploaderId" = (SELECT nestmate_private.current_nestmate_user_id())
  OR (
    "revokedAt" IS NULL
    AND (SELECT nestmate_private.can_access_finalized_document_space("spaceId"))
  )
);

CREATE POLICY "Finalized participants can register their own uploaded documents"
ON public."SharedDocument"
FOR INSERT
TO authenticated
WITH CHECK (
  "uploaderId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND "revokedAt" IS NULL
  AND (SELECT nestmate_private.can_access_finalized_document_space("spaceId"))
);

CREATE POLICY "Uploaders can revoke their own documents"
ON public."SharedDocument"
FOR UPDATE
TO authenticated
USING (
  "uploaderId" = (SELECT nestmate_private.current_nestmate_user_id())
)
WITH CHECK (
  "uploaderId" = (SELECT nestmate_private.current_nestmate_user_id())
);

CREATE POLICY "Uploaders can delete their own document metadata"
ON public."SharedDocument"
FOR DELETE
TO authenticated
USING (
  "uploaderId" = (SELECT nestmate_private.current_nestmate_user_id())
);

DROP POLICY IF EXISTS "Finalized participants can upload private match documents" ON storage.objects;
CREATE POLICY "Finalized participants can upload private match documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'match-documents'
  AND owner_id = (SELECT auth.uid())::TEXT
  AND array_length(storage.foldername(name), 1) = 2
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  AND lower(storage.extension(name)) IN ('pdf', 'jpg', 'jpeg', 'png')
  AND storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png)$'
  AND EXISTS (
    SELECT 1
    FROM public."FinalizedDocumentSpace" AS document_space
    WHERE document_space."id"::TEXT = (storage.foldername(name))[2]
      AND nestmate_private.can_access_finalized_document_space(document_space."id")
  )
);

DROP POLICY IF EXISTS "Finalized participants can download active match documents" ON storage.objects;
CREATE POLICY "Finalized participants can download active match documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'match-documents'
  AND EXISTS (
    SELECT 1
    FROM public."SharedDocument" AS shared_document
    WHERE shared_document."objectPath" = storage.objects.name
      AND shared_document."revokedAt" IS NULL
      AND nestmate_private.can_access_finalized_document_space(shared_document."spaceId")
  )
);

DROP POLICY IF EXISTS "Uploaders can delete their private match documents" ON storage.objects;
CREATE POLICY "Uploaders can delete their private match documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'match-documents'
  AND owner_id = (SELECT auth.uid())::TEXT
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
);
