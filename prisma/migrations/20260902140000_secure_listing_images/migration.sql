ALTER TABLE public."Post"
ADD COLUMN "imagePaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public."Post"
ADD CONSTRAINT "Post_listing_images_check"
CHECK (
  cardinality("imagePaths") <= 6
  AND (
    cardinality("imagePaths") = 0
    OR "type" IN (
      'ROOM_AVAILABLE'::public."PostType",
      'PG_AVAILABLE'::public."PostType"
    )
  )
);

INSERT INTO storage.buckets (
  "id",
  "name",
  "public",
  "file_size_limit",
  "allowed_mime_types"
)
VALUES (
  'listing-images',
  'listing-images',
  FALSE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::TEXT[]
)
ON CONFLICT ("id") DO UPDATE
SET
  "public" = EXCLUDED."public",
  "file_size_limit" = EXCLUDED."file_size_limit",
  "allowed_mime_types" = EXCLUDED."allowed_mime_types";

DROP POLICY IF EXISTS "Users can create their own community posts" ON public."Post";
CREATE POLICY "Users can create their own community posts"
ON public."Post"
FOR INSERT
TO authenticated
WITH CHECK (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "publishedAt" IS NOT NULL
  AND cardinality("imagePaths") <= 6
  AND (
    cardinality("imagePaths") = 0
    OR (
      "type" IN (
        'ROOM_AVAILABLE'::public."PostType",
        'PG_AVAILABLE'::public."PostType"
      )
      AND cardinality("imagePaths") = (
        SELECT count(DISTINCT listing_path)
        FROM unnest("imagePaths") AS listing_path
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest("imagePaths") AS listing_path
        WHERE listing_path NOT LIKE (
          (SELECT auth.uid())::TEXT || '/' || "Post"."id" || '/%'
        )
      )
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "Post"."authorId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public."Community" AS locality_community
    WHERE locality_community."id" = "Post"."communityId"
      AND locality_community."isActive" = TRUE
  )
);

DROP POLICY IF EXISTS "Users can update their own community posts" ON public."Post";
CREATE POLICY "Users can update their own community posts"
ON public."Post"
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "Post"."authorId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
)
WITH CHECK (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "publishedAt" IS NOT NULL
  AND cardinality("imagePaths") <= 6
  AND (
    cardinality("imagePaths") = 0
    OR (
      "type" IN (
        'ROOM_AVAILABLE'::public."PostType",
        'PG_AVAILABLE'::public."PostType"
      )
      AND cardinality("imagePaths") = (
        SELECT count(DISTINCT listing_path)
        FROM unnest("imagePaths") AS listing_path
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest("imagePaths") AS listing_path
        WHERE listing_path NOT LIKE (
          (SELECT auth.uid())::TEXT || '/' || "Post"."id" || '/%'
        )
      )
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "Post"."authorId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public."Community" AS locality_community
    WHERE locality_community."id" = "Post"."communityId"
      AND locality_community."isActive" = TRUE
  )
);

DROP POLICY IF EXISTS "Anyone can view valid listing images" ON storage.objects;
CREATE POLICY "Anyone can view valid listing images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'listing-images'
  AND EXISTS (
    SELECT 1
    FROM public."Post" AS listing_post
    WHERE listing_post."id" = (storage.foldername(storage.objects.name))[2]
      AND listing_post."status" = 'ACTIVE'::public."PostStatus"
      AND listing_post."publishedAt" IS NOT NULL
      AND listing_post."type" IN (
        'ROOM_AVAILABLE'::public."PostType",
        'PG_AVAILABLE'::public."PostType"
      )
      AND storage.objects.name = ANY(listing_post."imagePaths")
  )
);

DROP POLICY IF EXISTS "Owners can upload listing images" ON storage.objects;
CREATE POLICY "Owners can upload listing images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'listing-images'
  AND owner_id = (SELECT auth.uid())::TEXT
  AND array_length(storage.foldername(name), 1) = 2
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  AND storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  AND EXISTS (
    SELECT 1
    FROM public."Post" AS listing_post
    WHERE listing_post."id" = (storage.foldername(name))[2]
      AND listing_post."authorId" = (
        SELECT nestmate_private.current_nestmate_user_id()
      )
      AND listing_post."type" IN (
        'ROOM_AVAILABLE'::public."PostType",
        'PG_AVAILABLE'::public."PostType"
      )
  )
);

DROP POLICY IF EXISTS "Owners can delete listing images" ON storage.objects;
CREATE POLICY "Owners can delete listing images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'listing-images'
  AND owner_id = (SELECT auth.uid())::TEXT
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  AND EXISTS (
    SELECT 1
    FROM public."Post" AS listing_post
    WHERE listing_post."id" = (storage.foldername(name))[2]
      AND listing_post."authorId" = (
        SELECT nestmate_private.current_nestmate_user_id()
      )
  )
);
