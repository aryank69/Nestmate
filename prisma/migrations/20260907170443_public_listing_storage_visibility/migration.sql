CREATE OR REPLACE FUNCTION nestmate_private.can_view_public_listing_image(
  object_name TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH viewer AS (
    SELECT
      (SELECT auth.uid()) AS auth_user_id,
      nestmate_private.current_nestmate_user_id() AS user_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public."Post" AS listing_post
    JOIN public."Community" AS locality_community
      ON locality_community."id" = listing_post."communityId"
    CROSS JOIN viewer
    WHERE listing_post."id" = (storage.foldername(object_name))[2]
      AND object_name = ANY(listing_post."imagePaths")
      AND listing_post."type" IN (
        'ROOM_AVAILABLE'::public."PostType",
        'PG_AVAILABLE'::public."PostType"
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public."User" AS owner_user
          WHERE owner_user."id" = listing_post."authorId"
            AND owner_user."authUserId" = viewer.auth_user_id
        )
        OR (
          listing_post."status" = 'ACTIVE'::public."PostStatus"
          AND listing_post."availabilityStatus" IN (
            'AVAILABLE'::public."ListingAvailabilityStatus",
            'RESERVED'::public."ListingAvailabilityStatus"
          )
          AND listing_post."publishedAt" IS NOT NULL
          AND listing_post."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
          AND locality_community."isActive" = TRUE
          AND nestmate_private.is_user_content_visible(listing_post."authorId")
          AND (
            viewer.user_id IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM public."UserBlock" AS user_block
              WHERE (
                user_block."blockerId" = viewer.user_id
                AND user_block."blockedId" = listing_post."authorId"
              ) OR (
                user_block."blockedId" = viewer.user_id
                AND user_block."blockerId" = listing_post."authorId"
              )
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION nestmate_private.can_view_public_listing_image(TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_view_public_listing_image(TEXT)
TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can view valid listing images" ON storage.objects;
CREATE POLICY "Anyone can view valid listing images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'listing-images'
  AND (SELECT nestmate_private.can_view_public_listing_image(storage.objects.name))
);
