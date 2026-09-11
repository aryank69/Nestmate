"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isValidRoomziUserId,
  validateReportInput,
} from "@/lib/trust-safety";
import type {
  ReportInput,
  TrustSafetyActionState,
} from "@/types/trust-safety";

async function authenticatedSafetyContext() {
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

async function resolveReportedUserId(
  reporterId: string,
  targetType: ReportInput["targetType"],
  targetId: string,
) {
  if (targetType === "USER") {
    return (
      await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true },
      })
    )?.id;
  }

  if (targetType === "POST") {
    return (
      await prisma.post.findFirst({
        where: {
          id: targetId,
          status: "ACTIVE",
          moderationStatus: "VISIBLE",
          publishedAt: { not: null },
        },
        select: { authorId: true },
      })
    )?.authorId;
  }

  if (targetType === "DIRECT_MESSAGE") {
    return (
      await prisma.message.findFirst({
        where: {
          id: targetId,
          moderationStatus: "VISIBLE",
          conversation: {
            OR: [
              { participantOneId: reporterId },
              { participantTwoId: reporterId },
            ],
          },
        },
        select: { senderId: true },
      })
    )?.senderId;
  }

  return (
    await prisma.communityMessage.findFirst({
      where: {
        id: targetId,
        moderationStatus: "VISIBLE",
        community: { members: { some: { userId: reporterId } } },
      },
      select: { senderId: true },
    })
  )?.senderId;
}

function refreshSafetyViews() {
  revalidatePath("/community");
  revalidatePath("/chat");
}

export async function submitReportAction(
  input: ReportInput,
): Promise<TrustSafetyActionState> {
  const parsed = validateReportInput(input);
  if (!parsed.success) {
    return { success: false, message: parsed.message };
  }

  const context = await authenticatedSafetyContext();
  if (!context) {
    return { success: false, message: "Please log in to submit a report." };
  }

  const reportedUserId = await resolveReportedUserId(
    context.user.id,
    parsed.data.targetType,
    parsed.data.targetId,
  );

  if (!reportedUserId) {
    return { success: false, message: "That content is no longer available." };
  }

  if (reportedUserId === context.user.id) {
    return { success: false, message: "You cannot report your own content." };
  }

  const { error } = await context.supabase.from("Report").insert({
    reporterId: context.user.id,
    reportedUserId,
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    reason: parsed.data.reason,
    details: parsed.data.details,
  });

  if (error?.code === "23505") {
    return { success: true, message: "You already reported this content." };
  }

  if (error) {
    console.error("[trust-safety:report] Report submission failed", {
      code: error.code,
      message: error.message,
    });
    return {
      success: false,
      message: "We could not submit your report. Please try again.",
    };
  }

  return {
    success: true,
    message: "Report submitted. Thank you for helping keep Roomzi safe.",
  };
}

export async function blockUserAction(
  blockedUserId: string,
): Promise<TrustSafetyActionState> {
  if (!isValidRoomziUserId(blockedUserId)) {
    return { success: false, message: "Choose a valid user to block." };
  }

  const context = await authenticatedSafetyContext();
  if (!context) {
    return { success: false, message: "Please log in to block a user." };
  }

  if (blockedUserId === context.user.id) {
    return { success: false, message: "You cannot block yourself." };
  }

  const targetExists = await prisma.user.findUnique({
    where: { id: blockedUserId },
    select: { id: true },
  });
  if (!targetExists) {
    return { success: false, message: "That user is no longer available." };
  }

  const { error } = await context.supabase.from("UserBlock").upsert(
    { blockerId: context.user.id, blockedId: blockedUserId },
    { onConflict: "blockerId,blockedId", ignoreDuplicates: true },
  );

  if (error) {
    console.error("[trust-safety:block] Block failed", {
      code: error.code,
      message: error.message,
    });
    return { success: false, message: "We could not block this user." };
  }

  refreshSafetyViews();
  return {
    success: true,
    message: "User blocked. Their posts and messages are now hidden.",
  };
}

export async function unblockUserAction(
  blockedUserId: string,
): Promise<TrustSafetyActionState> {
  if (!isValidRoomziUserId(blockedUserId)) {
    return { success: false, message: "Choose a valid user to unblock." };
  }

  const context = await authenticatedSafetyContext();
  if (!context) {
    return { success: false, message: "Please log in to unblock a user." };
  }

  const { error } = await context.supabase
    .from("UserBlock")
    .delete()
    .eq("blockerId", context.user.id)
    .eq("blockedId", blockedUserId);

  if (error) {
    return { success: false, message: "We could not unblock this user." };
  }

  refreshSafetyViews();
  return { success: true, message: "User unblocked." };
}
