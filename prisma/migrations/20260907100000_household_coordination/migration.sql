CREATE TYPE public."HouseholdStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE public."HouseholdArchiveReason" AS ENUM (
  'MEMBER_ARCHIVED', 'MEMBER_LEFT', 'MOVE_IN_RESET'
);
CREATE TYPE public."HouseholdMemberStatus" AS ENUM ('ACTIVE', 'LEFT');
CREATE TYPE public."HouseholdItemKind" AS ENUM (
  'RENT_DUE', 'UTILITY', 'CHORE', 'EXPENSE', 'NOTE', 'TASK'
);
CREATE TYPE public."HouseholdRecurrence" AS ENUM ('NONE', 'WEEKLY', 'MONTHLY');

CREATE TABLE public."Household" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "finalizedSpaceId" UUID NOT NULL,
  "status" public."HouseholdStatus" NOT NULL DEFAULT 'ACTIVE',
  "archiveReason" public."HouseholdArchiveReason",
  "archivedAt" TIMESTAMPTZ(3),
  "archivedById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Household_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Household_finalizedSpaceId_key" UNIQUE ("finalizedSpaceId"),
  CONSTRAINT "Household_archive_state_check" CHECK (
    ("status" = 'ACTIVE'::public."HouseholdStatus"
      AND "archiveReason" IS NULL AND "archivedAt" IS NULL AND "archivedById" IS NULL)
    OR
    ("status" = 'ARCHIVED'::public."HouseholdStatus"
      AND "archiveReason" IS NOT NULL AND "archivedAt" IS NOT NULL)
  ),
  CONSTRAINT "Household_finalizedSpaceId_fkey"
    FOREIGN KEY ("finalizedSpaceId") REFERENCES public."FinalizedDocumentSpace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Household_archivedById_fkey"
    FOREIGN KEY ("archivedById") REFERENCES public."User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Household_status_updatedAt_idx"
ON public."Household"("status", "updatedAt" DESC);
CREATE INDEX "Household_archivedById_idx" ON public."Household"("archivedById");

CREATE TABLE public."HouseholdMember" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "householdId" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "status" public."HouseholdMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HouseholdMember_householdId_userId_key" UNIQUE ("householdId", "userId"),
  CONSTRAINT "HouseholdMember_leave_state_check" CHECK (
    ("status" = 'ACTIVE'::public."HouseholdMemberStatus" AND "leftAt" IS NULL)
    OR ("status" = 'LEFT'::public."HouseholdMemberStatus" AND "leftAt" IS NOT NULL)
  ),
  CONSTRAINT "HouseholdMember_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES public."Household"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "HouseholdMember_userId_status_updatedAt_idx"
ON public."HouseholdMember"("userId", "status", "updatedAt" DESC);
CREATE INDEX "HouseholdMember_householdId_status_idx"
ON public."HouseholdMember"("householdId", "status");

CREATE TABLE public."HouseholdItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "householdId" UUID NOT NULL,
  "createdById" TEXT NOT NULL,
  "assignedToId" TEXT,
  "kind" public."HouseholdItemKind" NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "detail" VARCHAR(500),
  "amountMinor" INTEGER,
  "dueDate" DATE,
  "recurrence" public."HouseholdRecurrence" NOT NULL DEFAULT 'NONE',
  "isCompleted" BOOLEAN NOT NULL DEFAULT FALSE,
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HouseholdItem_title_check" CHECK (
    char_length("title") BETWEEN 1 AND 120 AND "title" = btrim("title")
  ),
  CONSTRAINT "HouseholdItem_detail_check" CHECK (
    "detail" IS NULL OR (char_length("detail") BETWEEN 1 AND 500 AND "detail" = btrim("detail"))
  ),
  CONSTRAINT "HouseholdItem_amount_check" CHECK (
    ("amountMinor" IS NULL AND "kind" NOT IN (
      'RENT_DUE'::public."HouseholdItemKind", 'EXPENSE'::public."HouseholdItemKind"
    )) OR (
      "amountMinor" BETWEEN 1 AND 100000000
      AND "kind" IN ('RENT_DUE'::public."HouseholdItemKind", 'EXPENSE'::public."HouseholdItemKind")
    ) OR (
      "amountMinor" IS NULL
      AND "kind" IN ('RENT_DUE'::public."HouseholdItemKind", 'EXPENSE'::public."HouseholdItemKind")
    )
  ),
  CONSTRAINT "HouseholdItem_completion_check" CHECK (
    ("isCompleted" = FALSE AND "completedAt" IS NULL)
    OR ("isCompleted" = TRUE AND "completedAt" IS NOT NULL)
  ),
  CONSTRAINT "HouseholdItem_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES public."Household"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdItem_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseholdItem_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES public."User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "HouseholdItem_householdId_isCompleted_dueDate_idx"
