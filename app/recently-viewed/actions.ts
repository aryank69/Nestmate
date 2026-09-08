"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { ensureUserProfile } from "@/lib/profile-data";
import {
  parseRecentViewInput,
  recentViewUpsert,
} from "@/lib/recently-viewed";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  RecentViewActionState,
  RecentViewInput,
} from "@/types/recently-viewed";

async function authenticatedRecentViewContext() {
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

function validHistoryId(value: string) {
  const id = value.trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export async function recordRecentViewAction(
  input: RecentViewInput,
): Promise<RecentViewActionState> {
  const parsed = parseRecentViewInput(input);
  if (!parsed) return { success: false, message: "Invalid recent-view target." };
  const context = await authenticatedRecentViewContext();
  if (!context) return { success: false, message: "Authentication is required." };

  const targetIsAvailable =
    parsed.targetType === "POST"
      ? Boolean(
          await prisma.post.findFirst({
            where: {
              id: parsed.targetId,
              status: "ACTIVE",
              moderationStatus: "VISIBLE",
              availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
              publishedAt: { not: null },
              author: {
                AND: [
                  { blocksCreated: { none: { blockedId: context.user.id } } },
                  { blocksReceived: { none: { blockerId: context.user.id } } },
                  { moderationState: { isNot: { status: "SUSPENDED" } } },
                ],
              },
            },
            select: { id: true },
          }),
        )
      : Boolean(
          await prisma.user.findFirst({
            where: {
              id: { equals: parsed.targetId, not: context.user.id },
              preferences: { isNot: null },
              blocksCreated: {
                none: { blockedId: context.user.id },
              },
              blocksReceived: {
                none: { blockerId: context.user.id },
              },
              moderationState: { isNot: { status: "SUSPENDED" } },
            },
            select: { id: true },
          }),
        );

  if (!targetIsAvailable) {
    return { success: false, message: "This item is no longer available." };
  }

  const mutation = recentViewUpsert(
    context.user.id,
    parsed,
    new Date().toISOString(),
  );
  if (!mutation) return { success: false, message: "Invalid recent-view target." };
  const { error } = await context.supabase
    .from("RecentView")
    .upsert(mutation.record, { onConflict: mutation.onConflict });
  if (error) {
    console.error("[recent-views:record] Upsert failed", {
      code: error.code,
      message: error.message,
    });
    return { success: false, message: "We could not update your viewing history." };
  }
  revalidatePath("/recently-viewed");
  return { success: true, message: "Viewing history updated." };
}

export async function removeRecentViewAction(
  historyIdValue: string,
): Promise<RecentViewActionState> {
  const historyId = validHistoryId(historyIdValue);
  if (!historyId) return { success: false, message: "Invalid history item." };
  const context = await authenticatedRecentViewContext();
  if (!context) return { success: false, message: "Authentication is required." };
  const { error } = await context.supabase
    .from("RecentView")
    .delete()
    .eq("id", historyId)
    .eq("viewerId", context.user.id);
  if (error) return { success: false, message: "We could not remove that item." };
  revalidatePath("/recently-viewed");
  return { success: true, message: "Removed from recently viewed." };
}

export async function clearRecentViewsAction(): Promise<RecentViewActionState> {
  const context = await authenticatedRecentViewContext();
  if (!context) return { success: false, message: "Authentication is required." };
  const { error } = await context.supabase.rpc("clear_recent_views");
  if (error) return { success: false, message: "We could not clear your history." };
  revalidatePath("/recently-viewed");
  return { success: true, message: "Recently viewed history cleared." };
}
