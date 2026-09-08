CREATE TYPE public."MoveInChecklistItemKind" AS ENUM (
  'DEPOSIT_CONFIRMATION',
  'RENT_AMOUNT',
  'MOVE_IN_DATE',
  'ID_DOCUMENT_EXCHANGE',
  'AGREEMENT_STATUS',
  'INVENTORY_PHOTOS',
  'UTILITY_RESPONSIBILITIES',
  'KEYS',
  'EMERGENCY_CONTACT_DETAILS'
);

CREATE TABLE public."MoveInChecklist" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "activityId" UUID,
  "visitId" UUID,
  "targetType" public."InterestTargetType" NOT NULL,
  "postId" TEXT,
  "targetUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MoveInChecklist_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MoveInChecklist_source_check" CHECK (
    "activityId" IS NOT NULL OR "visitId" IS NOT NULL
  ),
  CONSTRAINT "MoveInChecklist_target_check" CHECK (
    (
      "targetType" = 'LISTING'::public."InterestTargetType"
      AND "postId" IS NOT NULL
      AND "targetUserId" IS NULL
    ) OR (
      "targetType" = 'FLATMATE'::public."InterestTargetType"
      AND "postId" IS NULL
      AND "targetUserId" IS NOT NULL
    )
  ),
  CONSTRAINT "MoveInChecklist_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MoveInChecklist_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES public."InterestActivity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MoveInChecklist_visitId_fkey"
    FOREIGN KEY ("visitId") REFERENCES public."VisitRequest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MoveInChecklist_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES public."Post"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MoveInChecklist_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MoveInChecklist_activityId_key"
ON public."MoveInChecklist"("activityId");
CREATE UNIQUE INDEX "MoveInChecklist_userId_visitId_key"
ON public."MoveInChecklist"("userId", "visitId");
CREATE UNIQUE INDEX "MoveInChecklist_userId_postId_key"
ON public."MoveInChecklist"("userId", "postId");
CREATE UNIQUE INDEX "MoveInChecklist_userId_targetUserId_key"
ON public."MoveInChecklist"("userId", "targetUserId");
CREATE INDEX "MoveInChecklist_userId_updatedAt_idx"
ON public."MoveInChecklist"("userId", "updatedAt" DESC);
CREATE INDEX "MoveInChecklist_postId_idx"
ON public."MoveInChecklist"("postId");
CREATE INDEX "MoveInChecklist_targetUserId_idx"
ON public."MoveInChecklist"("targetUserId");

CREATE TABLE public."MoveInChecklistItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "checklistId" UUID NOT NULL,
  "kind" public."MoveInChecklistItemKind" NOT NULL,
  "label" VARCHAR(100) NOT NULL,
  "privateDetail" VARCHAR(500),
  "isCompleted" BOOLEAN NOT NULL DEFAULT FALSE,
  "completedAt" TIMESTAMPTZ(3),
  "sortOrder" SMALLINT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MoveInChecklistItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MoveInChecklistItem_privateDetail_check" CHECK (
    "privateDetail" IS NULL
    OR char_length(btrim("privateDetail")) BETWEEN 1 AND 500
  ),
  CONSTRAINT "MoveInChecklistItem_sortOrder_check" CHECK (
    "sortOrder" BETWEEN 0 AND 100
  ),
  CONSTRAINT "MoveInChecklistItem_checklistId_fkey"
    FOREIGN KEY ("checklistId") REFERENCES public."MoveInChecklist"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MoveInChecklistItem_checklistId_kind_key"
ON public."MoveInChecklistItem"("checklistId", "kind");
CREATE INDEX "MoveInChecklistItem_checklistId_sortOrder_idx"
ON public."MoveInChecklistItem"("checklistId", "sortOrder");