ON public."HouseholdItem"("householdId", "isCompleted", "dueDate");
CREATE INDEX "HouseholdItem_createdById_updatedAt_idx"
ON public."HouseholdItem"("createdById", "updatedAt" DESC);
CREATE INDEX "HouseholdItem_assignedToId_isCompleted_dueDate_idx"
ON public."HouseholdItem"("assignedToId", "isCompleted", "dueDate");

ALTER TABLE public."Household" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HouseholdMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HouseholdItem" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."Household", public."HouseholdMember", public."HouseholdItem"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."Household", public."HouseholdMember", public."HouseholdItem"
TO authenticated;
GRANT UPDATE ("status") ON TABLE public."Household" TO authenticated;
GRANT UPDATE ("status") ON TABLE public."HouseholdMember" TO authenticated;
GRANT INSERT ("householdId", "assignedToId", "kind", "title", "detail", "amountMinor", "dueDate", "recurrence", "isCompleted")
ON TABLE public."HouseholdItem" TO authenticated;
GRANT UPDATE ("assignedToId", "kind", "title", "detail", "amountMinor", "dueDate", "recurrence", "isCompleted")
ON TABLE public."HouseholdItem" TO authenticated;
GRANT DELETE ON TABLE public."HouseholdItem" TO authenticated;
REVOKE ALL ON TYPE public."HouseholdStatus", public."HouseholdArchiveReason",
  public."HouseholdMemberStatus", public."HouseholdItemKind", public."HouseholdRecurrence" FROM PUBLIC;
GRANT USAGE ON TYPE public."HouseholdStatus", public."HouseholdArchiveReason",
  public."HouseholdMemberStatus", public."HouseholdItemKind", public."HouseholdRecurrence" TO authenticated;

CREATE FUNCTION nestmate_private.can_access_household(target_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."HouseholdMember" AS viewer_membership
    WHERE viewer_membership."householdId" = target_household_id
      AND viewer_membership."userId" = nestmate_private.current_nestmate_user_id()
      AND viewer_membership."status" = 'ACTIVE'::public."HouseholdMemberStatus"
      AND NOT EXISTS (
        SELECT 1
        FROM public."HouseholdMember" AS member
        WHERE member."householdId" = target_household_id
          AND member."status" = 'ACTIVE'::public."HouseholdMemberStatus"
          AND NOT nestmate_private.is_user_content_visible(member."userId")
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public."HouseholdMember" AS member
        JOIN public."UserBlock" AS user_block ON (
          (user_block."blockerId" = viewer_membership."userId" AND user_block."blockedId" = member."userId")
          OR (user_block."blockedId" = viewer_membership."userId" AND user_block."blockerId" = member."userId")
        )
        WHERE member."householdId" = target_household_id
          AND member."status" = 'ACTIVE'::public."HouseholdMemberStatus"
          AND member."userId" <> viewer_membership."userId"
      )
  );
