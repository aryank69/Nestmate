"use server";

import { revalidatePath } from "next/cache";

import { getSupportContext } from "@/lib/support-data";
import {
  cleanSupportMessage,
  validateSupportCaseInput,
} from "@/lib/support";
import type { SupportActionState } from "@/types/support";

export async function createSupportCaseAction(input: {
  category: string;
  subject: string;
  description: string;
  reference?: string;
}): Promise<SupportActionState> {
  const parsed = validateSupportCaseInput(input);
  if (!parsed.success) return parsed;

  const context = await getSupportContext();
  if (!context) {
    return { success: false, message: "Please log in to contact support." };
  }

  const { data, error } = await context.supabase
    .from("SupportCase")
    .insert({
      userId: context.user.id,
      category: parsed.data.category,
      subject: parsed.data.subject,
      description: parsed.data.description,
      reference: parsed.data.reference,
      status: "OPEN",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[support:create] Failed to create support case", {
      code: error?.code,
      message: error?.message,
    });
    return {
      success: false,
      message: "We could not submit your request. Please try again.",
    };
  }

  revalidatePath("/support");
  return {
    success: true,
    message: "Your request was submitted securely.",
    caseId: data.id as string,
  };
}

export async function replyToSupportCaseAction(input: {
  caseId: string;
  body: string;
}): Promise<SupportActionState> {
  const caseId = input.caseId.trim();
  const body = cleanSupportMessage(input.body);
  if (!/^[0-9a-f-]{36}$/i.test(caseId) || !body) {
    return {
      success: false,
      message: "Add a message between 1 and 2,000 characters.",
    };
  }

  const context = await getSupportContext();
  if (!context) {
    return { success: false, message: "Please log in to reply." };
  }

  const { error } = await context.supabase.from("SupportCaseMessage").insert({
    caseId,
    senderId: context.user.id,
    senderRole: "USER",
    body,
  });

  if (error) {
    console.error("[support:reply] Failed to add support message", {
      code: error.code,
      message: error.message,
    });
    return {
      success: false,
      message:
        error.code === "42501"
          ? "This case is closed or is not available to your account."
          : "We could not send your reply. Please try again.",
    };
  }

  revalidatePath("/support");
  revalidatePath(`/support/${caseId}`);
  revalidatePath("/admin/moderation");
  return { success: true, message: "Your reply was sent." };
}
