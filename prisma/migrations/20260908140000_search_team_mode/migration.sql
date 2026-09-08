CREATE TYPE public."SearchTeamRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE public."SearchTeamInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');
CREATE TYPE public."SearchTeamListingStatus" AS ENUM ('CONSIDERING', 'SHORTLISTED');
CREATE TYPE public."SearchTeamVoteChoice" AS ENUM ('YES', 'MAYBE', 'NO');

CREATE TABLE public."SearchTeam" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(80) NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchTeam_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SearchTeam_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 80),
  CONSTRAINT "SearchTeam_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE public."SearchTeamMember" (
  "teamId" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "role" public."SearchTeamRole" NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchTeamMember_pkey" PRIMARY KEY ("teamId", "userId"),
  CONSTRAINT "SearchTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."SearchTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SearchTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE public."SearchTeamInvite" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "teamId" UUID NOT NULL,
  "invitedById" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "status" public."SearchTeamInviteStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "acceptedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchTeamInvite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SearchTeamInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."SearchTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SearchTeamInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SearchTeamInvite_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SearchTeamInvite_participants_check" CHECK ("invitedById" <> "recipientId")
);

CREATE TABLE public."SearchTeamListing" (
  "teamId" UUID NOT NULL,
  "postId" TEXT NOT NULL,
  "addedById" TEXT NOT NULL,
  "status" public."SearchTeamListingStatus" NOT NULL DEFAULT 'CONSIDERING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchTeamListing_pkey" PRIMARY KEY ("teamId", "postId"),
  CONSTRAINT "SearchTeamListing_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."SearchTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SearchTeamListing_postId_fkey" FOREIGN KEY ("postId") REFERENCES public."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SearchTeamListing_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE public."SearchTeamVote" (
  "teamId" UUID NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "choice" public."SearchTeamVoteChoice" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchTeamVote_pkey" PRIMARY KEY ("teamId", "postId", "userId"),
  CONSTRAINT "SearchTeamVote_listing_fkey" FOREIGN KEY ("teamId", "postId") REFERENCES public."SearchTeamListing"("teamId", "postId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SearchTeamVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE public."SearchTeamComment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "teamId" UUID NOT NULL,
  "postId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchTeamComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SearchTeamComment_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 1000),
  CONSTRAINT "SearchTeamComment_listing_fkey" FOREIGN KEY ("teamId", "postId") REFERENCES public."SearchTeamListing"("teamId", "postId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SearchTeamComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE public."SearchTeamVisit" (
  "teamId" UUID NOT NULL,
  "visitId" UUID NOT NULL,
  "postId" TEXT NOT NULL,
  "sharedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchTeamVisit_pkey" PRIMARY KEY ("teamId", "visitId"),
  CONSTRAINT "SearchTeamVisit_listing_fkey" FOREIGN KEY ("teamId", "postId") REFERENCES public."SearchTeamListing"("teamId", "postId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SearchTeamVisit_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES public."VisitRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SearchTeamVisit_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SearchTeam_ownerId_updatedAt_idx" ON public."SearchTeam"("ownerId", "updatedAt" DESC);
CREATE INDEX "SearchTeamMember_userId_joinedAt_idx" ON public."SearchTeamMember"("userId", "joinedAt" DESC);
CREATE UNIQUE INDEX "SearchTeamInvite_teamId_recipientId_key" ON public."SearchTeamInvite"("teamId", "recipientId");
CREATE INDEX "SearchTeamInvite_recipientId_status_expiresAt_idx" ON public."SearchTeamInvite"("recipientId", "status", "expiresAt");
CREATE INDEX "SearchTeamInvite_teamId_status_updatedAt_idx" ON public."SearchTeamInvite"("teamId", "status", "updatedAt" DESC);
CREATE INDEX "SearchTeamListing_postId_idx" ON public."SearchTeamListing"("postId");
CREATE INDEX "SearchTeamListing_teamId_status_updatedAt_idx" ON public."SearchTeamListing"("teamId", "status", "updatedAt" DESC);
CREATE INDEX "SearchTeamListing_addedById_createdAt_idx" ON public."SearchTeamListing"("addedById", "createdAt" DESC);
CREATE INDEX "SearchTeamVote_userId_updatedAt_idx" ON public."SearchTeamVote"("userId", "updatedAt" DESC);
CREATE INDEX "SearchTeamComment_teamId_postId_createdAt_idx" ON public."SearchTeamComment"("teamId", "postId", "createdAt");
CREATE INDEX "SearchTeamComment_authorId_createdAt_idx" ON public."SearchTeamComment"("authorId", "createdAt" DESC);
CREATE INDEX "SearchTeamVisit_visitId_idx" ON public."SearchTeamVisit"("visitId");
CREATE INDEX "SearchTeamVisit_teamId_postId_createdAt_idx" ON public."SearchTeamVisit"("teamId", "postId", "createdAt" DESC);
CREATE INDEX "SearchTeamVisit_sharedById_createdAt_idx" ON public."SearchTeamVisit"("sharedById", "createdAt" DESC);

ALTER TABLE public."SearchTeam" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SearchTeamMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SearchTeamInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SearchTeamListing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SearchTeamVote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SearchTeamComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SearchTeamVisit" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."SearchTeam", public."SearchTeamMember", public."SearchTeamInvite", public."SearchTeamListing", public."SearchTeamVote", public."SearchTeamComment", public."SearchTeamVisit" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."SearchTeam", public."SearchTeamMember", public."SearchTeamInvite", public."SearchTeamListing", public."SearchTeamVote", public."SearchTeamComment", public."SearchTeamVisit" TO authenticated;
REVOKE ALL ON TYPE public."SearchTeamRole", public."SearchTeamInviteStatus", public."SearchTeamListingStatus", public."SearchTeamVoteChoice" FROM PUBLIC;
GRANT USAGE ON TYPE public."SearchTeamRole", public."SearchTeamInviteStatus", public."SearchTeamListingStatus", public."SearchTeamVoteChoice" TO authenticated;

CREATE FUNCTION nestmate_private.is_search_team_member(target_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."SearchTeamMember" AS member
    WHERE member."teamId" = target_team_id
      AND member."userId" = nestmate_private.current_nestmate_user_id()
  );
$$;
REVOKE ALL ON FUNCTION nestmate_private.is_search_team_member(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.is_search_team_member(UUID) TO authenticated;

CREATE FUNCTION nestmate_private.is_search_team_owner(target_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."SearchTeam" AS team
    WHERE team."id" = target_team_id
      AND team."ownerId" = nestmate_private.current_nestmate_user_id()
  );
$$;
REVOKE ALL ON FUNCTION nestmate_private.is_search_team_owner(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.is_search_team_owner(UUID) TO authenticated;

CREATE FUNCTION nestmate_private.can_access_search_team_listing(target_team_id UUID, target_post_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT nestmate_private.is_search_team_member(target_team_id)
    AND EXISTS (
      SELECT 1 FROM public."Post" AS listing
      WHERE listing."id" = target_post_id
        AND listing."type"::TEXT IN ('ROOM_AVAILABLE', 'PG_AVAILABLE')
        AND listing."status"::TEXT = 'ACTIVE'
        AND listing."moderationStatus"::TEXT = 'VISIBLE'
        AND listing."availabilityStatus"::TEXT <> 'CLOSED'
        AND listing."publishedAt" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public."UserBlock" AS user_block
          WHERE (user_block."blockerId" = nestmate_private.current_nestmate_user_id() AND user_block."blockedId" = listing."authorId")
             OR (user_block."blockerId" = listing."authorId" AND user_block."blockedId" = nestmate_private.current_nestmate_user_id())
        )
        AND NOT EXISTS (
          SELECT 1 FROM public."UserModerationState" AS moderation_state
          WHERE moderation_state."userId" = listing."authorId"
            AND moderation_state."status"::TEXT = 'SUSPENDED'
        )
    );
$$;
REVOKE ALL ON FUNCTION nestmate_private.can_access_search_team_listing(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_search_team_listing(UUID, TEXT) TO authenticated;

CREATE POLICY "Members can read their search teams" ON public."SearchTeam" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.is_search_team_member("id")));
CREATE POLICY "Users can create owned search teams" ON public."SearchTeam" FOR INSERT TO authenticated
WITH CHECK ("ownerId" = (SELECT nestmate_private.current_nestmate_user_id()));
CREATE POLICY "Owners can update search teams" ON public."SearchTeam" FOR UPDATE TO authenticated
USING ((SELECT nestmate_private.is_search_team_owner("id")))
WITH CHECK ("ownerId" = (SELECT nestmate_private.current_nestmate_user_id()));
CREATE POLICY "Owners can delete search teams" ON public."SearchTeam" FOR DELETE TO authenticated
USING ((SELECT nestmate_private.is_search_team_owner("id")));

CREATE POLICY "Members can read team membership" ON public."SearchTeamMember" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.is_search_team_member("teamId")));
CREATE POLICY "Users can join owned or accepted teams" ON public."SearchTeamMember" FOR INSERT TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (
    ("role"::TEXT = 'OWNER' AND (SELECT nestmate_private.is_search_team_owner("teamId")))
    OR (
      "role"::TEXT = 'MEMBER'
      AND EXISTS (
        SELECT 1 FROM public."SearchTeamInvite" AS invite
        WHERE invite."teamId" = "SearchTeamMember"."teamId"
          AND invite."recipientId" = "SearchTeamMember"."userId"
          AND invite."status"::TEXT = 'ACCEPTED'
          AND invite."expiresAt" > CURRENT_TIMESTAMP
      )
    )
  )
);
CREATE POLICY "Members can leave and owners can remove members" ON public."SearchTeamMember" FOR DELETE TO authenticated
USING (
  ("userId" = (SELECT nestmate_private.current_nestmate_user_id()) AND "role"::TEXT = 'MEMBER')
  OR ((SELECT nestmate_private.is_search_team_owner("teamId")) AND "role"::TEXT = 'MEMBER')
);

CREATE POLICY "Recipients and members can read team invites" ON public."SearchTeamInvite" FOR SELECT TO authenticated
USING (
  "recipientId" = (SELECT nestmate_private.current_nestmate_user_id())
  OR (SELECT nestmate_private.is_search_team_member("teamId"))
);
CREATE POLICY "Members can invite users" ON public."SearchTeamInvite" FOR INSERT TO authenticated
WITH CHECK (
  "invitedById" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.is_search_team_member("teamId"))
);
CREATE POLICY "Recipients and inviters can update invites" ON public."SearchTeamInvite" FOR UPDATE TO authenticated
USING (
  "recipientId" = (SELECT nestmate_private.current_nestmate_user_id())
  OR (SELECT nestmate_private.is_search_team_member("teamId"))
)
WITH CHECK (
  "recipientId" = (SELECT nestmate_private.current_nestmate_user_id())
  OR (SELECT nestmate_private.is_search_team_member("teamId"))
);

CREATE POLICY "Members can read visible shared listings" ON public."SearchTeamListing" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_search_team_listing("teamId", "postId")));
CREATE POLICY "Members can share their saved listings" ON public."SearchTeamListing" FOR INSERT TO authenticated
WITH CHECK (
  "addedById" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_search_team_listing("teamId", "postId"))
  AND EXISTS (
    SELECT 1 FROM public."SavedPost" AS saved
    WHERE saved."userId" = "SearchTeamListing"."addedById"
      AND saved."postId" = "SearchTeamListing"."postId"
  )
);
CREATE POLICY "Members can update shared shortlist status" ON public."SearchTeamListing" FOR UPDATE TO authenticated
USING ((SELECT nestmate_private.can_access_search_team_listing("teamId", "postId")))
WITH CHECK ((SELECT nestmate_private.can_access_search_team_listing("teamId", "postId")));
CREATE POLICY "Contributors and owners can remove shared listings" ON public."SearchTeamListing" FOR DELETE TO authenticated
USING (
  ("addedById" = (SELECT nestmate_private.current_nestmate_user_id()) OR (SELECT nestmate_private.is_search_team_owner("teamId")))
  AND (SELECT nestmate_private.is_search_team_member("teamId"))
);

