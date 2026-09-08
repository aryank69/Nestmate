import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { VisitsOverview } from "@/components/visits/visit-sections";
import { VisitAvailabilityEditor } from "@/components/visits/visit-availability-editor";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVisitRequests } from "@/lib/visit-data";
import { loadVisitAvailability } from "@/lib/visit-availability-data";

export default async function VisitsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login?next=/visits");

  const metadata = claims.user_metadata;
  await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });
  const [visits, availability] = await Promise.all([
    loadVisitRequests(claims.sub),
    loadVisitAvailability(claims.sub),
  ]);

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <VisitsOverview visits={visits} />
          <div className="mx-auto max-w-5xl">
            <VisitAvailabilityEditor availability={availability} />
          </div>
        </section>
      </main>
    </>
  );
}
