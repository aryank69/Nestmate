CREATE TYPE public."FinalizedMilestoneKind" AS ENUM (
  'AGREEMENT_DRAFTED',
  'AGREEMENT_REVIEWED',
  'AGREEMENT_ACKNOWLEDGED',
  'DEPOSIT_CONFIRMED',
  'DOCUMENTS_EXCHANGED',
  'INVENTORY_COMPLETED',
  'KEYS_HANDED_OVER',
  'MOVE_IN_COMPLETED'
);

CREATE TYPE public."FinalizedMilestoneStatus" AS ENUM (
  'PENDING',
  'COMPLETED'
);

CREATE TABLE public."FinalizedMatchMilestone" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "spaceId" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" public."FinalizedMilestoneKind" NOT NULL,
  "status" public."FinalizedMilestoneStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinalizedMatchMilestone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinalizedMatchMilestone_completion_check" CHECK (
    ("status" = 'PENDING'::public."FinalizedMilestoneStatus" AND "completedAt" IS NULL)
    OR ("status" = 'COMPLETED'::public."FinalizedMilestoneStatus" AND "completedAt" IS NOT NULL)
  ),
  CONSTRAINT "FinalizedMatchMilestone_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES public."FinalizedDocumentSpace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinalizedMatchMilestone_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinalizedMatchMilestone_spaceId_userId_kind_key"
ON public."FinalizedMatchMilestone"("spaceId", "userId", "kind");
CREATE INDEX "FinalizedMatchMilestone_spaceId_kind_idx"
ON public."FinalizedMatchMilestone"("spaceId", "kind");
CREATE INDEX "FinalizedMatchMilestone_userId_status_updatedAt_idx"
ON public."FinalizedMatchMilestone"("userId", "status", "updatedAt" DESC);

ALTER TABLE public."FinalizedMatchMilestone" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."FinalizedMatchMilestone"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."FinalizedMatchMilestone" TO authenticated;
GRANT UPDATE ("status") ON TABLE public."FinalizedMatchMilestone" TO authenticated;
REVOKE ALL ON TYPE public."FinalizedMilestoneKind" FROM PUBLIC;
REVOKE ALL ON TYPE public."FinalizedMilestoneStatus" FROM PUBLIC;
GRANT USAGE ON TYPE public."FinalizedMilestoneKind" TO authenticated;
GRANT USAGE ON TYPE public."FinalizedMilestoneStatus" TO authenticated;

