"use server";

import { revalidatePath } from "next/cache";

import { isInterestStage, isInterestTargetType } from "@/lib/activity";
import { loadPeopleProfile } from "@/lib/people-data";
import { prisma } from "@/lib/prisma";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActivityActionState } from "@/types/activity";

function validTargetId(value: unknown) {
  if (typeof value !== "string") return null;
  const targetId = value.trim();
  return targetId && targetId.length <= 128 ? targetId : null;
}

export async function setActivityStageAction(input: {
  targetType: string;
  targetId: string;
  stage: string;
}): Promise<ActivityActionState> {
  const targetId = validTargetId(input.targetId);
  if (
    !targetId ||
    !isInterestTargetType(input.targetType) ||
    !isInterestStage(input.stage)
  ) {
    return { success: false, message: "Choose a valid activity stage." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    return { success: false, message: "Please log in to update your activity." };
  }

  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });

  if (input.targetType === "LISTING") {
    const listing = await prisma.post.findFirst({
      where: {
        id: targetId,
        type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] },
        status: "ACTIVE",
        moderationStatus: "VISIBLE",
        availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
        publishedAt: { not: null },
        authorId: { not: user.id },
        author: {
          blocksCreated: { none: { blockedId: user.id } },
          blocksReceived: { none: { blockerId: user.id } },
          moderationState: { isNot: { status: "SUSPENDED" } },
        },
      },
      select: { id: true },
    });
    if (!listing) {
      return {
        success: false,
        message: "That listing is private or no longer available.",
      };
    }
  } else {
    const profile = await loadPeopleProfile(claims.sub, targetId);
    if (!profile) {
      return {
        success: false,
        message: "That profile is private or no longer available.",
      };
    }
  }

  const now = new Date().toISOString();
  const upsertResult =
    input.targetType === "LISTING"
      ? await supabase.from("InterestActivity").upsert(
          {
          userId: user.id,
          targetType: input.targetType,
          postId: targetId,
          targetUserId: null,
          stage: input.stage,
          updatedAt: now,
          },
          { onConflict: "userId,postId" },
        )
      : await supabase.from("InterestActivity").upsert(
          {
          userId: user.id,
          targetType: input.targetType,
          postId: null,
          targetUserId: targetId,
          stage: input.stage,
          updatedAt: now,
          },
          { onConflict: "userId,targetUserId" },
        );
  const upsertError = upsertResult.error;

  if (upsertError) {
    console.error("[activity:stage] Upsert failed", {
      code: upsertError.code,
      message: upsertError.message,
    });
    return {
      success: false,
      message: "We could not update this activity. Please try again.",
    };
  }

  revalidatePath("/activity");
  revalidatePath("/progress");
  if (input.targetType === "LISTING") {
    revalidatePath(`/community/post/${targetId}`);
    revalidatePath("/community/[citySlug]/[localitySlug]", "page");
  } else {
    revalidatePath("/flatmates");
    revalidatePath(`/flatmates/${targetId}`);
  }

  return {
    success: true,
    message: "Activity stage updated.",
    stage: input.stage,
  };
}
