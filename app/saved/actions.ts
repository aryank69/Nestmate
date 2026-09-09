"use server";

import { revalidatePath } from "next/cache";

import { trackProductAnalyticsEvent } from "@/lib/analytics.server";
import { prisma } from "@/lib/prisma";
import { ensureUserProfile } from "@/lib/profile-data";
import { validateSavedSearchInput } from "@/lib/saved";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  SavedActionState,
  SavedSearchInput,
} from "@/types/saved";

async function authenticatedSavedContext() {
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

function validRecordId(value: string) {
  const cleaned = value.trim();
  return cleaned && cleaned.length <= 128 ? cleaned : null;
}

export async function setPostSavedAction(
  postIdValue: string,
  shouldSave: boolean,
): Promise<SavedActionState> {
  const postId = validRecordId(postIdValue);
  if (!postId || typeof shouldSave !== "boolean") {
    return { success: false, message: "Choose a valid post to save." };
  }

  const context = await authenticatedSavedContext();
  if (!context) {
    return { success: false, message: "Please log in to save posts." };
  }

  if (shouldSave) {
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        status: "ACTIVE",
        moderationStatus: "VISIBLE",
        availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
        publishedAt: { not: null },
        author: {
          blocksReceived: { none: { blockerId: context.user.id } },
          moderationState: { isNot: { status: "SUSPENDED" } },
        },
      },
      select: { id: true },
    });
    if (!post) {
      return { success: false, message: "That post is no longer available." };
    }

    const { error } = await context.supabase.from("SavedPost").insert({
      userId: context.user.id,
      postId,
    });
    if (error && error.code !== "23505") {
      console.error("[saved:post] Save failed", {
        code: error.code,
        message: error.message,
      });
      return { success: false, message: "We could not save that post." };
    }
  } else {
    const { error } = await context.supabase
      .from("SavedPost")
      .delete()
      .eq("userId", context.user.id)
      .eq("postId", postId);
    if (error) {
      return { success: false, message: "We could not remove that saved post." };
    }
  }

  if (shouldSave) {
    await trackProductAnalyticsEvent(context.user.id, {
      name: "LISTING_SAVED",
      properties: { source: "community" },
    });
  }

  revalidatePath("/saved");
  revalidatePath("/activity");
  revalidatePath("/progress");
  revalidatePath("/community/[citySlug]/[localitySlug]", "page");
  return {
    success: true,
    saved: shouldSave,
    message: shouldSave ? "Post saved." : "Post removed from saved items.",
  };
}

export async function createSavedSearchAction(
  input: SavedSearchInput,
): Promise<SavedActionState> {
  const parsed = validateSavedSearchInput(input);
  if (!parsed.success) return parsed;

  const context = await authenticatedSavedContext();
  if (!context) {
    return { success: false, message: "Please log in to save searches." };
  }

  const { error } = await context.supabase.from("SavedSearch").insert({
    userId: context.user.id,
    name: parsed.data.name,
    kind: parsed.data.kind,
    path: parsed.data.path,
    filters: parsed.data.filters,
  });
  if (error) {
    console.error("[saved:search] Save failed", {
      code: error.code,
      message: error.message,
    });
    return { success: false, message: "We could not save that search." };
  }

  revalidatePath("/saved");
  return { success: true, saved: true, message: "Search saved." };
}

export async function deleteSavedSearchAction(
  savedSearchIdValue: string,
): Promise<SavedActionState> {
  const savedSearchId = validRecordId(savedSearchIdValue);
  if (!savedSearchId) {
    return { success: false, message: "Choose a valid saved search." };
  }

  const context = await authenticatedSavedContext();
  if (!context) {
    return { success: false, message: "Please log in to update saved searches." };
  }

  const { error } = await context.supabase
    .from("SavedSearch")
    .delete()
    .eq("userId", context.user.id)
    .eq("id", savedSearchId);
  if (error) {
    return { success: false, message: "We could not remove that saved search." };
  }

  revalidatePath("/saved");
  return { success: true, saved: false, message: "Saved search removed." };
}
