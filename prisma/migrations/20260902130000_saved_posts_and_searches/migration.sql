CREATE TYPE public."SavedSearchKind" AS ENUM ('COMMUNITY_POSTS', 'PEOPLE');

CREATE TABLE public."SavedPost" (
  "userId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SavedPost_pkey" PRIMARY KEY ("userId", "postId"),
  CONSTRAINT "SavedPost_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SavedPost_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES public."Post"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE public."SavedSearch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "kind" public."SavedSearchKind" NOT NULL,
  "path" VARCHAR(500) NOT NULL,
  "filters" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavedSearch_name_check"
    CHECK (char_length(btrim("name")) BETWEEN 1 AND 80),
  CONSTRAINT "SavedSearch_path_check"
    CHECK (
      char_length("path") BETWEEN 1 AND 500
      AND "path" LIKE '/%'
      AND "path" NOT LIKE '//%'
    ),
  CONSTRAINT "SavedSearch_filters_object_check"
    CHECK (jsonb_typeof("filters") = 'object'),
  CONSTRAINT "SavedSearch_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SavedPost_postId_idx"
ON public."SavedPost"("postId");

CREATE INDEX "SavedSearch_userId_createdAt_idx"
ON public."SavedSearch"("userId", "createdAt" DESC);

ALTER TABLE public."SavedPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SavedSearch" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."SavedPost"
FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."SavedSearch"
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public."SavedPost" TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public."SavedSearch" TO authenticated;
GRANT USAGE ON TYPE public."SavedSearchKind" TO authenticated;

CREATE POLICY "Users can read their own saved posts"
ON public."SavedPost"
FOR SELECT
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
);

CREATE POLICY "Users can save posts for themselves"
ON public."SavedPost"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND EXISTS (
    SELECT 1
    FROM public."Post" AS saved_post
    WHERE saved_post."id" = "SavedPost"."postId"
      AND saved_post."status" = 'ACTIVE'::public."PostStatus"
      AND saved_post."publishedAt" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public."UserBlock" AS user_block
        WHERE user_block."blockerId" = (SELECT nestmate_private.current_nestmate_user_id())
          AND user_block."blockedId" = saved_post."authorId"
      )
  )
);

CREATE POLICY "Users can remove their own saved posts"
ON public."SavedPost"
FOR DELETE
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
);

CREATE POLICY "Users can read their own saved searches"
ON public."SavedSearch"
FOR SELECT
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
);

CREATE POLICY "Users can create their own saved searches"
ON public."SavedSearch"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
);

CREATE POLICY "Users can remove their own saved searches"
ON public."SavedSearch"
FOR DELETE
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
);
