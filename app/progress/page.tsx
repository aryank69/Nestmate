import { redirect } from "next/navigation";

import { ProgressPage } from "@/components/activity/progress-page";
import { Navbar } from "@/components/navbar";
import { loadActivityData } from "@/lib/activity-data";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProgressSummaryPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login?next=/progress");

  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });
  const activity = await loadActivityData(claims.sub, user.id, {
    stage: null,
    targetType: null,
  });

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <ProgressPage
          metrics={activity.progress}
          timeline={activity.timeline}
          error={activity.error}
        />
      </main>
    </>
  );
}
