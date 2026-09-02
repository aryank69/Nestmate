import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CommunityPostCard } from "@/components/community/community-page";
import { Navbar } from "@/components/navbar";
import { buttonVariants } from "@/components/ui/button";
import { loadCommunityPostDetail } from "@/lib/community-data";
import { loadUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function CommunityPostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub ?? null;
  const [post, viewerProfile] = await Promise.all([
    loadCommunityPostDetail(postId, authUserId),
    authUserId ? loadUserProfile(authUserId) : Promise.resolve(null),
  ]);

  if (!post) notFound();

  return (
    <>
      <Navbar />
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
            showSafetyActions={Boolean(authUserId)}
            showSaveAction={Boolean(authUserId)}
            detail
          />
        </div>
      </main>
    </>
  );
}