$$;
REVOKE ALL ON FUNCTION nestmate_private.can_access_household(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_household(UUID) TO authenticated;

CREATE FUNCTION nestmate_private.can_manage_household(target_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Household" AS household
    WHERE household."id" = target_household_id
      AND household."status" = 'ACTIVE'::public."HouseholdStatus"
      AND nestmate_private.can_access_household(household."id")
  );
$$;
REVOKE ALL ON FUNCTION nestmate_private.can_manage_household(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_manage_household(UUID) TO authenticated;

CREATE FUNCTION nestmate_private.sync_household_from_finalized_space(target_space_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  space_record public."FinalizedDocumentSpace"%ROWTYPE;
  household_id UUID;
BEGIN
  SELECT * INTO space_record FROM public."FinalizedDocumentSpace" WHERE "id" = target_space_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF space_record."status" = 'COMPLETED'::public."FinalizedMatchStatus"
    OR (space_record."status" = 'CLOSED'::public."FinalizedMatchStatus"
      AND space_record."closureReason" = 'MOVE_IN_COMPLETED'::public."MatchClosureReason") THEN
    INSERT INTO public."Household" ("finalizedSpaceId") VALUES (space_record."id")
    ON CONFLICT ("finalizedSpaceId") DO NOTHING
    RETURNING "id" INTO household_id;
    IF household_id IS NULL THEN
      SELECT "id" INTO household_id FROM public."Household"
      WHERE "finalizedSpaceId" = space_record."id";
      PERFORM set_config('nestmate.internal_household_lifecycle', 'true', TRUE);
      UPDATE public."Household"
      SET "status" = 'ACTIVE'::public."HouseholdStatus"
      WHERE "id" = household_id
        AND "status" = 'ARCHIVED'::public."HouseholdStatus"
        AND "archiveReason" = 'MOVE_IN_RESET'::public."HouseholdArchiveReason"
        AND NOT EXISTS (
          SELECT 1 FROM public."HouseholdMember"
          WHERE "householdId" = household_id
            AND "status" = 'LEFT'::public."HouseholdMemberStatus"
        );
      PERFORM set_config('nestmate.internal_household_lifecycle', 'false', TRUE);
    END IF;
    INSERT INTO public."HouseholdMember" ("householdId", "userId") VALUES
      (household_id, space_record."participantOneId"),
      (household_id, space_record."participantTwoId")
    ON CONFLICT ("householdId", "userId") DO NOTHING;
  ELSE
    PERFORM set_config('nestmate.internal_household_lifecycle', 'true', TRUE);
    UPDATE public."Household"
    SET "status" = 'ARCHIVED'::public."HouseholdStatus",
        "archiveReason" = 'MOVE_IN_RESET'::public."HouseholdArchiveReason"
    WHERE "finalizedSpaceId" = target_space_id
      AND "status" = 'ACTIVE'::public."HouseholdStatus";
    PERFORM set_config('nestmate.internal_household_lifecycle', 'false', TRUE);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.sync_household_from_finalized_space(UUID)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.validate_household_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  internal_update BOOLEAN := current_setting('nestmate.internal_household_lifecycle', TRUE) = 'true';
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."finalizedSpaceId" IS DISTINCT FROM OLD."finalizedSpaceId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Household identity cannot be changed.' USING ERRCODE = '42501';
  END IF;
  IF internal_update THEN
    IF NEW."status" = 'ACTIVE'::public."HouseholdStatus" THEN
      NEW."archiveReason" := NULL; NEW."archivedAt" := NULL; NEW."archivedById" := NULL;
    ELSE
      NEW."archivedAt" := COALESCE(OLD."archivedAt", CURRENT_TIMESTAMP);
      NEW."archivedById" := COALESCE(NEW."archivedById", current_user_id);
    END IF;
    NEW."updatedAt" := CURRENT_TIMESTAMP;
    RETURN NEW;
  END IF;
  IF OLD."status" <> 'ACTIVE'::public."HouseholdStatus"
    OR NEW."status" <> 'ARCHIVED'::public."HouseholdStatus"
    OR NOT nestmate_private.can_manage_household(OLD."id") THEN
    RAISE EXCEPTION 'Only active household members can archive an active household.' USING ERRCODE = '42501';
  END IF;
  NEW."archiveReason" := 'MEMBER_ARCHIVED'::public."HouseholdArchiveReason";
  NEW."archivedAt" := CURRENT_TIMESTAMP; NEW."archivedById" := current_user_id;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_household_lifecycle()
FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "validate_household_lifecycle_before_update"
BEFORE UPDATE ON public."Household"
FOR EACH ROW EXECUTE FUNCTION nestmate_private.validate_household_lifecycle();

CREATE FUNCTION nestmate_private.validate_household_member_leave()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE current_user_id TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF OLD."userId" <> current_user_id
    OR OLD."status" <> 'ACTIVE'::public."HouseholdMemberStatus"
    OR NEW."status" <> 'LEFT'::public."HouseholdMemberStatus"
    OR NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."householdId" IS DISTINCT FROM OLD."householdId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."joinedAt" IS DISTINCT FROM OLD."joinedAt"
    OR NOT nestmate_private.can_access_household(OLD."householdId") THEN
    RAISE EXCEPTION 'Members can only leave their own active household membership.' USING ERRCODE = '42501';
  END IF;
  NEW."leftAt" := CURRENT_TIMESTAMP; NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_household_member_leave()
FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "validate_household_member_leave_before_update"
BEFORE UPDATE ON public."HouseholdMember"
FOR EACH ROW EXECUTE FUNCTION nestmate_private.validate_household_member_leave();

CREATE FUNCTION nestmate_private.archive_household_after_member_leaves()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW."status" = 'LEFT'::public."HouseholdMemberStatus"
    AND OLD."status" = 'ACTIVE'::public."HouseholdMemberStatus" THEN
    PERFORM set_config('nestmate.internal_household_lifecycle', 'true', TRUE);
    UPDATE public."Household"
    SET "status" = 'ARCHIVED'::public."HouseholdStatus",
        "archiveReason" = 'MEMBER_LEFT'::public."HouseholdArchiveReason",
        "archivedById" = NEW."userId"
    WHERE "id" = NEW."householdId" AND "status" = 'ACTIVE'::public."HouseholdStatus";
    PERFORM set_config('nestmate.internal_household_lifecycle', 'false', TRUE);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.archive_household_after_member_leaves()
FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "archive_household_after_member_leaves"
AFTER UPDATE OF "status" ON public."HouseholdMember"
FOR EACH ROW EXECUTE FUNCTION nestmate_private.archive_household_after_member_leaves();

CREATE FUNCTION nestmate_private.validate_household_item_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  creator_write BOOLEAN;
BEGIN
  IF current_user_id IS NULL OR NOT nestmate_private.can_manage_household(NEW."householdId") THEN
    RAISE EXCEPTION 'This household is private, archived, or unavailable.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."householdId" IS DISTINCT FROM OLD."householdId"
      OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'Household item ownership cannot be changed.' USING ERRCODE = '42501';
    END IF;
    creator_write := OLD."createdById" = current_user_id;
    IF NOT creator_write AND (
      NEW."assignedToId" IS DISTINCT FROM OLD."assignedToId"
      OR NEW."kind" IS DISTINCT FROM OLD."kind"
      OR NEW."title" IS DISTINCT FROM OLD."title"
      OR NEW."detail" IS DISTINCT FROM OLD."detail"
      OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
      OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate"
      OR NEW."recurrence" IS DISTINCT FROM OLD."recurrence"
    ) THEN
      RAISE EXCEPTION 'Only the creator can edit household item details.' USING ERRCODE = '42501';
    END IF;
  ELSE
    NEW."createdById" := current_user_id;
    NEW."createdAt" := CURRENT_TIMESTAMP;
  END IF;
  NEW."title" := btrim(NEW."title");
  NEW."detail" := NULLIF(btrim(NEW."detail"), '');
  IF NEW."assignedToId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."HouseholdMember"
    WHERE "householdId" = NEW."householdId" AND "userId" = NEW."assignedToId"
      AND "status" = 'ACTIVE'::public."HouseholdMemberStatus"
  ) THEN
    RAISE EXCEPTION 'Items can only be assigned to an active household member.' USING ERRCODE = '22023';
  END IF;
  IF NEW."isCompleted" THEN
    NEW."completedAt" := CASE WHEN TG_OP = 'UPDATE'
      THEN COALESCE(OLD."completedAt", CURRENT_TIMESTAMP)
      ELSE CURRENT_TIMESTAMP END;
  ELSE
    NEW."completedAt" := NULL;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_household_item_write()
FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "validate_household_item_before_write"
BEFORE INSERT OR UPDATE ON public."HouseholdItem"
FOR EACH ROW EXECUTE FUNCTION nestmate_private.validate_household_item_write();

CREATE FUNCTION nestmate_private.sync_household_after_match_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM nestmate_private.sync_household_from_finalized_space(NEW."id");
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.sync_household_after_match_change()
FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "sync_household_after_match_change"
AFTER INSERT OR UPDATE OF "status", "closureReason" ON public."FinalizedDocumentSpace"
FOR EACH ROW EXECUTE FUNCTION nestmate_private.sync_household_after_match_change();

CREATE POLICY "Active members can read their household"
ON public."Household" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_household("id")));
CREATE POLICY "Active members can archive their household"
ON public."Household" FOR UPDATE TO authenticated
USING ((SELECT nestmate_private.can_manage_household("id")))
WITH CHECK ((SELECT nestmate_private.can_access_household("id")));

