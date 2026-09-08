CREATE TYPE public."DocumentAcknowledgementStatus" AS ENUM (
  'REVIEWED',
  'ACKNOWLEDGED'
);

ALTER TABLE public."SharedDocument"
  ADD COLUMN "seriesId" UUID,
  ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "replacesDocumentId" UUID,
  ADD COLUMN "supersededAt" TIMESTAMPTZ(3);

UPDATE public."SharedDocument"
SET "seriesId" = "id";

ALTER TABLE public."SharedDocument"
  ALTER COLUMN "seriesId" SET NOT NULL,
  ADD CONSTRAINT "SharedDocument_versionNumber_check" CHECK ("versionNumber" >= 1),
  ADD CONSTRAINT "SharedDocument_versionLineage_check" CHECK (
    ("versionNumber" = 1 AND "replacesDocumentId" IS NULL)
    OR ("versionNumber" > 1 AND "replacesDocumentId" IS NOT NULL)
  ),
  ADD CONSTRAINT "SharedDocument_currentVersion_check" CHECK (
    ("isCurrent" = TRUE AND "supersededAt" IS NULL)
    OR ("isCurrent" = FALSE AND "supersededAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "SharedDocument_replacesDocumentId_fkey"
    FOREIGN KEY ("replacesDocumentId") REFERENCES public."SharedDocument"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SharedDocument_seriesId_versionNumber_key"
ON public."SharedDocument"("seriesId", "versionNumber");
CREATE UNIQUE INDEX "SharedDocument_one_current_version_key"
ON public."SharedDocument"("seriesId")
WHERE "isCurrent" = TRUE;
CREATE INDEX "SharedDocument_seriesId_isCurrent_idx"
ON public."SharedDocument"("seriesId", "isCurrent");
CREATE INDEX "SharedDocument_replacesDocumentId_idx"
ON public."SharedDocument"("replacesDocumentId");

CREATE TABLE public."SharedDocumentAcknowledgement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "documentId" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "status" public."DocumentAcknowledgementStatus" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SharedDocumentAcknowledgement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SharedDocumentAcknowledgement_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES public."SharedDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SharedDocumentAcknowledgement_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SharedDocumentAcknowledgement_documentId_userId_key"
ON public."SharedDocumentAcknowledgement"("documentId", "userId");
CREATE INDEX "SharedDocumentAcknowledgement_userId_updatedAt_idx"
ON public."SharedDocumentAcknowledgement"("userId", "updatedAt" DESC);

ALTER TABLE public."SharedDocumentAcknowledgement" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."SharedDocumentAcknowledgement"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."SharedDocumentAcknowledgement" TO authenticated;
GRANT INSERT ("documentId", "userId", "status")
ON TABLE public."SharedDocumentAcknowledgement" TO authenticated;
GRANT UPDATE ("documentId", "userId", "status")
ON TABLE public."SharedDocumentAcknowledgement" TO authenticated;
GRANT INSERT ("replacesDocumentId")
ON TABLE public."SharedDocument" TO authenticated;
REVOKE ALL ON TYPE public."DocumentAcknowledgementStatus" FROM PUBLIC;
GRANT USAGE ON TYPE public."DocumentAcknowledgementStatus" TO authenticated;

CREATE OR REPLACE FUNCTION nestmate_private.can_access_shared_document(
  target_document_id UUID,
  require_current BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."SharedDocument" AS shared_document
    WHERE shared_document."id" = target_document_id
      AND shared_document."revokedAt" IS NULL
      AND (NOT require_current OR shared_document."isCurrent" = TRUE)
      AND nestmate_private.can_access_finalized_document_space(shared_document."spaceId")
  );
$$;
REVOKE ALL ON FUNCTION nestmate_private.can_access_shared_document(UUID, BOOLEAN)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_shared_document(UUID, BOOLEAN)
TO authenticated;

CREATE OR REPLACE FUNCTION nestmate_private.validate_shared_document_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD."uploaderId" <> nestmate_private.current_nestmate_user_id() THEN
    RAISE EXCEPTION 'Only the uploader can manage this document.' USING ERRCODE = '42501';
  END IF;

  IF OLD."isCurrent" = TRUE
    AND NEW."isCurrent" = FALSE
    AND OLD."supersededAt" IS NULL
    AND NEW."supersededAt" IS NOT NULL
    AND NEW."id" IS NOT DISTINCT FROM OLD."id"
    AND NEW."spaceId" IS NOT DISTINCT FROM OLD."spaceId"
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
    NEW."supersededAt" := CURRENT_TIMESTAMP;
    NEW."updatedAt" := CURRENT_TIMESTAMP;
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."spaceId" IS DISTINCT FROM OLD."spaceId"
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

CREATE OR REPLACE FUNCTION nestmate_private.validate_shared_document_insert()
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
  previous_document public."SharedDocument"%ROWTYPE;
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

  IF NEW."replacesDocumentId" IS NOT NULL THEN
    SELECT * INTO previous_document
    FROM public."SharedDocument" AS existing_document
    WHERE existing_document."id" = NEW."replacesDocumentId"
    FOR UPDATE;
    IF NOT FOUND
      OR previous_document."spaceId" <> NEW."spaceId"
      OR previous_document."uploaderId" <> current_user_id
      OR previous_document."isCurrent" = FALSE
      OR previous_document."revokedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Only the uploader can revise the current version.' USING ERRCODE = '42501';
    END IF;

    NEW."seriesId" := previous_document."seriesId";
    NEW."versionNumber" := previous_document."versionNumber" + 1;
    NEW."category" := previous_document."category";
    UPDATE public."SharedDocument"
    SET "isCurrent" = FALSE,
        "supersededAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = previous_document."id";
  ELSE
    NEW."seriesId" := NEW."id";
    NEW."versionNumber" := 1;
  END IF;

  NEW."uploaderId" := current_user_id;
  NEW."isCurrent" := TRUE;
  NEW."objectPath" := btrim(NEW."objectPath");
  NEW."originalName" := btrim(NEW."originalName");
  NEW."mimeType" := actual_mime_type;
  NEW."sizeBytes" := actual_size_bytes::INTEGER;
  NEW."revokedAt" := NULL;
  NEW."supersededAt" := NULL;
  NEW."createdAt" := CURRENT_TIMESTAMP;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_shared_document_insert()
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.validate_document_acknowledgement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF current_user_id IS NULL
    OR NOT nestmate_private.can_access_shared_document(NEW."documentId", TRUE) THEN
    RAISE EXCEPTION 'Only participants can acknowledge a current document.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD."userId" <> current_user_id
    OR NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."documentId" IS DISTINCT FROM OLD."documentId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Acknowledgements can only be updated by their author.' USING ERRCODE = '42501';
  END IF;

  NEW."userId" := current_user_id;
  IF TG_OP = 'INSERT' THEN
    NEW."createdAt" := CURRENT_TIMESTAMP;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_document_acknowledgement()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_document_acknowledgement_before_write"
BEFORE INSERT OR UPDATE ON public."SharedDocumentAcknowledgement"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_document_acknowledgement();

CREATE POLICY "Participants can read document acknowledgements"
ON public."SharedDocumentAcknowledgement"
FOR SELECT
TO authenticated
USING (
  (SELECT nestmate_private.can_access_shared_document("documentId", FALSE))
);

CREATE POLICY "Participants can acknowledge current documents"
ON public."SharedDocumentAcknowledgement"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_shared_document("documentId", TRUE))
);

CREATE POLICY "Participants can update their own current acknowledgement"
ON public."SharedDocumentAcknowledgement"
FOR UPDATE
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_shared_document("documentId", TRUE))
)
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_shared_document("documentId", TRUE))
);