CREATE FUNCTION nestmate_private.seed_finalized_match_milestones(
  target_space_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public."FinalizedMatchMilestone" (
    "spaceId", "userId", "kind"
  )
  SELECT
    document_space."id",
    participant."userId",
    milestone_kind."kind"
  FROM public."FinalizedDocumentSpace" AS document_space
  CROSS JOIN LATERAL (
    VALUES
      (document_space."participantOneId"),
      (document_space."participantTwoId")
  ) AS participant("userId")
  CROSS JOIN unnest(ARRAY[
    'AGREEMENT_DRAFTED'::public."FinalizedMilestoneKind",
    'AGREEMENT_REVIEWED'::public."FinalizedMilestoneKind",
    'AGREEMENT_ACKNOWLEDGED'::public."FinalizedMilestoneKind",
    'DEPOSIT_CONFIRMED'::public."FinalizedMilestoneKind",
    'DOCUMENTS_EXCHANGED'::public."FinalizedMilestoneKind",
    'INVENTORY_COMPLETED'::public."FinalizedMilestoneKind",
    'KEYS_HANDED_OVER'::public."FinalizedMilestoneKind",
    'MOVE_IN_COMPLETED'::public."FinalizedMilestoneKind"
  ]) AS milestone_kind("kind")
  WHERE document_space."id" = target_space_id
  ON CONFLICT ("spaceId", "userId", "kind") DO NOTHING;
$$;
REVOKE ALL ON FUNCTION nestmate_private.seed_finalized_match_milestones(UUID)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.seed_finalized_match_milestones_after_space()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM nestmate_private.seed_finalized_match_milestones(NEW."id");
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.seed_finalized_match_milestones_after_space()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "seed_finalized_match_milestones_after_space"
AFTER INSERT ON public."FinalizedDocumentSpace"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.seed_finalized_match_milestones_after_space();

CREATE FUNCTION nestmate_private.advance_finalized_match_milestone(
  target_space_id UUID,
  target_user_id TEXT,
  target_kind public."FinalizedMilestoneKind"
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public."FinalizedDocumentSpace" AS document_space
    WHERE document_space."id" = target_space_id
      AND target_user_id IN (
        document_space."participantOneId",
        document_space."participantTwoId"
      )
  ) THEN
    RETURN;
  END IF;

  PERFORM nestmate_private.seed_finalized_match_milestones(target_space_id);
  PERFORM set_config('nestmate.internal_milestone_update', 'true', TRUE);
  UPDATE public."FinalizedMatchMilestone"
  SET
    "status" = 'COMPLETED'::public."FinalizedMilestoneStatus",
    "completedAt" = COALESCE("completedAt", CURRENT_TIMESTAMP),
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "spaceId" = target_space_id
    AND "userId" = target_user_id
    AND "kind" = target_kind
    AND "status" <> 'COMPLETED'::public."FinalizedMilestoneStatus";
  PERFORM set_config('nestmate.internal_milestone_update', 'false', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.advance_finalized_match_milestone(
  UUID, TEXT, public."FinalizedMilestoneKind"
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.validate_finalized_match_milestone_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('nestmate.internal_milestone_update', TRUE) = 'true'
    AND OLD."status" = 'PENDING'::public."FinalizedMilestoneStatus"
    AND NEW."status" = 'COMPLETED'::public."FinalizedMilestoneStatus"
    AND NEW."id" IS NOT DISTINCT FROM OLD."id"
    AND NEW."spaceId" IS NOT DISTINCT FROM OLD."spaceId"
    AND NEW."userId" IS NOT DISTINCT FROM OLD."userId"
    AND NEW."kind" IS NOT DISTINCT FROM OLD."kind"
    AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt" THEN
    NEW."completedAt" := COALESCE(OLD."completedAt", CURRENT_TIMESTAMP);
    NEW."updatedAt" := CURRENT_TIMESTAMP;
    RETURN NEW;
  END IF;

  IF OLD."userId" <> nestmate_private.current_nestmate_user_id()
    OR NOT nestmate_private.can_access_finalized_document_space(OLD."spaceId")
    OR NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."spaceId" IS DISTINCT FROM OLD."spaceId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Participants can update only their own milestone status.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."status" = 'COMPLETED'::public."FinalizedMilestoneStatus" THEN
    NEW."completedAt" := COALESCE(OLD."completedAt", CURRENT_TIMESTAMP);
  ELSE
    NEW."completedAt" := NULL;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_finalized_match_milestone_update()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_finalized_match_milestone_before_update"
BEFORE UPDATE ON public."FinalizedMatchMilestone"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_finalized_match_milestone_update();

CREATE POLICY "Finalized participants can read shared milestone progress"
ON public."FinalizedMatchMilestone"
FOR SELECT
TO authenticated
USING (
  (SELECT nestmate_private.can_access_finalized_document_space("spaceId"))
);

CREATE POLICY "Participants can update only their own milestone progress"
ON public."FinalizedMatchMilestone"
FOR UPDATE
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_finalized_document_space("spaceId"))
)
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_finalized_document_space("spaceId"))
);

