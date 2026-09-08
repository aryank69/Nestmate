CREATE OR REPLACE FUNCTION nestmate_private.can_access_recent_view(
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
      AND viewed_user."id" <> current_user_id
      AND EXISTS (
        SELECT 1
        FROM public."UserPreferences" AS viewed_preferences
        WHERE viewed_preferences."userId" = viewed_user."id"
      );
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
