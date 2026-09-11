"use server";

import {
  ageToDateOfBirth,
  ensureUserProfile,
  loadUserProfile,
  parseBudget,
  profilePreferencesToDatabase,
} from "@/lib/profile-data";
import { trackProductAnalyticsEvent } from "@/lib/analytics.server";
import { validateCommutePreference } from "@/lib/commute";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileUpdateResult, UserProfile } from "@/types/profile";

function failure(message: string): ProfileUpdateResult {
  return { success: false, message };
}

function cleanOptionalText(value: string, maximumLength: number) {
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maximumLength) : null;
}

export async function updateProfileAction(
  input: UserProfile,
): Promise<ProfileUpdateResult> {
  if (
    !input ||
    typeof input.name !== "string" ||
    typeof input.age !== "number" ||
    typeof input.profession !== "string" ||
    typeof input.organization !== "string" ||
    typeof input.budget !== "string" ||
    typeof input.moveInDate !== "string" ||
    typeof input.bio !== "string" ||
    !input.commute ||
    !Array.isArray(input.preferredLocalities) ||
    input.preferredLocalities.some(
      (locality) => typeof locality !== "string",
    ) ||
    !input.preferences ||
    Object.values(input.preferences).some((value) => typeof value !== "string")
  ) {
    return failure("The profile form contains invalid data.");
  }

  const name = input.name.trim();

  if (name.length < 2 || name.length > 80) {
    return failure("Name must be between 2 and 80 characters.");
  }

  if (
    !Number.isInteger(input.age) ||
    (input.age !== 0 && (input.age < 18 || input.age > 99))
  ) {
    return failure("Age must be between 18 and 99.");
  }

  if (input.bio.length > 500) {
    return failure("Bio must be 500 characters or fewer.");
  }

  const budget = parseBudget(input.budget);
  if (!budget) {
    return failure("Enter a valid budget, for example ₹18,000–₹25,000.");
  }

  const commute = validateCommutePreference(input.commute);
  if (!commute.success) {
    return failure(commute.message);
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (claimsError || !claims?.sub) {
    return failure("Your session has expired. Please log in again.");
  }

  const userMetadata = claims.user_metadata;
  await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      userMetadata && typeof userMetadata.full_name === "string"
        ? userMetadata.full_name
        : null,
  });

  const { data: userData, error: userLookupError } = await supabase
    .from("User")
    .select("id")
    .eq("authUserId", claims.sub)
    .single();

  if (userLookupError || !userData) {
    return failure("We could not find your Roomzi profile.");
  }

  const updatedAt = new Date().toISOString();
  const { error: userUpdateError } = await supabase
    .from("User")
    .update({
      name,
      dateOfBirth: ageToDateOfBirth(input.age),
      profession: cleanOptionalText(input.profession, 120),
      companyOrCollege: cleanOptionalText(input.organization, 160),
      bio: cleanOptionalText(input.bio, 500),
      updatedAt,
    })
    .eq("authUserId", claims.sub);

  if (userUpdateError) {
    return failure("We could not save your profile details. Please try again.");
  }

  const { data: preferencesData, error: preferencesLookupError } =
    await supabase
      .from("UserPreferences")
      .select("id")
      .eq("userId", userData.id)
      .single();

  if (preferencesLookupError || !preferencesData) {
    return failure("We could not find your lifestyle preferences.");
  }

  const { error: preferencesUpdateError } = await supabase
    .from("UserPreferences")
    .update({
      budgetMin: budget.minimum,
      budgetMax: budget.maximum,
      preferredMoveInDate: input.moveInDate || null,
      commuteDestination: commute.data.destination || null,
      commuteLatitude: commute.data.latitude,
      commuteLongitude: commute.data.longitude,
      preferredCommuteKm: commute.data.preferredRangeKm,
      ...profilePreferencesToDatabase(input.preferences),
      updatedAt,
    })
    .eq("id", preferencesData.id);

  if (preferencesUpdateError) {
    return failure(
      "Your profile was saved, but lifestyle preferences could not be updated.",
    );
  }

  const requestedLocalities = Array.from(
    new Set(
      input.preferredLocalities
        .map((locality) => locality.trim())
        .filter(Boolean),
    ),
  ).slice(0, 10);
  const { data: availableLocalities, error: localityLookupError } =
    await supabase.from("Locality").select("id,name");

  if (localityLookupError) {
    return failure(
      "Your details were saved, but localities could not be updated.",
    );
  }

  const localityByName = new Map(
    (availableLocalities ?? []).map((locality) => [
      locality.name.toLocaleLowerCase("en-IN"),
      locality,
    ]),
  );
  const matchedLocalities = requestedLocalities
    .map((name) => localityByName.get(name.toLocaleLowerCase("en-IN")))
    .filter(
      (locality): locality is { id: string; name: string } =>
        Boolean(locality),
    );

  const { error: preferredLocalityError } = await supabase.rpc(
    "replace_my_preferred_localities",
    {
      p_preferences_id: preferencesData.id,
      p_locality_ids: matchedLocalities.map((locality) => locality.id),
    },
  );

  if (preferredLocalityError) {
    return failure(
      "Your details were saved, but preferred localities could not be updated.",
    );
  }

  const savedProfile = await loadUserProfile(claims.sub);
  if (
    savedProfile.verification.badges.some(
      (badge) => badge.kind === "PROFILE_COMPLETE",
    )
  ) {
    await trackProductAnalyticsEvent(userData.id, {
      name: "PROFILE_COMPLETED",
      properties: { completionVersion: 1 },
    });
  }
  const unmatchedCount = requestedLocalities.length - matchedLocalities.length;

  return {
    success: true,
    profile: savedProfile,
    message:
      unmatchedCount > 0
        ? `Profile saved. ${unmatchedCount} locality ${unmatchedCount === 1 ? "was" : "were"} not found in the current Roomzi locality list.`
        : "Profile and lifestyle preferences saved.",
  };
}
