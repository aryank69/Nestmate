import { notFound } from "next/navigation";

import { CommunityRoom } from "@/components/community/community-room";
import { Navbar } from "@/components/navbar";
import {
  loadCommunityLocations,
  loadCommunityRoom,
} from "@/lib/community-data";
import { parseCommunityPostFilters } from "@/lib/discovery";
import { loadUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserProfile } from "@/types/profile";
import type { SearchParamRecord } from "@/types/discovery";

export default async function LocalityCommunityRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ citySlug: string; localitySlug: string }>;
  searchParams: Promise<SearchParamRecord>;
}) {
  const { citySlug, localitySlug } = await params;
  const query = await searchParams;
  const filters = parseCommunityPostFilters(query);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub ?? null;

  const [room, locations] = await Promise.all([
    loadCommunityRoom(citySlug, localitySlug, authUserId, filters),
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
          postTypeCounts={room.postTypeCounts}
          filters={filters}
          viewerProfile={viewerProfile}
          isAuthenticated={Boolean(authUserId)}
          isMember={room.isMember}
          chatIdentity={room.chatIdentity}
          initialChatUnreadCount={room.chatUnreadCount}
          initialView={query.view === "chat" ? "chat" : "posts"}
        />
      </main>
    </>
  );
}
