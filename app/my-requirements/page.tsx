import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MyRequirementsDashboard } from "@/components/requirements/my-requirements-dashboard";
import { Navbar } from "@/components/navbar";
import { loadMyRequirements } from "@/lib/my-requirements-data";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Requirements | Roomzi",
  description:
    "Manage your Roomzi room and flatmate requirements in one place.",
};

export default async function MyRequirementsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/login?next=/my-requirements");
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
  const requirements = await loadMyRequirements(claims.sub);

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/15">
        <MyRequirementsDashboard data={requirements} />
      </main>
    </>
  );
}
