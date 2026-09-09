import { redirect } from "next/navigation";

import { AnalyticsEventTracker } from "@/components/analytics/analytics-event-tracker";
import { Navbar } from "@/components/navbar";
import { PeopleDiscovery } from "@/components/people/people-discovery";
import { loadCommunityLocations } from "@/lib/community-data";
import { parsePeopleFilters } from "@/lib/discovery";
import { analyticsSearchProperties } from "@/lib/analytics";
import { loadPeopleDiscovery } from "@/lib/people-data";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SearchParamRecord } from "@/types/discovery";

export default async function FlatmateDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamRecord>;
}) {
  const query = await searchParams;
  const filters = parsePeopleFilters(query);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/login?next=/flatmates");
  }

  const email = typeof claims.email === "string" ? claims.email : null;
  const metadata = claims.user_metadata;
  const name =
    metadata && typeof metadata.full_name === "string"
      ? metadata.full_name
      : email?.split("@")[0] ?? "NestMate member";
  await ensureUserProfile({ id: claims.sub, email, name });

  const [profiles, locations] = await Promise.all([
    loadPeopleDiscovery(claims.sub, filters),
    loadCommunityLocations(),
  ]);
  const lifestyleCount = [
    filters.diet,
    filters.smoking,
    filters.drinking,
    filters.sleepSchedule,
    filters.cleanliness,
    filters.pets,
    filters.occupationStatus,
  ].filter(Boolean).length;
  const searchAnalytics = analyticsSearchProperties({
    surface: "people",
    query: filters.query,
    budgetMin: filters.budgetMin,
    budgetMax: filters.budgetMax,
    moveInBy: filters.moveInBy,
    locality: filters.localityId,
    lifestyleCount,
    commuteRange: filters.preferredCommuteKm,
    minimumCompatibility: filters.minimumCompatibility,
    sort: filters.sort,
  });

  return (
    <>
      <Navbar />
      {searchAnalytics ? (
        <AnalyticsEventTracker
          event={{ name: "SEARCH_FILTERS_USED", properties: searchAnalytics }}
          dedupeKey={`search:people:${JSON.stringify(searchAnalytics)}`}
        />
      ) : null}
      <main className="min-h-[calc(100svh-4.5rem)]">
        <PeopleDiscovery profiles={profiles} locations={locations} filters={filters} />
      </main>
    </>
  );
}
