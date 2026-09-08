import "server-only";

import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  SupportCaseDetail,
  SupportCaseSummary,
} from "@/types/support";

export async function getSupportContext() {
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

export async function loadSupportCases(
  context: NonNullable<Awaited<ReturnType<typeof getSupportContext>>>,
): Promise<SupportCaseSummary[]> {
  const { data, error } = await context.supabase
    .from("SupportCase")
    .select(
      "id,category,subject,description,reference,status,lastResponseAt,createdAt,updatedAt",
    )
    .eq("userId", context.user.id)
    .order("updatedAt", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[support:list] Failed to load support cases", {
      code: error.code,
      message: error.message,
    });
    return [];
  }
  return (data ?? []) as SupportCaseSummary[];
}

export async function loadSupportCase(
  context: NonNullable<Awaited<ReturnType<typeof getSupportContext>>>,
  caseId: string,
): Promise<SupportCaseDetail | null> {
  const { data: supportCase, error } = await context.supabase
    .from("SupportCase")
    .select(
      "id,category,subject,description,reference,status,lastResponseAt,createdAt,updatedAt",
    )
    .eq("id", caseId)
    .eq("userId", context.user.id)
    .maybeSingle();
  if (error || !supportCase) return null;

  const { data: messages, error: messagesError } = await context.supabase
    .from("SupportCaseMessage")
    .select("id,senderRole,body,createdAt,sender:User!SupportCaseMessage_senderId_fkey(name)")
    .eq("caseId", caseId)
    .order("createdAt", { ascending: true })
    .order("id", { ascending: true });
  if (messagesError) {
    console.error("[support:detail] Failed to load case messages", {
      code: messagesError.code,
      message: messagesError.message,
    });
  }

  return {
    ...(supportCase as SupportCaseSummary),
    messages: (messages ?? []).map((message) => ({
      id: message.id as string,
      senderRole: message.senderRole as "USER" | "MODERATOR",
      senderName:
        (message.sender as { name?: string } | null)?.name ??
        (message.senderRole === "MODERATOR" ? "NestMate support" : context.user.name),
      body: message.body as string,
      createdAt: message.createdAt as string,
    })),
  };
}
