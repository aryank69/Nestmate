"use server";

import { revalidatePath } from "next/cache";

import { getModeratorContext } from "@/lib/moderation-data";
import { validateModerationActionInput } from "@/lib/moderation";
import type {
  ModerationActionInput,
  ModerationActionState,
} from "@/types/moderation";

export async function performModerationAction(
  input: ModerationActionInput,
): Promise<ModerationActionState> {
  const parsed = validateModerationActionInput(input);
  if (!parsed.success) return parsed;

  const context = await getModeratorContext();
  if (context.status !== "authorized") {
    return { success: false, message: "Moderator access is required." };
  }
  if (
    (parsed.data.action === "SUSPEND" ||
      parsed.data.action === "RESTORE_USER") &&
    context.role !== "ADMIN"
  ) {
    return { success: false, message: "Only an admin can perform that action." };
  }

  const { error } = await context.supabase.rpc("perform_moderation_action", {
    requested_queue_type: parsed.data.queueType,
    requested_queue_id: parsed.data.queueId,
    requested_action: parsed.data.action,
    requested_reason: parsed.data.reason,
    requested_restriction_hours: parsed.data.restrictionHours,
  });

  if (error) {
    console.error("[moderation:action] Moderation action failed", {
      code: error.code,
      message: error.message,
    });
    return {
      success: false,
      message:
        error.code === "42501"
          ? "You are not authorized to perform that moderation action."
          : "The moderation action could not be completed. Refresh and try again.",
    };
  }

  revalidatePath("/admin/moderation");
  revalidatePath("/community", "layout");
  revalidatePath("/chat");
  revalidatePath("/notifications");
  revalidatePath("/flatmates");
  return { success: true, message: "Moderation action recorded." };
}
