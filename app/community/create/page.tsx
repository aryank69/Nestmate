import { redirect } from "next/navigation";

import { communityPath } from "@/lib/community";
import { loadCommunityLocations } from "@/lib/community-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CreateCommunityPostPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; locality?: string }>;
}) {
  const { city = "Bengaluru", locality = "" } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    redirect("/login?next=/community/create");
  }

  const locations = await loadCommunityLocations();
  const selected =
    locations.find(
      (location) =>
        location.city === city &&
        (!locality || location.locality === locality),
    ) ??
    locations.find((location) => location.city === city) ??
    locations[0];

  if (!selected) redirect("/community");
  redirect(`${communityPath(selected)}/create`);
}
