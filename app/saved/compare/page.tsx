import { redirect } from "next/navigation";

import { ListingComparison } from "@/components/saved/listing-comparison";
import { Navbar } from "@/components/navbar";
import { loadListingComparison } from "@/lib/comparison-data";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CompareSavedListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const { ids } = await searchParams;
  if (error || !claims?.sub) {
    const next = ids
      ? `/saved/compare?ids=${encodeURIComponent(Array.isArray(ids) ? ids.join(",") : ids)}`
      : "/saved/compare";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });
  const comparison = await loadListingComparison({
    userId: user.id,
    authUserId: claims.sub,
    selection: ids,
  });

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <ListingComparison data={comparison} />
        </section>
      </main>
    </>
  );
}
