"use server";

import { revalidatePath } from "next/cache";

import {
  cleanMoveInPrivateDetail,
  MAX_MOVE_IN_PRIVATE_DETAIL_LENGTH,
} from "@/lib/move-in-checklist";
import { loadMoveInChecklist } from "@/lib/move-in-checklist-data";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MoveInChecklistActionState } from "@/types/move-in";

function validUuid(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

export async function updateMoveInChecklistItemAction(input: {
  checklistId: string;
  itemId: string;
  isCompleted: boolean;
  privateDetail: string;
}): Promise<MoveInChecklistActionState> {
  const checklistId = validUuid(input.checklistId);
  const itemId = validUuid(input.itemId);
  const privateDetail = cleanMoveInPrivateDetail(input.privateDetail);
  if (!checklistId || !itemId || privateDetail === null) {
    return { success: false, message: "Choose a valid checklist task." };
  }
  if (input.privateDetail.trim().length > MAX_MOVE_IN_PRIVATE_DETAIL_LENGTH) {
    return {
      success: false,
      message: "Keep private task details within 500 characters.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    return { success: false, message: "Please log in to update your checklist." };
  }
  const metadata = claims.user_metadata;
  await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });

  const checklist = await loadMoveInChecklist(claims.sub, checklistId);
  if (!checklist || !checklist.items.some(({ id }) => id === itemId)) {
    return {
      success: false,
      message: "This checklist is private, unavailable, or no longer finalized.",
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("MoveInChecklistItem")
    .update({
      isCompleted: Boolean(input.isCompleted),
      privateDetail: privateDetail || null,
    })
    .eq("id", itemId)
    .eq("checklistId", checklistId)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    console.error("[move-in:task] Update failed", {
      code: updateError?.code,
      message: updateError?.message,
    });
    return {
      success: false,
      message: "We could not update this private task. Please try again.",
    };
  }

  revalidatePath(`/move-in/${checklistId}`);
  revalidatePath("/activity");
  revalidatePath("/visits");
  return { success: true, message: "Checklist task updated." };
}