CREATE POLICY "Members can read votes for visible listings" ON public."SearchTeamVote" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_search_team_listing("teamId", "postId")));
CREATE POLICY "Members can cast their own votes" ON public."SearchTeamVote" FOR INSERT TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_search_team_listing("teamId", "postId"))
);
CREATE POLICY "Members can update their own votes" ON public."SearchTeamVote" FOR UPDATE TO authenticated
USING ("userId" = (SELECT nestmate_private.current_nestmate_user_id()))
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_search_team_listing("teamId", "postId"))
);
CREATE POLICY "Members can remove their own votes" ON public."SearchTeamVote" FOR DELETE TO authenticated
USING ("userId" = (SELECT nestmate_private.current_nestmate_user_id()));

CREATE POLICY "Members can read comments for visible listings" ON public."SearchTeamComment" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_search_team_listing("teamId", "postId")));
CREATE POLICY "Members can add their own comments" ON public."SearchTeamComment" FOR INSERT TO authenticated
WITH CHECK (
  "authorId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_search_team_listing("teamId", "postId"))
);
CREATE POLICY "Authors can update their comments" ON public."SearchTeamComment" FOR UPDATE TO authenticated
USING ("authorId" = (SELECT nestmate_private.current_nestmate_user_id()))
WITH CHECK (
  "authorId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_search_team_listing("teamId", "postId"))
);
CREATE POLICY "Authors can delete their comments" ON public."SearchTeamComment" FOR DELETE TO authenticated
USING ("authorId" = (SELECT nestmate_private.current_nestmate_user_id()));

