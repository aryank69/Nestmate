CREATE TABLE public."RecentView" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "viewerId" TEXT NOT NULL,
  "postId" TEXT,
  "viewedUserId" TEXT,
  "viewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecentView_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecentView_exactly_one_target_check"
    CHECK (num_nonnulls("postId", "viewedUserId") = 1)
);

CREATE UNIQUE INDEX "RecentView_viewerId_postId_key"
ON public."RecentView"("viewerId", "postId");
CREATE UNIQUE INDEX "RecentView_viewerId_viewedUserId_key"
ON public."RecentView"("viewerId", "viewedUserId");
CREATE INDEX "RecentView_viewerId_viewedAt_idx"
ON public."RecentView"("viewerId", "viewedAt" DESC);
CREATE INDEX "RecentView_postId_idx" ON public."RecentView"("postId");
CREATE INDEX "RecentView_viewedUserId_idx"
ON public."RecentView"("viewedUserId");

ALTER TABLE public."RecentView"
ADD CONSTRAINT "RecentView_viewerId_fkey"
FOREIGN KEY ("viewerId") REFERENCES public."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."RecentView"
ADD CONSTRAINT "RecentView_postId_fkey"
FOREIGN KEY ("postId") REFERENCES public."Post"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."RecentView"
ADD CONSTRAINT "RecentView_viewedUserId_fkey"
FOREIGN KEY ("viewedUserId") REFERENCES public."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- A caller-scoped helper lets RLS honor blocks in either direction without
-- exposing another user's block rows through the Data API.
CREATE FUNCTION nestmate_private.can_access_recent_view(
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
  target_owner_id TEXT;
BEGIN
  IF current_user_id IS NULL
    OR num_nonnulls(target_post_id, target_user_id) <> 1 THEN
    RETURN FALSE;
  END IF;

  IF target_post_id IS NOT NULL THEN
    SELECT viewed_post."authorId" INTO target_owner_id
    FROM public."Post" AS viewed_post
    WHERE viewed_post."id" = target_post_id
      AND viewed_post."status" = 'ACTIVE'::public."PostStatus"
      AND viewed_post."publishedAt" IS NOT NULL;
  ELSE
    SELECT viewed_user."id" INTO target_owner_id
    FROM public."User" AS viewed_user
    WHERE viewed_user."id" = target_user_id
      AND viewed_user."id" <> current_user_id;
  END IF;

  IF target_owner_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public."UserBlock" AS user_block
    WHERE (
      user_block."blockerId" = current_user_id
      AND user_block."blockedId" = target_owner_id
    ) OR (
      user_block."blockerId" = target_owner_id
      AND user_block."blockedId" = current_user_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.can_access_recent_view(TEXT, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_recent_view(TEXT, TEXT)
TO authenticated;

ALTER TABLE public."RecentView" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."RecentView"
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."RecentView"
TO authenticated;

CREATE POLICY "Users can read their own available recent views"
ON public."RecentView"
FOR SELECT
TO authenticated
USING (
  "viewerId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_recent_view("postId", "viewedUserId"))
);

CREATE POLICY "Users can record their own available recent views"
ON public."RecentView"
FOR INSERT
TO authenticated
WITH CHECK (
  "viewerId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_recent_view("postId", "viewedUserId"))
);

CREATE POLICY "Users can refresh their own available recent views"
ON public."RecentView"
FOR UPDATE
TO authenticated
USING (
  "viewerId" = (SELECT nestmate_private.current_nestmate_user_id())
)
WITH CHECK (
  "viewerId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_recent_view("postId", "viewedUserId"))
);

CREATE POLICY "Users can remove their own recent views"
ON public."RecentView"
FOR DELETE
TO authenticated
USING (
  "viewerId" = (SELECT nestmate_private.current_nestmate_user_id())
);
