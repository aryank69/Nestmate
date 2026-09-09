import type { Metadata } from "next";

import { Navbar } from "@/components/navbar";
import { RoomDiscovery } from "@/components/rooms/room-discovery";
import { ensureUserProfile } from "@/lib/profile-data";
import { loadRoomDiscovery } from "@/lib/room-discovery-data";
import { parseRoomDiscoveryFilters } from "@/lib/room-discovery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SearchParamRecord } from "@/types/discovery";

export const metadata: Metadata = {
  title: "Find a Room | NestMate",
  description:
    "Discover rooms, shared flats, and PGs by locality, budget, commute, and transparent living-fit signals.",
};

export default async function FindRoomPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamRecord>;
}) {
  const filters = parseRoomDiscoveryFilters(await searchParams);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (claims?.sub) {
    const email = typeof claims.email === "string" ? claims.email : null;
    const metadata = claims.user_metadata;
    await ensureUserProfile({
      id: claims.sub,
      email,
      name:
        metadata && typeof metadata.full_name === "string"
          ? metadata.full_name
          : email?.split("@")[0] ?? null,
    });
  }

  const discovery = await loadRoomDiscovery(claims?.sub ?? null, filters);

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/15">
        <RoomDiscovery
          posts={discovery.listings}
          locations={discovery.locations}
          filters={filters}
          isAuthenticated={Boolean(claims?.sub)}
        />
      </main>
    </>
  );
}