CREATE POLICY "Members can read privacy-safe shared visits" ON public."SearchTeamVisit" FOR SELECT TO authenticated
USING ((SELECT nestmate_private.can_access_search_team_listing("teamId", "postId")));
CREATE POLICY "Requesters can share their own visits" ON public."SearchTeamVisit" FOR INSERT TO authenticated
WITH CHECK (
  "sharedById" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_search_team_listing("teamId", "postId"))
  AND EXISTS (
    SELECT 1 FROM public."VisitRequest" AS visit
    WHERE visit."id" = "SearchTeamVisit"."visitId"
      AND visit."postId" = "SearchTeamVisit"."postId"
      AND visit."requesterId" = "SearchTeamVisit"."sharedById"
      AND visit."status"::TEXT IN ('PENDING', 'PROPOSED', 'ACCEPTED')
  )
);
CREATE POLICY "Sharers and owners can remove shared visits" ON public."SearchTeamVisit" FOR DELETE TO authenticated
USING (
  "sharedById" = (SELECT nestmate_private.current_nestmate_user_id())
  OR (SELECT nestmate_private.is_search_team_owner("teamId"))
);

CREATE FUNCTION nestmate_private.validate_search_team_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_user_id TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  NEW."name" := btrim(NEW."name");
  IF current_user_id IS NULL OR NEW."ownerId" <> current_user_id THEN
    RAISE EXCEPTION 'A search team must be owned by the signed-in user.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."ownerId" IS DISTINCT FROM OLD."ownerId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt") THEN
    RAISE EXCEPTION 'Search team ownership cannot be changed.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW."createdAt" := CURRENT_TIMESTAMP; END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_search_team_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "validate_search_team_before_write" BEFORE INSERT OR UPDATE ON public."SearchTeam" FOR EACH ROW EXECUTE FUNCTION nestmate_private.validate_search_team_write();

