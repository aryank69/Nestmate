import { notFound, redirect } from "next/navigation";

import { AnalyticsEventTracker } from "@/components/analytics/analytics-event-tracker";
import { CommunityRoom } from "@/components/community/community-room";
import { Navbar } from "@/components/navbar";
import {
  loadCommunityLocations,
  loadCommunityRoom,
} from "@/lib/community-data";
import { analyticsSearchProperties } from "@/lib/analytics";
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
  const { data, error } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub;
  if (error || !authUserId) {
    const path = `/community/${encodeURIComponent(citySlug)}/${encodeURIComponent(localitySlug)}`;
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  const [room, locations] = await Promise.all([
    loadCommunityRoom(citySlug, localitySlug, authUserId, filters),
    loadCommunityLocations(),
  ]);

  if (!room) notFound();

  const searchAnalytics = analyticsSearchProperties({
    surface: "listings",
    query: filters.query,
    budgetMin: filters.budgetMin,
    budgetMax: filters.budgetMax,
    moveInBy: filters.moveInBy,
    category: filters.postType,
    preference: filters.genderPreference,
    commuteRange: filters.maximumDistanceKm,
    sort: filters.sort,
  });

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
      <AnalyticsEventTracker
        event={{
          name: "LOCALITY_SELECTED",
          properties: { source: "direct-link" },
        }}
        dedupeKey={`locality:${room.community.id}`}
      />
      {searchAnalytics ? (
        <AnalyticsEventTracker
          event={{ name: "SEARCH_FILTERS_USED", properties: searchAnalytics }}
          dedupeKey={`search:listings:${JSON.stringify(searchAnalytics)}`}
        />
      ) : null}
      <main className="min-h-[calc(100svh-4.5rem)]">
        <CommunityRoom
          community={room.community}
          localityPulse={room.localityPulse}
          locations={locations}
          posts={room.posts}
          postTypeCounts={room.postTypeCounts}
          filters={filters}
          viewerProfile={viewerProfile}
          isAuthenticated
          isMember={room.isMember}
          chatIdentity={room.chatIdentity}
          initialChatUnreadCount={room.chatUnreadCount}
          initialView={query.view === "chat" ? "chat" : "posts"}
        />
      </main>
    </>
  );
}
