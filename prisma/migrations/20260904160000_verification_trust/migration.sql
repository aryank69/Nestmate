CREATE TYPE public."VerificationKind" AS ENUM (
  'EMAIL',
  'PHONE',
  'PROFILE_COMPLETE',
  'LISTING_DETAILS',
  'IDENTITY',
  'PROPERTY'
);

CREATE TYPE public."VerificationStatus" AS ENUM (
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'EXPIRED'
);

CREATE TYPE public."VerificationMethod" AS ENUM (
  'AUTH_PROVIDER',
  'COMPLETENESS_RULES',
  'MANUAL_REVIEW',
  'THIRD_PARTY'
);

CREATE TABLE public."VerificationCheck" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" public."VerificationKind" NOT NULL,
  "status" public."VerificationStatus" NOT NULL DEFAULT 'PENDING',
  "method" public."VerificationMethod" NOT NULL,
  "userId" TEXT,
  "postId" TEXT,
  "verifiedAt" TIMESTAMPTZ(3),
  "expiresAt" TIMESTAMPTZ(3),
  "providerReference" VARCHAR(200),
  "privateMetadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VerificationCheck_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VerificationCheck_one_subject_check"
    CHECK (num_nonnulls("userId", "postId") = 1),
  CONSTRAINT "VerificationCheck_kind_subject_check" CHECK (
    (
      "userId" IS NOT NULL
      AND "kind" IN (
        'EMAIL'::public."VerificationKind",
        'PHONE'::public."VerificationKind",
        'PROFILE_COMPLETE'::public."VerificationKind",
        'IDENTITY'::public."VerificationKind"
      )
    ) OR (
      "postId" IS NOT NULL
      AND "kind" IN (
        'LISTING_DETAILS'::public."VerificationKind",
        'PROPERTY'::public."VerificationKind"
      )
    )
  ),
  CONSTRAINT "VerificationCheck_status_timestamp_check" CHECK (
    (
      "status" = 'VERIFIED'::public."VerificationStatus"
      AND "verifiedAt" IS NOT NULL
    ) OR (
      "status" <> 'VERIFIED'::public."VerificationStatus"
      AND "verifiedAt" IS NULL
    )
  ),
  CONSTRAINT "VerificationCheck_expiry_check"
    CHECK ("expiresAt" IS NULL OR "verifiedAt" IS NULL OR "expiresAt" > "verifiedAt"),
  CONSTRAINT "VerificationCheck_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VerificationCheck_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES public."Post"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VerificationCheck_userId_kind_key"
ON public."VerificationCheck"("userId", "kind");
CREATE UNIQUE INDEX "VerificationCheck_postId_kind_key"
ON public."VerificationCheck"("postId", "kind");
CREATE INDEX "VerificationCheck_userId_status_kind_idx"
ON public."VerificationCheck"("userId", "status", "kind");
CREATE INDEX "VerificationCheck_postId_status_kind_idx"
ON public."VerificationCheck"("postId", "status", "kind");
CREATE INDEX "VerificationCheck_status_expiresAt_idx"
ON public."VerificationCheck"("status", "expiresAt");

ALTER TABLE public."VerificationCheck" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."VerificationCheck"
FROM PUBLIC, anon, authenticated;

-- Only safe status columns are available through the authenticated Data API.
-- Provider references and private metadata remain server/service-role only.
GRANT SELECT (
  "id", "kind", "status", "method", "userId", "postId",
  "verifiedAt", "expiresAt", "createdAt", "updatedAt"
) ON TABLE public."VerificationCheck" TO authenticated;

REVOKE ALL ON TYPE public."VerificationKind" FROM PUBLIC;
REVOKE ALL ON TYPE public."VerificationStatus" FROM PUBLIC;
REVOKE ALL ON TYPE public."VerificationMethod" FROM PUBLIC;
GRANT USAGE ON TYPE public."VerificationKind" TO authenticated;
GRANT USAGE ON TYPE public."VerificationStatus" TO authenticated;
GRANT USAGE ON TYPE public."VerificationMethod" TO authenticated;

CREATE POLICY "Users can read only their own verification status"
ON public."VerificationCheck"
FOR SELECT
TO authenticated
USING (
  (
    "userId" IS NOT NULL
    AND "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  ) OR (
    "postId" IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."Post" AS verified_listing
      WHERE verified_listing."id" = "VerificationCheck"."postId"
        AND verified_listing."authorId" = (
          SELECT nestmate_private.current_nestmate_user_id()
        )
    )
  )
);

