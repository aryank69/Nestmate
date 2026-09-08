import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { RecentlyViewedPage } from "@/components/recently-viewed/recently-viewed-page";
import { ensureUserProfile } from "@/lib/profile-data";
import { loadRecentViews } from "@/lib/recently-viewed-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function RecentlyViewedHistoryPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login?next=/recently-viewed");
  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });
  const history = await loadRecentViews(user.id);

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <RecentlyViewedPage items={history.items} error={history.error} />
        </section>
      </main>
    </>
  );
}
