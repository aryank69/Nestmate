import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { PeopleCard } from "@/components/people/people-discovery";
import { RecentViewTracker } from "@/components/recently-viewed/recent-view-tracker";
import { buttonVariants } from "@/components/ui/button";
import { loadPeopleProfile } from "@/lib/people-data";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function FlatmateProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    redirect(`/login?next=/flatmates/${encodeURIComponent(userId)}`);
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
  const profile = await loadPeopleProfile(claims.sub, userId);
  if (!profile) notFound();

  return (
    <>
      <Navbar />
      <RecentViewTracker targetType="USER" targetId={profile.id} />
      <main className="content-shell min-h-[calc(100svh-4.5rem)] py-8 sm:py-12">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/flatmates"
            className={cn(buttonVariants({ variant: "ghost" }), "mb-5 px-0")}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to flatmates
          </Link>
          <PeopleCard profile={profile} detail />
        </div>
      </main>
    </>
  );
}