CREATE FUNCTION nestmate_private.sync_milestones_from_document()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  document_space public."FinalizedDocumentSpace"%ROWTYPE;
BEGIN
  IF NEW."revokedAt" IS NOT NULL OR NEW."isCurrent" = FALSE THEN
    RETURN NEW;
  END IF;

  IF NEW."category" = 'AGREEMENT_DRAFT'::public."SharedDocumentCategory" THEN
    PERFORM nestmate_private.advance_finalized_match_milestone(
      NEW."spaceId", NEW."uploaderId",
      'AGREEMENT_DRAFTED'::public."FinalizedMilestoneKind"
    );
  END IF;

  SELECT * INTO document_space
  FROM public."FinalizedDocumentSpace"
  WHERE "id" = NEW."spaceId";
  IF FOUND
    AND EXISTS (
      SELECT 1 FROM public."SharedDocument"
      WHERE "spaceId" = NEW."spaceId"
        AND "uploaderId" = document_space."participantOneId"
        AND "revokedAt" IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public."SharedDocument"
      WHERE "spaceId" = NEW."spaceId"
        AND "uploaderId" = document_space."participantTwoId"
        AND "revokedAt" IS NULL
    ) THEN
    PERFORM nestmate_private.advance_finalized_match_milestone(
      NEW."spaceId", document_space."participantOneId",
      'DOCUMENTS_EXCHANGED'::public."FinalizedMilestoneKind"
    );
    PERFORM nestmate_private.advance_finalized_match_milestone(
      NEW."spaceId", document_space."participantTwoId",
      'DOCUMENTS_EXCHANGED'::public."FinalizedMilestoneKind"
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.sync_milestones_from_document()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "sync_milestones_from_document_after_insert"
AFTER INSERT ON public."SharedDocument"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.sync_milestones_from_document();

CREATE FUNCTION nestmate_private.sync_milestones_from_acknowledgement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_document public."SharedDocument"%ROWTYPE;
BEGIN
  SELECT * INTO target_document
  FROM public."SharedDocument"
  WHERE "id" = NEW."documentId"
    AND "isCurrent" = TRUE
    AND "revokedAt" IS NULL
    AND "category" = 'AGREEMENT_DRAFT'::public."SharedDocumentCategory";
  IF NOT FOUND THEN RETURN NEW; END IF;

  PERFORM nestmate_private.advance_finalized_match_milestone(
    target_document."spaceId", NEW."userId",
    'AGREEMENT_REVIEWED'::public."FinalizedMilestoneKind"
  );
  IF NEW."status" = 'ACKNOWLEDGED'::public."DocumentAcknowledgementStatus" THEN
    PERFORM nestmate_private.advance_finalized_match_milestone(
      target_document."spaceId", NEW."userId",
      'AGREEMENT_ACKNOWLEDGED'::public."FinalizedMilestoneKind"
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.sync_milestones_from_acknowledgement()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "sync_milestones_from_acknowledgement_after_write"
AFTER INSERT OR UPDATE OF "status" ON public."SharedDocumentAcknowledgement"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.sync_milestones_from_acknowledgement();

CREATE FUNCTION nestmate_private.sync_milestone_from_checklist_item(
  target_item_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  checklist_record public."MoveInChecklist"%ROWTYPE;
  item_record public."MoveInChecklistItem"%ROWTYPE;
  counterpart_id TEXT;
  first_participant_id TEXT;
  second_participant_id TEXT;
  target_space_id UUID;
  target_kind public."FinalizedMilestoneKind";
BEGIN
  SELECT * INTO item_record
  FROM public."MoveInChecklistItem"
  WHERE "id" = target_item_id AND "isCompleted" = TRUE;
  IF NOT FOUND THEN RETURN; END IF;

  target_kind := CASE item_record."kind"
    WHEN 'DEPOSIT_CONFIRMATION'::public."MoveInChecklistItemKind"
      THEN 'DEPOSIT_CONFIRMED'::public."FinalizedMilestoneKind"
    WHEN 'ID_DOCUMENT_EXCHANGE'::public."MoveInChecklistItemKind"
      THEN 'DOCUMENTS_EXCHANGED'::public."FinalizedMilestoneKind"
    WHEN 'INVENTORY_PHOTOS'::public."MoveInChecklistItemKind"
      THEN 'INVENTORY_COMPLETED'::public."FinalizedMilestoneKind"
    WHEN 'KEYS'::public."MoveInChecklistItemKind"
      THEN 'KEYS_HANDED_OVER'::public."FinalizedMilestoneKind"
    ELSE NULL
  END;
  IF target_kind IS NULL THEN RETURN; END IF;

  SELECT * INTO checklist_record
  FROM public."MoveInChecklist"
  WHERE "id" = item_record."checklistId";
  IF NOT FOUND THEN RETURN; END IF;

  IF checklist_record."targetType" = 'LISTING'::public."InterestTargetType" THEN
    SELECT listing."authorId" INTO counterpart_id
    FROM public."Post" AS listing
    WHERE listing."id" = checklist_record."postId";
    IF counterpart_id = checklist_record."userId" THEN
      SELECT visit_request."requesterId" INTO counterpart_id
      FROM public."VisitRequest" AS visit_request
      WHERE visit_request."id" = checklist_record."visitId"
        AND visit_request."ownerId" = checklist_record."userId";
    END IF;
  ELSE
    counterpart_id := checklist_record."targetUserId";
  END IF;
  IF counterpart_id IS NULL OR counterpart_id = checklist_record."userId" THEN
    RETURN;
  END IF;

  first_participant_id := LEAST(checklist_record."userId", counterpart_id);
  second_participant_id := GREATEST(checklist_record."userId", counterpart_id);
  SELECT document_space."id" INTO target_space_id
  FROM public."FinalizedDocumentSpace" AS document_space
  WHERE document_space."targetType" = checklist_record."targetType"
    AND document_space."postId" IS NOT DISTINCT FROM checklist_record."postId"
    AND document_space."targetUserId" IS NOT DISTINCT FROM checklist_record."targetUserId"
    AND document_space."participantOneId" = first_participant_id
    AND document_space."participantTwoId" = second_participant_id;
  IF target_space_id IS NULL THEN RETURN; END IF;

  PERFORM nestmate_private.advance_finalized_match_milestone(
    target_space_id, checklist_record."userId", target_kind
  );
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.sync_milestone_from_checklist_item(UUID)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.sync_milestone_from_checklist_item_after_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM nestmate_private.sync_milestone_from_checklist_item(NEW."id");
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.sync_milestone_from_checklist_item_after_write()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "sync_milestone_from_checklist_item_after_write"
AFTER INSERT OR UPDATE OF "isCompleted" ON public."MoveInChecklistItem"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.sync_milestone_from_checklist_item_after_write();

DO $$
DECLARE
  existing_space RECORD;
  agreement_document RECORD;
  agreement_acknowledgement RECORD;
  completed_checklist_item RECORD;
BEGIN
  FOR existing_space IN SELECT "id" FROM public."FinalizedDocumentSpace" LOOP
    PERFORM nestmate_private.seed_finalized_match_milestones(existing_space."id");
  END LOOP;

  FOR agreement_document IN
    SELECT "spaceId", "uploaderId"
    FROM public."SharedDocument"
    WHERE "category" = 'AGREEMENT_DRAFT'::public."SharedDocumentCategory"
      AND "isCurrent" = TRUE AND "revokedAt" IS NULL
  LOOP
    PERFORM nestmate_private.advance_finalized_match_milestone(
      agreement_document."spaceId", agreement_document."uploaderId",
      'AGREEMENT_DRAFTED'::public."FinalizedMilestoneKind"
    );
  END LOOP;

  FOR agreement_acknowledgement IN
    SELECT document."spaceId", acknowledgement."userId", acknowledgement."status"
    FROM public."SharedDocumentAcknowledgement" AS acknowledgement
    JOIN public."SharedDocument" AS document ON document."id" = acknowledgement."documentId"
    WHERE document."category" = 'AGREEMENT_DRAFT'::public."SharedDocumentCategory"
      AND document."isCurrent" = TRUE AND document."revokedAt" IS NULL
  LOOP
    PERFORM nestmate_private.advance_finalized_match_milestone(
      agreement_acknowledgement."spaceId", agreement_acknowledgement."userId",
      'AGREEMENT_REVIEWED'::public."FinalizedMilestoneKind"
    );
    IF agreement_acknowledgement."status" = 'ACKNOWLEDGED'::public."DocumentAcknowledgementStatus" THEN
      PERFORM nestmate_private.advance_finalized_match_milestone(
        agreement_acknowledgement."spaceId", agreement_acknowledgement."userId",
        'AGREEMENT_ACKNOWLEDGED'::public."FinalizedMilestoneKind"
      );
    END IF;
  END LOOP;

  FOR existing_space IN
    SELECT document_space.*
    FROM public."FinalizedDocumentSpace" AS document_space
    WHERE EXISTS (
      SELECT 1 FROM public."SharedDocument"
      WHERE "spaceId" = document_space."id"
        AND "uploaderId" = document_space."participantOneId"
        AND "revokedAt" IS NULL
    ) AND EXISTS (
      SELECT 1 FROM public."SharedDocument"
      WHERE "spaceId" = document_space."id"
        AND "uploaderId" = document_space."participantTwoId"
        AND "revokedAt" IS NULL
    )
  LOOP
    PERFORM nestmate_private.advance_finalized_match_milestone(
      existing_space."id", existing_space."participantOneId",
      'DOCUMENTS_EXCHANGED'::public."FinalizedMilestoneKind"
    );
    PERFORM nestmate_private.advance_finalized_match_milestone(
      existing_space."id", existing_space."participantTwoId",
      'DOCUMENTS_EXCHANGED'::public."FinalizedMilestoneKind"
    );
  END LOOP;

  FOR completed_checklist_item IN
    SELECT "id" FROM public."MoveInChecklistItem" WHERE "isCompleted" = TRUE
  LOOP
    PERFORM nestmate_private.sync_milestone_from_checklist_item(
      completed_checklist_item."id"
    );
  END LOOP;
END;
$$;
