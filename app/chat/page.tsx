import { redirect } from "next/navigation";

import { ChatPage } from "@/components/chat/chat-page";
import { Navbar } from "@/components/navbar";
import { normalizeChatUsers, normalizeConversationRows } from "@/lib/chat";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ChatConversationRow, ChatUserRow } from "@/types/chat";

export default async function PrivateChatPage({
  searchParams,
}: {
  searchParams: Promise<{
    conversation?: string | string[];
    user?: string | string[];
    post?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const chatQuery = new URLSearchParams();
  if (typeof query.conversation === "string") {
    chatQuery.set("conversation", query.conversation);
  }
  if (typeof query.user === "string") chatQuery.set("user", query.user);
  if (typeof query.post === "string") chatQuery.set("post", query.post);
  const chatDestination = `/chat${chatQuery.size ? `?${chatQuery}` : ""}`;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect(`/login?next=${encodeURIComponent(chatDestination)}`);
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

  const { data: user, error: userError } = await supabase
    .from("User")
    .select("id,name")
    .eq("authUserId", claims.sub)
    .single();

  if (userError || !user) {
    redirect("/profile");
  }

  const [conversationResult, chatUsersResult] = await Promise.all([
    supabase.rpc("get_my_conversations"),
    supabase.rpc("list_chat_users"),
  ]);
  const initialConversations = normalizeConversationRows(
    conversationResult.data as ChatConversationRow[] | null,
  );
  const initialUsers = normalizeChatUsers(
    chatUsersResult.data as ChatUserRow[] | null,
  );

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)]">
        <section className="content-shell py-6 sm:py-8">
          <ChatPage
            currentUser={{ id: user.id, name: user.name }}
            initialConversations={initialConversations}
            initialUsers={initialUsers}
            initialConversationId={
              typeof query.conversation === "string"
                ? query.conversation
                : null
            }
            initialUserAuthId={
              typeof query.user === "string" ? query.user : null
            }
            initialPostId={
              typeof query.post === "string" ? query.post : null
            }
          />
        </section>
      </main>
    </>
  );
}
