import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CreatePostFlow } from "@/components/community/create-post-flow";
import { Navbar } from "@/components/navbar";
import { loadCommunityLocations } from "@/lib/community-data";
import { ensureUserProfile } from "@/lib/profile-data";
import { loadRequirementProfileDefaults } from "@/lib/requirement-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Post a Requirement | Roomzi",
  description:
    "Tell a Roomzi locality community that you need a room or a compatible flatmate.",
};

export default async function PostRequirementPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; locality?: string; type?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/login?next=/post-requirement");
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

  const [locations, profileDefaults] = await Promise.all([
    loadCommunityLocations(),
    loadRequirementProfileDefaults(claims.sub),
  ]);
  const preferredCommunity = profileDefaults.preferredLocalityId
    ? locations.find(
        (location) =>
          location.localityId === profileDefaults.preferredLocalityId,
      )
    : null;
  const requestedLocation =
    locations.find(
      (location) =>
        (!query.city ||
          location.citySlug === query.city ||
          location.city.toLocaleLowerCase("en-IN") ===
            query.city.toLocaleLowerCase("en-IN")) &&
        (!query.locality ||
          location.id === query.locality ||
          location.localitySlug === query.locality ||
          location.locality.toLocaleLowerCase("en-IN") ===
            query.locality.toLocaleLowerCase("en-IN")),
    ) ??
    preferredCommunity ??
    locations[0];

  if (!requestedLocation) redirect("/community");

  const initialPostType =
    query.type === "flatmate" ? "Need Flatmate" : query.type === "room" ? "Need a Room" : undefined;

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/15">
        <section className="content-shell py-8 sm:py-12 lg:py-16">
          <CreatePostFlow
            locations={locations}
            initialCity={requestedLocation.city}
            initialLocality={requestedLocation.locality}
            authUserId={claims.sub}
            flow="requirement"
            profileDefaults={profileDefaults}
            initialPostType={initialPostType}
          />
        </section>
      </main>
    </>
  );
}