CREATE FUNCTION nestmate_private.sync_auth_verifications(target_auth_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  app_user_id TEXT;
  auth_email_confirmed_at TIMESTAMPTZ;
  auth_phone_confirmed_at TIMESTAMPTZ;
BEGIN
  SELECT app_user."id" INTO app_user_id
  FROM public."User" AS app_user
  WHERE app_user."authUserId" = target_auth_user_id;

  SELECT auth_user.email_confirmed_at, auth_user.phone_confirmed_at
  INTO auth_email_confirmed_at, auth_phone_confirmed_at
  FROM auth.users AS auth_user
  WHERE auth_user.id = target_auth_user_id;

  IF app_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public."VerificationCheck" (
    "kind", "status", "method", "userId", "verifiedAt",
    "privateMetadata", "updatedAt"
  ) VALUES (
    'EMAIL'::public."VerificationKind",
    CASE WHEN auth_email_confirmed_at IS NULL
      THEN 'PENDING'::public."VerificationStatus"
      ELSE 'VERIFIED'::public."VerificationStatus" END,
    'AUTH_PROVIDER'::public."VerificationMethod",
    app_user_id,
    auth_email_confirmed_at,
    jsonb_build_object('source', 'supabase_auth'),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("userId", "kind") DO UPDATE SET
    "status" = EXCLUDED."status",
    "method" = EXCLUDED."method",
    "verifiedAt" = EXCLUDED."verifiedAt",
    "privateMetadata" = EXCLUDED."privateMetadata",
    "updatedAt" = CURRENT_TIMESTAMP;

  INSERT INTO public."VerificationCheck" (
    "kind", "status", "method", "userId", "verifiedAt",
    "privateMetadata", "updatedAt"
  ) VALUES (
    'PHONE'::public."VerificationKind",
    CASE WHEN auth_phone_confirmed_at IS NULL
      THEN 'PENDING'::public."VerificationStatus"
      ELSE 'VERIFIED'::public."VerificationStatus" END,
    'AUTH_PROVIDER'::public."VerificationMethod",
    app_user_id,
    auth_phone_confirmed_at,
    jsonb_build_object('source', 'supabase_auth'),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("userId", "kind") DO UPDATE SET
    "status" = EXCLUDED."status",
    "method" = EXCLUDED."method",
    "verifiedAt" = EXCLUDED."verifiedAt",
    "privateMetadata" = EXCLUDED."privateMetadata",
    "updatedAt" = CURRENT_TIMESTAMP;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.sync_auth_verifications(UUID)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.sync_auth_verifications_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM nestmate_private.sync_auth_verifications(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.sync_auth_verifications_trigger()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sync_nestmate_auth_verifications
AFTER INSERT OR UPDATE OF email_confirmed_at, phone_confirmed_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.sync_auth_verifications_trigger();

CREATE FUNCTION nestmate_private.sync_profile_complete_verification(target_user_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  is_complete BOOLEAN := FALSE;
BEGIN
  SELECT (
    char_length(btrim(app_user."name")) >= 2
    AND app_user."dateOfBirth" IS NOT NULL
    AND NULLIF(btrim(app_user."profession"), '') IS NOT NULL
    AND char_length(btrim(COALESCE(app_user."bio", ''))) >= 20
    AND (
      preferences."budgetMin" IS NOT NULL
      OR preferences."budgetMax" IS NOT NULL
    )
    AND preferences."preferredMoveInDate" IS NOT NULL
    AND preferences."diet" IS NOT NULL
    AND preferences."smoking" IS NOT NULL
    AND preferences."drinking" IS NOT NULL
    AND preferences."sleepSchedule" IS NOT NULL
    AND preferences."cleanliness" IS NOT NULL
    AND preferences."pets" IS NOT NULL
    AND preferences."occupationStatus" IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."UserPreferredLocality" AS preferred_locality
      WHERE preferred_locality."preferencesId" = preferences."id"
    )
  ) INTO is_complete
  FROM public."User" AS app_user
  JOIN public."UserPreferences" AS preferences
    ON preferences."userId" = app_user."id"
  WHERE app_user."id" = target_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public."VerificationCheck" (
    "kind", "status", "method", "userId", "verifiedAt",
    "privateMetadata", "updatedAt"
  ) VALUES (
    'PROFILE_COMPLETE'::public."VerificationKind",
    CASE WHEN is_complete
      THEN 'VERIFIED'::public."VerificationStatus"
      ELSE 'PENDING'::public."VerificationStatus" END,
    'COMPLETENESS_RULES'::public."VerificationMethod",
    target_user_id,
    CASE WHEN is_complete THEN CURRENT_TIMESTAMP ELSE NULL END,
    jsonb_build_object('rule_version', 1),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("userId", "kind") DO UPDATE SET
    "status" = EXCLUDED."status",
    "method" = EXCLUDED."method",
    "verifiedAt" = CASE
      WHEN EXCLUDED."status" = 'VERIFIED'::public."VerificationStatus"
        THEN COALESCE(public."VerificationCheck"."verifiedAt", CURRENT_TIMESTAMP)
      ELSE NULL
    END,
    "privateMetadata" = EXCLUDED."privateMetadata",
    "updatedAt" = CURRENT_TIMESTAMP;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.sync_profile_complete_verification(TEXT)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.sync_profile_complete_from_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM nestmate_private.sync_profile_complete_verification(NEW."id");
  RETURN NEW;
END;
$$;

CREATE FUNCTION nestmate_private.sync_profile_complete_from_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM nestmate_private.sync_profile_complete_verification(NEW."userId");
  RETURN NEW;
END;
$$;

CREATE FUNCTION nestmate_private.sync_profile_complete_from_locality()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_preferences_id TEXT;
  target_user_id TEXT;
BEGIN
  target_preferences_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."preferencesId"
    ELSE NEW."preferencesId"
  END;
  SELECT preferences."userId" INTO target_user_id
  FROM public."UserPreferences" AS preferences
  WHERE preferences."id" = target_preferences_id;
  IF target_user_id IS NOT NULL THEN
    PERFORM nestmate_private.sync_profile_complete_verification(target_user_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.sync_profile_complete_from_user()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.sync_profile_complete_from_preferences()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nestmate_private.sync_profile_complete_from_locality()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sync_profile_complete_after_user_change
AFTER INSERT OR UPDATE OF "name", "dateOfBirth", "profession", "bio"
ON public."User"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.sync_profile_complete_from_user();

CREATE TRIGGER sync_profile_complete_after_preferences_change
AFTER INSERT OR UPDATE OF
  "budgetMin", "budgetMax", "preferredMoveInDate", "diet", "smoking",
  "drinking", "sleepSchedule", "cleanliness", "pets", "occupationStatus"
ON public."UserPreferences"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.sync_profile_complete_from_preferences();

CREATE TRIGGER sync_profile_complete_after_locality_change
AFTER INSERT OR DELETE ON public."UserPreferredLocality"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.sync_profile_complete_from_locality();

CREATE FUNCTION nestmate_private.sync_listing_details_verification(target_post_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  is_complete BOOLEAN := FALSE;
BEGIN
  SELECT (
    listing."status" = 'ACTIVE'::public."PostStatus"
    AND listing."publishedAt" IS NOT NULL
    AND char_length(btrim(listing."description")) >= 40
    AND (
      listing."monthlyAmountMin" IS NOT NULL
      OR listing."monthlyAmountMax" IS NOT NULL
    )
    AND listing."moveInDate" IS NOT NULL
    AND listing."propertyType" IS NOT NULL
    AND listing."roomType" IS NOT NULL
    AND listing."furnishingStatus" IS NOT NULL
    AND listing."preferredOccupant" IS NOT NULL
    AND listing."availableSpots" IS NOT NULL
  ) INTO is_complete
  FROM public."Post" AS listing
  WHERE listing."id" = target_post_id
    AND listing."type" IN (
      'ROOM_AVAILABLE'::public."PostType",
      'PG_AVAILABLE'::public."PostType"
    );

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public."VerificationCheck" (
    "kind", "status", "method", "postId", "verifiedAt",
    "privateMetadata", "updatedAt"
  ) VALUES (
    'LISTING_DETAILS'::public."VerificationKind",
    CASE WHEN is_complete
      THEN 'VERIFIED'::public."VerificationStatus"
      ELSE 'PENDING'::public."VerificationStatus" END,
    'COMPLETENESS_RULES'::public."VerificationMethod",
    target_post_id,
    CASE WHEN is_complete THEN CURRENT_TIMESTAMP ELSE NULL END,
    jsonb_build_object('rule_version', 1),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("postId", "kind") DO UPDATE SET
    "status" = EXCLUDED."status",
    "method" = EXCLUDED."method",
    "verifiedAt" = CASE
      WHEN EXCLUDED."status" = 'VERIFIED'::public."VerificationStatus"
        THEN COALESCE(public."VerificationCheck"."verifiedAt", CURRENT_TIMESTAMP)
      ELSE NULL
    END,
    "privateMetadata" = EXCLUDED."privateMetadata",
    "updatedAt" = CURRENT_TIMESTAMP;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.sync_listing_details_verification(TEXT)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.sync_listing_details_verification_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM nestmate_private.sync_listing_details_verification(NEW."id");
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.sync_listing_details_verification_trigger()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sync_listing_details_verification_after_change
AFTER INSERT OR UPDATE OF
  "type", "status", "publishedAt", "description", "monthlyAmountMin",
  "monthlyAmountMax", "moveInDate", "propertyType", "roomType",
  "furnishingStatus", "preferredOccupant", "availableSpots"
ON public."Post"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.sync_listing_details_verification_trigger();

-- Backfill the lightweight checks for existing users and listings.
SELECT nestmate_private.sync_auth_verifications(auth_user.id)
FROM auth.users AS auth_user;

SELECT nestmate_private.sync_profile_complete_verification(app_user."id")
FROM public."User" AS app_user;

SELECT nestmate_private.sync_listing_details_verification(listing."id")
FROM public."Post" AS listing
WHERE listing."type" IN (
  'ROOM_AVAILABLE'::public."PostType",
  'PG_AVAILABLE'::public."PostType"
);
