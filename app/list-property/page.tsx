import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CreatePostFlow } from "@/components/community/create-post-flow";
import { Navbar } from "@/components/navbar";
import { loadCommunityLocations } from "@/lib/community-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "List a Property | Roomzi",
  description:
    "List an available room, shared flat, entire flat, or PG in a Roomzi locality community.",
};

export default async function ListPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; locality?: string }>;
}) {
  const { city = "", locality = "" } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    redirect("/login?next=/list-property");
  }

  const locations = await loadCommunityLocations();
  const requestedLocation =
    locations.find(
      (location) =>
        (!city ||
          location.citySlug === city ||
          location.city.toLocaleLowerCase("en-IN") ===
            city.toLocaleLowerCase("en-IN")) &&
        (!locality ||
          location.id === locality ||
          location.localitySlug === locality ||
          location.locality.toLocaleLowerCase("en-IN") ===
            locality.toLocaleLowerCase("en-IN")),
    ) ?? locations[0];

  if (!requestedLocation) redirect("/community");

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/15">
        <section className="content-shell py-8 sm:py-12 lg:py-16">
          <CreatePostFlow
            locations={locations}
            initialCity={requestedLocation.city}
            initialLocality={requestedLocation.locality}
            authUserId={data.claims.sub}
            flow="property"
          />
        </section>
      </main>
    </>
  );
}
