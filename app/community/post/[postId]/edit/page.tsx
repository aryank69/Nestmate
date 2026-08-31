import { notFound, redirect } from "next/navigation";

import { CreatePostFlow } from "@/components/community/create-post-flow";
import { Navbar } from "@/components/navbar";
import {
  loadCommunityLocations,
  loadEditableCommunityPost,
} from "@/lib/community-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditCommunityPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    redirect(
      `/login?next=${encodeURIComponent(`/community/post/${postId}/edit`)}`,
    );
  }

  const [locations, initialPost] = await Promise.all([
    loadCommunityLocations(),
    loadEditableCommunityPost(postId, data.claims.sub),
  ]);

  if (!initialPost) notFound();

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)]">
        <section className="content-shell py-8 sm:py-12 lg:py-16">
          <CreatePostFlow
            locations={locations}
            initialCity=""
            initialLocality=""
            initialPost={initialPost}
          />
        </section>
      </main>
    </>
  );
}