CREATE FUNCTION nestmate_private.validate_search_team_invite_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_user_id TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW."id" IS DISTINCT FROM OLD."id" OR NEW."teamId" IS DISTINCT FROM OLD."teamId" OR NEW."recipientId" IS DISTINCT FROM OLD."recipientId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt") THEN
    RAISE EXCEPTION 'Invitation identity cannot be changed.' USING ERRCODE = '42501';
  END IF;
  IF current_user_id = NEW."recipientId" THEN
    IF TG_OP <> 'UPDATE' OR NEW."status"::TEXT NOT IN ('ACCEPTED', 'DECLINED') OR OLD."status"::TEXT <> 'PENDING' OR NEW."expiresAt" <= CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'This invitation cannot be accepted or declined.' USING ERRCODE = '42501';
    END IF;
    NEW."invitedById" := OLD."invitedById";
    NEW."expiresAt" := OLD."expiresAt";
    NEW."acceptedAt" := CASE WHEN NEW."status"::TEXT = 'ACCEPTED' THEN CURRENT_TIMESTAMP ELSE NULL END;
  ELSE
    IF NEW."invitedById" <> current_user_id OR NOT nestmate_private.is_search_team_member(NEW."teamId") OR NEW."recipientId" = current_user_id OR NEW."status"::TEXT NOT IN ('PENDING', 'CANCELLED') THEN
      RAISE EXCEPTION 'Only team members can manage invitations.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public."SearchTeamMember" member WHERE member."teamId" = NEW."teamId" AND member."userId" = NEW."recipientId") THEN
      RAISE EXCEPTION 'This user is already a team member.' USING ERRCODE = '23505';
    END IF;
    NEW."acceptedAt" := NULL;
    IF NEW."status"::TEXT = 'PENDING' THEN NEW."expiresAt" := CURRENT_TIMESTAMP + interval '7 days'; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN NEW."createdAt" := CURRENT_TIMESTAMP; END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_search_team_invite_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "validate_search_team_invite_before_write" BEFORE INSERT OR UPDATE ON public."SearchTeamInvite" FOR EACH ROW EXECUTE FUNCTION nestmate_private.validate_search_team_invite_write();

