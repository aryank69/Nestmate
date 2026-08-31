import { notFound } from "next/navigation";

import { CommunityRoom } from "@/components/community/community-room";
import { Navbar } from "@/components/navbar";
import {
  loadCommunityLocations,
  loadCommunityRoom,
} from "@/lib/community-data";
import { loadUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserProfile } from "@/types/profile";

export default async function LocalityCommunityRoomPage({
  params,
}: {
  params: Promise<{ citySlug: string; localitySlug: string }>;
}) {
  const { citySlug, localitySlug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub ?? null;

  const [room, locations] = await Promise.all([
    loadCommunityRoom(citySlug, localitySlug, authUserId),
    loadCommunityLocations(),
  ]);

  if (!room) notFound();

  let viewerProfile: UserProfile | null = null;
  if (authUserId) {
    try {
      viewerProfile = await loadUserProfile(authUserId);
    } catch {
      viewerProfile = null;
    }
  }

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)]">
        <CommunityRoom
          community={room.community}
          locations={locations}
          posts={room.posts}
          viewerProfile={viewerProfile}
          isAuthenticated={Boolean(authUserId)}
          isMember={room.isMember}
          chatIdentity={room.chatIdentity}
          initialChatUnreadCount={room.chatUnreadCount}
        />
      </main>
    </>
  );
}
