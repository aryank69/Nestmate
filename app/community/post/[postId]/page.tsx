import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { CommunityPostCard } from "@/components/community/community-page";
import { Navbar } from "@/components/navbar";
import { RecentViewTracker } from "@/components/recently-viewed/recent-view-tracker";
import { buttonVariants } from "@/components/ui/button";
import { VisitRequestSection } from "@/components/visits/visit-sections";
import { loadCommunityPostDetail } from "@/lib/community-data";
import { loadUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { loadVisitRequests } from "@/lib/visit-data";
import { loadListingVisitSlots } from "@/lib/visit-availability-data";
import { loadLocalityPulseForPost } from "@/lib/locality-pulse-data";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function CommunityPostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub;
  if (error || !authUserId) {
    redirect(
      `/login?next=${encodeURIComponent(`/community/post/${postId}`)}`,
    );
  }
  const [
    post,
    viewerProfile,
    visits,
    availableVisitSlots,
    localityPulse,
  ] = await Promise.all([
    loadCommunityPostDetail(postId, authUserId),
    loadUserProfile(authUserId),
    loadVisitRequests(authUserId, postId),
    loadListingVisitSlots(postId, authUserId),
    loadLocalityPulseForPost(postId),
  ]);

  if (!post) notFound();

  return (
    <>
      <Navbar />
      <RecentViewTracker targetType="POST" targetId={post.id} />
      <main className="content-shell min-h-[calc(100svh-4.5rem)] py-8 sm:py-12">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/community"
            className={cn(buttonVariants({ variant: "ghost" }), "mb-5 px-0")}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to communities
          </Link>
          <CommunityPostCard
            post={post}
            viewerProfile={viewerProfile}
            localityPulse={localityPulse}
            showSafetyActions
            showSaveAction
            detail
          />
          {post.category === "Room Available" || post.category === "PG Available" ? (
            <VisitRequestSection
              postId={post.id}
              postTitle={post.title}
              listingAvailability={post.availability.status}
              isAuthenticated
              isOwner={post.isOwner}
              visits={visits}
              availableSlots={availableVisitSlots}
            />
          ) : null}
        </div>
      </main>
    </>
  );
}
