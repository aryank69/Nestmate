"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSafeNextPath } from "@/lib/auth";
import {
  onboardingDestination,
  onboardingValues,
  validateOnboardingValues,
} from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OnboardingActionState } from "@/types/onboarding";

function failure(
  message: string,
  errors: OnboardingActionState["errors"] = {},
): OnboardingActionState {
  return { success: false, message, errors };
}

async function authenticatedOnboardingContext() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) return null;

  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });

  return { supabase, user };
}

export async function saveOnboardingAction(
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const values = onboardingValues(formData);
  const parsed = validateOnboardingValues(values);

  if (!parsed.success) {
    return failure("Please review the highlighted details.", parsed.errors);
  }

  const context = await authenticatedOnboardingContext();
  if (!context) {
    return failure("Your session has expired. Please log in again.");
  }

  const location = await prisma.community.findFirst({
    where: { id: parsed.data.communityId, isActive: true },
    select: {
      id: true,
      localityId: true,
      locality: {
        select: {
          name: true,
          city: { select: { name: true, slug: true } },
        },
      },
    },
  });

  if (!location) {
    return failure("That locality is not currently available.", {
      communityId: "Choose an available city and locality.",
    });
  }

  const { data: preferences, error: lookupError } = await context.supabase
    .from("UserPreferences")
    .select("id")
    .eq("userId", context.user.id)
    .single();

  if (lookupError || !preferences) {
    return failure("We could not load your discovery preferences.");
  }

  const { error: localityError } = await context.supabase.rpc(
    "replace_my_preferred_localities",
    {
      p_preferences_id: preferences.id,
      p_locality_ids: [location.localityId],
    },
  );

  if (localityError) {
    console.error("Onboarding locality update failed", localityError.message);
    return failure(
      "We could not save that locality. Please choose it again.",
    );
  }

  const now = new Date().toISOString();
  const { data: updatedPreferences, error: updateError } =
    await context.supabase
      .from("UserPreferences")
      .update({
        budgetMin: parsed.data.budgetMin,
        budgetMax: parsed.data.budgetMax,
        preferredMoveInDate: parsed.data.moveInDate,
        commuteDestination: parsed.data.commute.destination || null,
        commuteLatitude: parsed.data.commute.latitude,
        commuteLongitude: parsed.data.commute.longitude,
        preferredCommuteKm: parsed.data.commute.preferredRangeKm,
        onboardingIntent: parsed.data.intent,
        onboardingCompletedAt: now,
        onboardingSkippedAt: null,
        updatedAt: now,
      })
      .eq("id", preferences.id)
      .select("id")
      .maybeSingle();

  if (updateError || !updatedPreferences) {
    console.error(
      "Onboarding preference update failed",
      updateError?.message ?? "No owned preference row was updated",
    );
    return failure("We could not save your setup. Please try again.");
  }

  revalidatePath("/profile");
  revalidatePath("/rooms");
  revalidatePath("/flatmates");

  redirect(
    onboardingDestination(parsed.data, {
      id: location.id,
      localityId: location.localityId,
      city: location.locality.city.name,
      citySlug: location.locality.city.slug,
      locality: location.locality.name,
    }),
  );
}

export async function skipOnboardingAction(formData: FormData) {
  const context = await authenticatedOnboardingContext();
  const requestedNext = getSafeNextPath(formData.get("next"));
  const nextPath = requestedNext.startsWith("/onboarding")
    ? "/profile"
    : requestedNext;

  if (!context) redirect("/login?next=/onboarding");

  const { data: preferences } = await context.supabase
    .from("UserPreferences")
    .select("id,onboardingCompletedAt")
    .eq("userId", context.user.id)
    .single();

  if (preferences && !preferences.onboardingCompletedAt) {
    const now = new Date().toISOString();
    const { data: skippedPreferences, error } = await context.supabase
      .from("UserPreferences")
      .update({
        onboardingIntent: null,
        onboardingCompletedAt: null,
        onboardingSkippedAt: now,
        updatedAt: now,
      })
      .eq("id", preferences.id)
      .select("id")
      .maybeSingle();

    if (error || !skippedPreferences) {
      console.error(
        "Onboarding skip update failed",
        error?.message ?? "No owned preference row was updated",
      );
      redirect("/onboarding?error=skip_failed");
    }
  }

  revalidatePath("/profile");
  redirect(nextPath);
}
