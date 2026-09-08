import { notFound, redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { SearchTeamWorkspace } from "@/components/teams/search-team-workspace";
import { ensureUserProfile } from "@/lib/profile-data";
import { loadSearchTeamWorkspace } from "@/lib/search-team-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TeamWorkspacePage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect(`/login?next=${encodeURIComponent(`/teams/${teamId}`)}`);
  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name: metadata && typeof metadata.full_name === "string" ? metadata.full_name : null,
  });
  const team = await loadSearchTeamWorkspace(user.id, teamId);
  if (!team) notFound();
  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <SearchTeamWorkspace data={team} />
        </section>
      </main>
    </>
  );
}
