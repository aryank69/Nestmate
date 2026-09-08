import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { FlatmateComparison } from "@/components/people/flatmate-comparison";
import { ensureUserProfile } from "@/lib/profile-data";
import { loadFlatmateComparisonData } from "@/lib/shortlist-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function FlatmateComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login?next=/shortlist");

  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name: metadata && typeof metadata.full_name === "string" ? metadata.full_name : null,
  });
  const comparison = await loadFlatmateComparisonData(
    claims.sub,
    user.id,
    query.ids,
  );

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <FlatmateComparison data={comparison} />
        </section>
      </main>
    </>
  );
}