CREATE POLICY "Active members can read household membership"
ON public."HouseholdMember" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_household("householdId")));
CREATE POLICY "Members can leave their own household"
ON public."HouseholdMember" FOR UPDATE TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND "status" = 'ACTIVE'::public."HouseholdMemberStatus"
  AND (SELECT nestmate_private.can_access_household("householdId"))
)
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND "status" = 'LEFT'::public."HouseholdMemberStatus"
);

CREATE POLICY "Active members can read private household items"
ON public."HouseholdItem" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_household("householdId")));
CREATE POLICY "Active members can create household items"
ON public."HouseholdItem" FOR INSERT TO authenticated
WITH CHECK (
  "createdById" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_manage_household("householdId"))
);
CREATE POLICY "Active members can update household items"
ON public."HouseholdItem" FOR UPDATE TO authenticated
USING ((SELECT nestmate_private.can_manage_household("householdId")))
WITH CHECK ((SELECT nestmate_private.can_manage_household("householdId")));
CREATE POLICY "Creators can delete active household items"
ON public."HouseholdItem" FOR DELETE TO authenticated
USING (
  "createdById" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_manage_household("householdId"))
);

DO $$
DECLARE space_record RECORD;
BEGIN
  FOR space_record IN SELECT "id" FROM public."FinalizedDocumentSpace" LOOP
    PERFORM nestmate_private.sync_household_from_finalized_space(space_record."id");
  END LOOP;
END;
$$;
