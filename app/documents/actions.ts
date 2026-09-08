"use server";

import { revalidatePath } from "next/cache";

import {
  cleanSharedDocumentName,
  isDocumentAcknowledgementStatus,
  isOwnedSharedDocumentPath,
  isSharedDocumentCategory,
  SHARED_DOCUMENT_BUCKET,
} from "@/lib/shared-documents";
import { isFinalizedMilestoneKind } from "@/lib/finalized-milestones";
import { isMatchClosureReason } from "@/lib/finalized-match";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SharedDocumentActionState } from "@/types/shared-documents";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validUuid(value: unknown) {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

async function documentContext() {
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
  return { supabase, authUserId: claims.sub, userId: user.id };
}

export async function closeFinalizedMatchAction(input: {
  spaceId: string;
  reason: string;
}): Promise<SharedDocumentActionState> {
  const spaceId = validUuid(input.spaceId);
  if (!spaceId || !isMatchClosureReason(input.reason)) {
    return { success: false, message: "Choose a valid reason for closing this match." };
  }
  const context = await documentContext();
  if (!context) return { success: false, message: "Please log in to close this match." };

  const { data, error } = await context.supabase
    .from("FinalizedDocumentSpace")
    .update({ status: "CLOSED", closureReason: input.reason })
    .eq("id", spaceId)
    .neq("status", "CLOSED")
    .select("id,status")
    .maybeSingle();
  if (error || !data) {
    console.error("[documents:close-match] Update failed", {
      code: error?.code,
      message: error?.message,
    });
    return {
      success: false,
      message:
        error?.code === "22023"
          ? "Both participants must complete move-in before using that closure reason."
          : "This match could not be closed. It may be private or already archived.",
    };
  }
  revalidatePath("/documents");
  revalidatePath("/activity");
  revalidatePath("/progress");
  revalidatePath("/reminders");
  return { success: true, message: "Match closed and preserved as a private read-only archive." };
}

export async function reopenFinalizedMatchAction(input: {
  spaceId: string;
  restoreStatus: "ACTIVE" | "COMPLETED";
}): Promise<SharedDocumentActionState> {
  const spaceId = validUuid(input.spaceId);
  if (!spaceId || !["ACTIVE", "COMPLETED"].includes(input.restoreStatus)) {
    return { success: false, message: "This match cannot be reopened." };
  }
  const context = await documentContext();
  if (!context) return { success: false, message: "Please log in to reopen this match." };

  const { data, error } = await context.supabase
    .from("FinalizedDocumentSpace")
    .update({ status: input.restoreStatus, closureReason: null })
    .eq("id", spaceId)
    .eq("status", "CLOSED")
    .select("id,status")
    .maybeSingle();
  if (error || !data) {
    console.error("[documents:reopen-match] Update failed", {
      code: error?.code,
      message: error?.message,
    });
    return {
      success: false,
      message: "Only the participant who closed a mistaken or cancelled match can reopen it within seven days.",
    };
  }
  revalidatePath("/documents");
  revalidatePath("/activity");
  revalidatePath("/progress");
  revalidatePath("/reminders");
  return { success: true, message: "Match reopened and restored to your active flows." };
}

export async function updateFinalizedMilestoneAction(input: {
  spaceId: string;
  kind: string;
  completed: boolean;
}): Promise<SharedDocumentActionState> {
  const spaceId = validUuid(input.spaceId);
  if (
    !spaceId ||
    !isFinalizedMilestoneKind(input.kind) ||
    typeof input.completed !== "boolean"
  ) {
    return { success: false, message: "Choose a valid move-in milestone." };
  }

  const context = await documentContext();
  if (!context) {
    return { success: false, message: "Please log in to update milestones." };
  }

  const { data, error } = await context.supabase
    .from("FinalizedMatchMilestone")
    .update({ status: input.completed ? "COMPLETED" : "PENDING" })
    .eq("spaceId", spaceId)
    .eq("userId", context.userId)
    .eq("kind", input.kind)
    .select("id,status,completedAt")
    .maybeSingle();
  if (error || !data) {
    console.error("[documents:milestone] Update failed", {
      code: error?.code,
      message: error?.message,
    });
    return {
      success: false,
      message: "This milestone is private or the finalized match is unavailable.",
    };
  }

  revalidatePath("/documents");
  return {
    success: true,
    message: input.completed
      ? "Milestone recorded for you. This is coordination only, not legal or payment verification."
      : "Your milestone was reset to pending.",
  };
}

export async function registerSharedDocumentAction(input: {
  documentId: string;
  spaceId: string;
  category: string;
  objectPath: string;
  originalName: string;
  replacesDocumentId?: string | null;
}): Promise<SharedDocumentActionState> {
  const documentId = validUuid(input.documentId);
  const spaceId = validUuid(input.spaceId);
  const originalName = cleanSharedDocumentName(input.originalName);
  const replacesDocumentId = input.replacesDocumentId
    ? validUuid(input.replacesDocumentId)
    : null;
  if (
    !documentId ||
    !spaceId ||
    !originalName ||
    !isSharedDocumentCategory(input.category) ||
    (Boolean(input.replacesDocumentId) && !replacesDocumentId)
  ) {
    return { success: false, message: "Choose a valid document and category." };
  }

  const context = await documentContext();
  if (!context) return { success: false, message: "Please log in to share documents." };
  if (
    !isOwnedSharedDocumentPath(
      input.objectPath,
      context.authUserId,
      spaceId,
      documentId,
    )
  ) {
    return { success: false, message: "That document path is not valid." };
  }

  const { data: space, error: spaceError } = await context.supabase
    .from("FinalizedDocumentSpace")
    .select("id")
    .eq("id", spaceId)
    .maybeSingle();
  if (spaceError || !space) {
    return {
      success: false,
      message: "This finalized sharing space is private or no longer available.",
    };
  }

  const { data: document, error } = await context.supabase
    .from("SharedDocument")
    .insert({
      id: documentId,
      spaceId,
      category: input.category,
      objectPath: input.objectPath,
      originalName,
      replacesDocumentId,
    })
    .select("id")
    .maybeSingle();
  if (error || !document) {
    console.error("[documents:register] Registration failed", {
      code: error?.code,
      message: error?.message,
    });
    return {
      success: false,
      message: error?.message.includes("20 documents")
        ? "Delete an older document before sharing another one here."
        : error?.message.includes("current version") ||
            error?.message.includes("Only the uploader")
          ? "Only the uploader can revise the current active version. Refresh and try again."
          : "The upload could not be attached securely. Please try again.",
    };
  }

  revalidatePath("/documents");
  return {
    success: true,
    message: replacesDocumentId
      ? "A new current version was shared. Earlier versions remain private in history."
      : "Document shared with this finalized participant.",
  };
}

export async function markSharedDocumentAcknowledgementAction(input: {
  documentId: string;
  status: string;
}): Promise<SharedDocumentActionState> {
  const documentId = validUuid(input.documentId);
  if (!documentId || !isDocumentAcknowledgementStatus(input.status)) {
    return { success: false, message: "Choose a valid acknowledgement." };
  }
  const context = await documentContext();
  if (!context) return { success: false, message: "Please log in to review documents." };

  const { data, error } = await context.supabase
    .from("SharedDocumentAcknowledgement")
    .upsert(
      { documentId, userId: context.userId, status: input.status },
      { onConflict: "documentId,userId" },
    )
    .select("documentId,status")
    .maybeSingle();
  if (error || !data) {
    console.error("[documents:acknowledge] Update failed", {
      code: error?.code,
      message: error?.message,
    });
    return {
      success: false,
      message: "Only a current, active document can be reviewed or acknowledged.",
    };
  }

  revalidatePath("/documents");
  return {
    success: true,
    message:
      input.status === "ACKNOWLEDGED"
        ? "Marked as acknowledged. This is not a signature or legal acceptance."
        : "Marked as reviewed.",
  };
}

export async function revokeSharedDocumentAction(
  documentIdValue: string,
): Promise<SharedDocumentActionState> {
  const documentId = validUuid(documentIdValue);
  if (!documentId) return { success: false, message: "Choose a valid document." };
  const context = await documentContext();
  if (!context) return { success: false, message: "Please log in to manage documents." };

  const { data: document } = await context.supabase
    .from("SharedDocument")
    .select("seriesId")
    .eq("id", documentId)
    .eq("uploaderId", context.userId)
    .maybeSingle();
  if (!document) {
    return { success: false, message: "This document was not found or is not yours." };
  }

  const { data, error } = await context.supabase
    .from("SharedDocument")
    .update({ revokedAt: new Date().toISOString() })
    .eq("seriesId", document.seriesId)
    .eq("uploaderId", context.userId)
    .is("revokedAt", null)
    .select("id");
  if (error || !data?.length) {
    return {
      success: false,
      message: "This document could not be revoked or is not yours.",
    };
  }
  revalidatePath("/documents");
  return { success: true, message: "Access to every version was revoked immediately." };
}

export async function deleteSharedDocumentAction(
  documentIdValue: string,
): Promise<SharedDocumentActionState> {
  const documentId = validUuid(documentIdValue);
  if (!documentId) return { success: false, message: "Choose a valid document." };
  const context = await documentContext();
  if (!context) return { success: false, message: "Please log in to manage documents." };

  const { data: document, error: readError } = await context.supabase
    .from("SharedDocument")
    .select("id,seriesId")
    .eq("id", documentId)
    .eq("uploaderId", context.userId)
    .maybeSingle();
  if (readError || !document) {
    return { success: false, message: "This document was not found or is not yours." };
  }

  const { data: versions, error: versionsError } = await context.supabase
    .from("SharedDocument")
    .select("id,objectPath")
    .eq("seriesId", document.seriesId)
    .eq("uploaderId", context.userId);
  if (versionsError || !versions?.length) {
    return { success: false, message: "The document history could not be loaded safely." };
  }

  const { error: storageError } = await context.supabase.storage
    .from(SHARED_DOCUMENT_BUCKET)
    .remove(versions.map(({ objectPath }) => objectPath));
  if (storageError) {
    console.error("[documents:delete] Storage deletion failed", {
      message: storageError.message,
    });
    return { success: false, message: "The private file could not be deleted safely." };
  }

  const { error: deleteError, count } = await context.supabase
    .from("SharedDocument")
    .delete({ count: "exact" })
    .eq("seriesId", document.seriesId)
    .eq("uploaderId", context.userId);
  if (deleteError || count !== versions.length) {
    return { success: false, message: "The document record could not be removed." };
  }
  revalidatePath("/documents");
  return { success: true, message: "Document and its version history permanently deleted." };
}
