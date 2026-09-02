import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { SavedPage } from "@/components/saved/saved-page";
import { ensureUserProfile } from "@/lib/profile-data";
import { loadSavedData } from "@/lib/saved-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SavedItemsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login?next=/saved");

  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });
  const saved = await loadSavedData(user.id);

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <SavedPage posts={saved.savedPosts} searches={saved.savedSearches} error={saved.error} />
        </section>
      </main>
    </>
  );
}
