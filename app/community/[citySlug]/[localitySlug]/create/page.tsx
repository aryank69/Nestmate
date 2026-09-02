import { notFound, redirect } from "next/navigation";

import { CreatePostFlow } from "@/components/community/create-post-flow";
import { Navbar } from "@/components/navbar";
import { communityPath } from "@/lib/community";
import { loadCommunityLocation } from "@/lib/community-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CreateLocalityCommunityPostPage({
  params,
}: {
  params: Promise<{ citySlug: string; localitySlug: string }>;
}) {
  const { citySlug, localitySlug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const path = `/community/${encodeURIComponent(citySlug)}/${encodeURIComponent(localitySlug)}`;

  if (error || !data?.claims?.sub) {
    redirect(`/login?next=${encodeURIComponent(`${path}/create`)}`);
  }

  const community = await loadCommunityLocation(citySlug, localitySlug);
  if (!community) notFound();

  const canonicalPath = communityPath(community);
  if (canonicalPath !== path) redirect(`${canonicalPath}/create`);

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)]">
        <section className="content-shell py-8 sm:py-12 lg:py-16">
          <CreatePostFlow
            locations={[community]}
            initialCity={community.city}
            initialLocality={community.locality}
            lockedCommunity={community}
            authUserId={data.claims.sub}
          />
        </section>
      </main>
    </>
  );
}