CREATE FUNCTION nestmate_private.can_access_finalized_interest_target(
  target_type public."InterestTargetType",
  target_post_id TEXT,
  target_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  counterpart_id TEXT;
BEGIN
  IF current_user_id IS NULL
    OR NOT nestmate_private.is_user_content_visible(current_user_id) THEN
    RETURN FALSE;
  END IF;

  IF target_type = 'LISTING'::public."InterestTargetType"
    AND target_post_id IS NOT NULL
    AND target_user_id IS NULL THEN
    SELECT listing."authorId" INTO counterpart_id
    FROM public."Post" AS listing
    WHERE listing."id" = target_post_id
      AND listing."type" IN (
        'ROOM_AVAILABLE'::public."PostType",
        'PG_AVAILABLE'::public."PostType"
      )
      AND listing."status" = 'ACTIVE'::public."PostStatus"
      AND listing."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
      AND listing."publishedAt" IS NOT NULL;
  ELSIF target_type = 'FLATMATE'::public."InterestTargetType"
    AND target_post_id IS NULL
    AND target_user_id IS NOT NULL THEN
    counterpart_id := target_user_id;
  ELSE
    RETURN FALSE;
  END IF;

  IF counterpart_id IS NULL
    OR counterpart_id = current_user_id
    OR NOT nestmate_private.is_user_content_visible(counterpart_id) THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public."UserBlock" AS user_block
    WHERE (
      user_block."blockerId" = current_user_id
      AND user_block."blockedId" = counterpart_id
    ) OR (
      user_block."blockerId" = counterpart_id
      AND user_block."blockedId" = current_user_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.can_access_finalized_interest_target(
  public."InterestTargetType", TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_finalized_interest_target(
  public."InterestTargetType", TEXT, TEXT
) TO authenticated;

CREATE FUNCTION nestmate_private.can_access_move_in_checklist(
  target_checklist_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."MoveInChecklist" AS checklist
    WHERE checklist."id" = target_checklist_id
      AND checklist."userId" = nestmate_private.current_nestmate_user_id()
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
              AND activity."postId" IS NOT DISTINCT FROM checklist."postId"
              AND activity."targetUserId" IS NOT DISTINCT FROM checklist."targetUserId"
          )
        ) OR (
          checklist."visitId" IS NOT NULL
          AND checklist."targetType" = 'LISTING'::public."InterestTargetType"
          AND EXISTS (
            SELECT 1
            FROM public."VisitRequest" AS visit_request
            JOIN public."VisitOutcome" AS visit_outcome
              ON visit_outcome."visitId" = visit_request."id"
             AND visit_outcome."userId" = checklist."userId"
             AND visit_outcome."outcome" = 'FINALIZED'::public."VisitOutcomeType"
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
          checklist."targetType" = 'FLATMATE'::public."InterestTargetType"
          AND nestmate_private.can_access_finalized_interest_target(
            checklist."targetType",
            checklist."postId",
            checklist."targetUserId"
          )
        ) OR (
          checklist."targetType" = 'LISTING'::public."InterestTargetType"
          AND EXISTS (
            SELECT 1
            FROM public."Post" AS listing
            WHERE listing."id" = checklist."postId"
              AND listing."status" = 'ACTIVE'::public."PostStatus"
              AND listing."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
              AND nestmate_private.is_user_content_visible(listing."authorId")
              AND (
                (
                  listing."authorId" <> checklist."userId"
                  AND nestmate_private.can_access_finalized_interest_target(
                    checklist."targetType",
                    checklist."postId",
                    checklist."targetUserId"
                  )
                ) OR (
                  listing."authorId" = checklist."userId"
                  AND checklist."visitId" IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM public."VisitRequest" AS owner_visit
                    WHERE owner_visit."id" = checklist."visitId"
                      AND owner_visit."ownerId" = checklist."userId"
                      AND NOT EXISTS (
                        SELECT 1
                        FROM public."UserBlock" AS user_block
                        WHERE (
                          user_block."blockerId" = owner_visit."ownerId"
                          AND user_block."blockedId" = owner_visit."requesterId"
                        ) OR (
                          user_block."blockerId" = owner_visit."requesterId"
                          AND user_block."blockedId" = owner_visit."ownerId"
                        )
                      )
                      AND nestmate_private.is_user_content_visible(
                        owner_visit."requesterId"
                      )
                  )
                )
              )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION nestmate_private.can_access_move_in_checklist(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_move_in_checklist(UUID)
TO authenticated;

CREATE FUNCTION nestmate_private.create_default_move_in_checklist(
  checklist_user_id TEXT,
  checklist_activity_id UUID,
  checklist_visit_id UUID,
  checklist_target_type public."InterestTargetType",
  checklist_post_id TEXT,
  checklist_target_user_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_checklist_id UUID;
BEGIN
  IF checklist_target_type = 'LISTING'::public."InterestTargetType" THEN
    INSERT INTO public."MoveInChecklist" (
      "userId", "activityId", "visitId", "targetType", "postId", "targetUserId"
    ) VALUES (
      checklist_user_id,
      checklist_activity_id,
      checklist_visit_id,
      checklist_target_type,
      checklist_post_id,
      NULL
    )
    ON CONFLICT ("userId", "postId") DO UPDATE
    SET
      "activityId" = COALESCE(public."MoveInChecklist"."activityId", EXCLUDED."activityId"),
      "visitId" = COALESCE(public."MoveInChecklist"."visitId", EXCLUDED."visitId"),
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "id" INTO new_checklist_id;
  ELSE
    INSERT INTO public."MoveInChecklist" (
      "userId", "activityId", "visitId", "targetType", "postId", "targetUserId"
    ) VALUES (
      checklist_user_id,
      checklist_activity_id,
      NULL,
      checklist_target_type,
      NULL,
      checklist_target_user_id
    )
    ON CONFLICT ("userId", "targetUserId") DO UPDATE
    SET
      "activityId" = COALESCE(public."MoveInChecklist"."activityId", EXCLUDED."activityId"),
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "id" INTO new_checklist_id;
  END IF;

  INSERT INTO public."MoveInChecklistItem" (
    "checklistId", "kind", "label", "sortOrder"
  ) VALUES
    (new_checklist_id, 'DEPOSIT_CONFIRMATION', 'Deposit confirmation', 10),
    (new_checklist_id, 'RENT_AMOUNT', 'Rent amount', 20),
    (new_checklist_id, 'MOVE_IN_DATE', 'Move-in date', 30),
    (new_checklist_id, 'ID_DOCUMENT_EXCHANGE', 'ID / document exchange', 40),
    (new_checklist_id, 'AGREEMENT_STATUS', 'Agreement status', 50),
    (new_checklist_id, 'INVENTORY_PHOTOS', 'Inventory / photos', 60),
    (new_checklist_id, 'UTILITY_RESPONSIBILITIES', 'Utility responsibilities', 70),
    (new_checklist_id, 'KEYS', 'Keys', 80),
    (new_checklist_id, 'EMERGENCY_CONTACT_DETAILS', 'Emergency / contact details', 90)
  ON CONFLICT ("checklistId", "kind") DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.create_default_move_in_checklist(
  TEXT, UUID, UUID, public."InterestTargetType", TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.create_move_in_checklist_from_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW."stage" = 'FINALIZED'::public."InterestStage" THEN
    PERFORM nestmate_private.create_default_move_in_checklist(
      NEW."userId",
      NEW."id",
      NULL,
      NEW."targetType",
      NEW."postId",
      NEW."targetUserId"
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.create_move_in_checklist_from_activity()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "create_move_in_checklist_from_activity_after_write"
AFTER INSERT OR UPDATE OF "stage" ON public."InterestActivity"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.create_move_in_checklist_from_activity();

CREATE FUNCTION nestmate_private.create_move_in_checklist_from_visit_outcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_post_id TEXT;
BEGIN
  IF NEW."outcome" = 'FINALIZED'::public."VisitOutcomeType" THEN
    SELECT visit_request."postId" INTO target_post_id
    FROM public."VisitRequest" AS visit_request
    WHERE visit_request."id" = NEW."visitId"
      AND NEW."userId" IN (
        visit_request."requesterId",
        visit_request."ownerId"
      );

    IF target_post_id IS NOT NULL THEN
      PERFORM nestmate_private.create_default_move_in_checklist(
        NEW."userId",
        NULL,
        NEW."visitId",
        'LISTING'::public."InterestTargetType",
        target_post_id,
        NULL
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.create_move_in_checklist_from_visit_outcome()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "create_move_in_checklist_from_visit_outcome_after_write"
AFTER INSERT OR UPDATE OF "outcome" ON public."VisitOutcome"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.create_move_in_checklist_from_visit_outcome();

CREATE FUNCTION nestmate_private.validate_move_in_checklist_item_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."checklistId" IS DISTINCT FROM OLD."checklistId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."label" IS DISTINCT FROM OLD."label"
    OR NEW."sortOrder" IS DISTINCT FROM OLD."sortOrder"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Checklist task identity cannot be changed.'
      USING ERRCODE = '42501';
  END IF;

  NEW."privateDetail" := NULLIF(btrim(NEW."privateDetail"), '');
  IF NEW."privateDetail" IS NOT NULL
    AND char_length(NEW."privateDetail") > 500 THEN
    RAISE EXCEPTION 'Keep private checklist details within 500 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW."isCompleted" AND NOT OLD."isCompleted" THEN
    NEW."completedAt" := CURRENT_TIMESTAMP;
  ELSIF NOT NEW."isCompleted" THEN
    NEW."completedAt" := NULL;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.validate_move_in_checklist_item_update()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_move_in_checklist_item_before_update"
BEFORE UPDATE ON public."MoveInChecklistItem"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_move_in_checklist_item_update();

ALTER TABLE public."MoveInChecklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MoveInChecklistItem" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."MoveInChecklist"
FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."MoveInChecklistItem"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."MoveInChecklist" TO authenticated;
GRANT SELECT ON TABLE public."MoveInChecklistItem" TO authenticated;
GRANT UPDATE ("privateDetail", "isCompleted")
ON TABLE public."MoveInChecklistItem" TO authenticated;
REVOKE ALL ON TYPE public."MoveInChecklistItemKind" FROM PUBLIC;
GRANT USAGE ON TYPE public."MoveInChecklistItemKind" TO authenticated;

CREATE POLICY "Users can read their own finalized move-in checklists"
ON public."MoveInChecklist"
FOR SELECT
TO authenticated
USING (
  (SELECT nestmate_private.can_access_move_in_checklist("id"))
);

CREATE POLICY "Users can read their own finalized move-in tasks"
ON public."MoveInChecklistItem"
FOR SELECT
TO authenticated
USING (
  (SELECT nestmate_private.can_access_move_in_checklist("checklistId"))
);

CREATE POLICY "Users can update their own finalized move-in tasks"
ON public."MoveInChecklistItem"
FOR UPDATE
TO authenticated
USING (
  (SELECT nestmate_private.can_access_move_in_checklist("checklistId"))
)
WITH CHECK (
  (SELECT nestmate_private.can_access_move_in_checklist("checklistId"))
);

DROP POLICY IF EXISTS "Users can read their own visible activity"
ON public."InterestActivity";
DROP POLICY IF EXISTS "Users can update their own visible activity"
ON public."InterestActivity";

CREATE POLICY "Users can read their own visible or finalized activity"
ON public."InterestActivity"
FOR SELECT
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (
    (SELECT nestmate_private.can_track_interest_target(
      "targetType", "postId", "targetUserId"
    ))
    OR (
      "stage" = 'FINALIZED'::public."InterestStage"
      AND (SELECT nestmate_private.can_access_finalized_interest_target(
        "targetType", "postId", "targetUserId"
      ))
    )
  )
);

CREATE POLICY "Users can update their own visible or finalized activity"
ON public."InterestActivity"
FOR UPDATE
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (
    (SELECT nestmate_private.can_track_interest_target(
      "targetType", "postId", "targetUserId"
    ))
    OR (
      "stage" = 'FINALIZED'::public."InterestStage"
      AND (SELECT nestmate_private.can_access_finalized_interest_target(
        "targetType", "postId", "targetUserId"
      ))
    )
  )
)
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (
    (SELECT nestmate_private.can_track_interest_target(
      "targetType", "postId", "targetUserId"
    ))
    OR (
      "stage" = 'FINALIZED'::public."InterestStage"
      AND (SELECT nestmate_private.can_access_finalized_interest_target(
        "targetType", "postId", "targetUserId"
      ))
    )
  )
);
