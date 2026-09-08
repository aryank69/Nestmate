"use server";

import { revalidatePath } from "next/cache";

import { ensureUserProfile } from "@/lib/profile-data";
import { snoozeUntil } from "@/lib/reminders";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ReminderActionState } from "@/types/reminder";

function validReminderId(value: unknown) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)
    ? value
    : null;
}

export async function updateReminderAction(input: {
  reminderId: string;
  action: "DISMISS" | "SNOOZE";
  snoozeDays?: number;
}): Promise<ReminderActionState> {
  const reminderId = validReminderId(input.reminderId);
  const snoozedUntil =
    input.action === "SNOOZE"
      ? snoozeUntil(input.snoozeDays ?? Number.NaN)
      : null;
  if (
    !reminderId ||
    !["DISMISS", "SNOOZE"].includes(input.action) ||
    (input.action === "SNOOZE" && !snoozedUntil)
  ) {
    return { success: false, message: "Choose a valid reminder action." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    return { success: false, message: "Please log in to update reminders." };
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

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("Reminder")
    .update(
      input.action === "DISMISS"
        ? { dismissedAt: now, snoozedUntil: null, updatedAt: now }
        : {
            dismissedAt: null,
            snoozedUntil: snoozedUntil!.toISOString(),
            updatedAt: now,
          },
    )
    .eq("id", reminderId)
    .eq("userId", user.id)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    console.error("[reminders:update] Update failed", {
      code: updateError?.code,
      message: updateError?.message,
    });
    return {
      success: false,
      message: "We could not update that reminder. Please try again.",
    };
  }

  revalidatePath("/reminders");
  revalidatePath("/notifications");
  return {
    success: true,
    message:
      input.action === "DISMISS"
        ? "Reminder dismissed."
        : `Reminder snoozed for ${input.snoozeDays} day${input.snoozeDays === 1 ? "" : "s"}.`,
  };
}
