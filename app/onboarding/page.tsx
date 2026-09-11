import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { getSafeNextPath } from "@/lib/auth";
import { loadCommunityLocations } from "@/lib/community-data";
import { onboardingEntryPath } from "@/lib/onboarding";
import {
  loadOnboardingDefaults,
  postAuthPath,
} from "@/lib/onboarding-data";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Set up your search | Roomzi",
  description:
    "Tell Roomzi what you need so rooms, roommates, listings, and requirements start in the right place.",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; edit?: string; error?: string }>;
}) {
  const query = await searchParams;
  const nextPath = getSafeNextPath(query.next);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/login?next=" + encodeURIComponent(onboardingEntryPath(nextPath)));
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

  const [locations, defaults] = await Promise.all([
    loadCommunityLocations(),
    loadOnboardingDefaults(claims.sub),
  ]);

  if (!locations.length) redirect("/community");

  const isEditing = query.edit === "1" || defaults.isFinished;
  if (defaults.isFinished && query.edit !== "1" && query.next) {
    redirect(await postAuthPath(claims.sub, nextPath));
  }

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-7 sm:py-10 lg:py-14">
          <OnboardingForm
            locations={locations}
            defaults={defaults}
            nextPath={nextPath}
            isEditing={isEditing}
            error={query.error}
          />
        </section>
      </main>
    </>
  );
}
