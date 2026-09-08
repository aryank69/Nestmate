import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { SearchTeamsPage } from "@/components/teams/search-teams-page";
import { ensureUserProfile } from "@/lib/profile-data";
import { loadSearchTeamHub } from "@/lib/search-team-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TeamsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login?next=/teams");
  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name: metadata && typeof metadata.full_name === "string" ? metadata.full_name : null,
  });
  const teams = await loadSearchTeamHub(user.id);
  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <SearchTeamsPage data={teams} />
        </section>
      </main>
    </>
  );
}
