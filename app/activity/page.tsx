import { redirect } from "next/navigation";

import { ActivityPage } from "@/components/activity/activity-page";
import { Navbar } from "@/components/navbar";
import { parseActivityFilters } from "@/lib/activity";
import { loadActivityData } from "@/lib/activity-data";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MyActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login?next=/activity");

  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });
  const filters = parseActivityFilters(await searchParams);
  const activity = await loadActivityData(claims.sub, user.id, filters);

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <ActivityPage data={activity} filters={filters} />
      </main>
    </>
  );
}
