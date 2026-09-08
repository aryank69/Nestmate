"use server";

import { revalidatePath } from "next/cache";

import { loadPeopleProfile } from "@/lib/people-data";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ShortlistActionState } from "@/types/shortlist";

function validUserId(value: string) {
  const cleaned = value.trim();
  return cleaned && cleaned.length <= 128 ? cleaned : null;
}

async function authenticatedShortlistContext() {
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
  return { supabase, user, authUserId: claims.sub };
}

export async function setProfileShortlistedAction(
  targetUserIdValue: string,
  shouldShortlist: boolean,
): Promise<ShortlistActionState> {
  const targetUserId = validUserId(targetUserIdValue);
  if (!targetUserId || typeof shouldShortlist !== "boolean") {
    return { success: false, message: "Choose a valid profile." };
  }

  const context = await authenticatedShortlistContext();
  if (!context) {
    return { success: false, message: "Please log in to shortlist flatmates." };
  }

  if (shouldShortlist) {
    const visibleProfile = await loadPeopleProfile(
      context.authUserId,
      targetUserId,
    );
    if (!visibleProfile) {
      return {
        success: false,
        message: "That profile is private or no longer available.",
      };
    }

    const { error } = await context.supabase.from("ShortlistedProfile").insert({
      userId: context.user.id,
      targetUserId,
    });
    if (error && error.code !== "23505") {
      console.error("[shortlist:profile] Save failed", {
        code: error.code,
        message: error.message,
      });
      return { success: false, message: "We could not shortlist that profile." };
    }
  } else {
    const { error } = await context.supabase
      .from("ShortlistedProfile")
      .delete()
      .eq("userId", context.user.id)
      .eq("targetUserId", targetUserId);
    if (error) {
      return { success: false, message: "We could not update your shortlist." };
    }
  }

  revalidatePath("/flatmates");
  revalidatePath(`/flatmates/${targetUserId}`);
  revalidatePath("/shortlist");
  revalidatePath("/shortlist/compare");
  revalidatePath("/activity");
  revalidatePath("/progress");
  return {
    success: true,
    shortlisted: shouldShortlist,
    message: shouldShortlist
      ? "Flatmate added to your shortlist."
      : "Flatmate removed from your shortlist.",
  };
}
