import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MyListingsDashboard } from "@/components/listings/my-listings-dashboard";
import { Navbar } from "@/components/navbar";
import { loadMyListings } from "@/lib/my-listings-data";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Listings | Roomzi",
  description:
    "Manage your Roomzi room, shared-flat, and PG listings in one place.",
};

export default async function MyListingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/login?next=/my-listings");
  }

  const metadata = claims.user_metadata;
  await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });
  const dataSet = await loadMyListings(claims.sub);

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/15">
        <MyListingsDashboard data={dataSet} />
      </main>
    </>
  );
}
