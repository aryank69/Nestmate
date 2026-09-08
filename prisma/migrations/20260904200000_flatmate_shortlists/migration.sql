CREATE TABLE public."ShortlistedProfile" (
  "userId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShortlistedProfile_pkey" PRIMARY KEY ("userId", "targetUserId"),
  CONSTRAINT "ShortlistedProfile_not_self_check" CHECK ("userId" <> "targetUserId")
);

CREATE INDEX "ShortlistedProfile_userId_createdAt_idx"
ON public."ShortlistedProfile"("userId", "createdAt" DESC);
CREATE INDEX "ShortlistedProfile_targetUserId_idx"
ON public."ShortlistedProfile"("targetUserId");

ALTER TABLE public."ShortlistedProfile"
ADD CONSTRAINT "ShortlistedProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES public."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."ShortlistedProfile"
ADD CONSTRAINT "ShortlistedProfile_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES public."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."ShortlistedProfile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."ShortlistedProfile"
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public."ShortlistedProfile"
TO authenticated;

CREATE POLICY "Users can read their own visible profile shortlist"
ON public."ShortlistedProfile"
FOR SELECT
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_recent_view(NULL, "targetUserId"))
  AND (SELECT nestmate_private.is_user_content_visible("targetUserId"))
);

CREATE POLICY "Users can add visible profiles to their own shortlist"
ON public."ShortlistedProfile"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND "userId" <> "targetUserId"
  AND (SELECT nestmate_private.can_access_recent_view(NULL, "targetUserId"))
  AND (SELECT nestmate_private.is_user_content_visible("targetUserId"))
);

CREATE POLICY "Users can remove profiles from their own shortlist"
ON public."ShortlistedProfile"
FOR DELETE
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
);
