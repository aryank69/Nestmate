"use server";

import { revalidatePath } from "next/cache";

import { getModeratorContext } from "@/lib/moderation-data";
import { validateManageSupportCaseInput } from "@/lib/support";
import type { ManageSupportCaseInput, SupportActionState } from "@/types/support";

export async function manageSupportCaseAction(
  input: ManageSupportCaseInput,
): Promise<SupportActionState> {
  const parsed = validateManageSupportCaseInput(input);
  if (!parsed.success) return parsed;

  const context = await getModeratorContext();
  if (context.status !== "authorized") {
    return { success: false, message: "Moderator access is required." };
  }

  const { error } = await context.supabase.rpc("manage_support_case", {
    requested_case_id: parsed.data.caseId,
    requested_status: parsed.data.status,
    response_body: parsed.data.response || null,
    internal_note_body: parsed.data.internalNote || null,
  });

  if (error) {
    console.error("[moderation:support] Support case update failed", {
      code: error.code,
      message: error.message,
    });
    return {
      success: false,
      message:
        error.code === "42501"
          ? "You are not authorized to manage that case."
          : "The support case could not be updated. Refresh and try again.",
    };
  }

  revalidatePath("/admin/moderation");
  revalidatePath("/support");
  revalidatePath(`/support/${parsed.data.caseId}`);
  revalidatePath("/notifications");
  return { success: true, message: "Support case updated and recorded." };
}
