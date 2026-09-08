import { notFound, redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { ListingComparison } from "@/components/saved/listing-comparison";
import { ensureUserProfile } from "@/lib/profile-data";
import { loadSearchTeamListingComparison } from "@/lib/search-team-comparison-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TeamListingComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const [{ teamId }, { ids }] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect(`/login?next=${encodeURIComponent(`/teams/${teamId}/compare`)}`);
  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name: metadata && typeof metadata.full_name === "string" ? metadata.full_name : null,
  });
  const comparison = await loadSearchTeamListingComparison({ teamId, userId: user.id, authUserId: claims.sub, selection: ids });
  if (!comparison) notFound();
  return <><Navbar /><main className="min-h-[calc(100svh-4.5rem)] bg-muted/20"><section className="content-shell py-8 sm:py-12"><ListingComparison data={comparison} backHref={`/teams/${teamId}`} backLabel="Back to team workspace" eyebrow="Team shortlist" title="Compare team options" description="Compare the shared options visible to you. Living Fit and commute remain personalized to your own private preferences." /></section></main></>;
}