CREATE FUNCTION nestmate_private.validate_search_team_listing_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."teamId" IS DISTINCT FROM OLD."teamId" OR NEW."postId" IS DISTINCT FROM OLD."postId" OR NEW."addedById" IS DISTINCT FROM OLD."addedById" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt") THEN
    RAISE EXCEPTION 'Shared listing identity cannot be changed.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW."createdAt" := CURRENT_TIMESTAMP; END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_search_team_listing_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "validate_search_team_listing_before_write" BEFORE INSERT OR UPDATE ON public."SearchTeamListing" FOR EACH ROW EXECUTE FUNCTION nestmate_private.validate_search_team_listing_write();

CREATE FUNCTION nestmate_private.validate_search_team_comment_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."teamId" IS DISTINCT FROM OLD."teamId" OR NEW."postId" IS DISTINCT FROM OLD."postId" OR NEW."authorId" IS DISTINCT FROM OLD."authorId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt") THEN
    RAISE EXCEPTION 'Comment identity cannot be changed.' USING ERRCODE = '42501';
  END IF;
  NEW."body" := btrim(NEW."body");
  IF char_length(NEW."body") NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Comments must be 1 to 1000 characters.' USING ERRCODE = '22023'; END IF;
  IF TG_OP = 'INSERT' THEN NEW."createdAt" := CURRENT_TIMESTAMP; END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_search_team_comment_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "validate_search_team_comment_before_write" BEFORE INSERT OR UPDATE ON public."SearchTeamComment" FOR EACH ROW EXECUTE FUNCTION nestmate_private.validate_search_team_comment_write();

CREATE FUNCTION nestmate_private.validate_search_team_vote_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW."userId" <> nestmate_private.current_nestmate_user_id() THEN RAISE EXCEPTION 'Votes can be recorded only for yourself.' USING ERRCODE = '42501'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW."teamId" IS DISTINCT FROM OLD."teamId" OR NEW."postId" IS DISTINCT FROM OLD."postId" OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt") THEN
    RAISE EXCEPTION 'Vote identity cannot be changed.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW."createdAt" := CURRENT_TIMESTAMP; END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_search_team_vote_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "validate_search_team_vote_before_write" BEFORE INSERT OR UPDATE ON public."SearchTeamVote" FOR EACH ROW EXECUTE FUNCTION nestmate_private.validate_search_team_vote_write();
