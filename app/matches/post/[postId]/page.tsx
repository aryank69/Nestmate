import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PostMatches } from "@/components/matches/post-matches";
import { Navbar } from "@/components/navbar";
import { loadPostMatches } from "@/lib/post-match-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Matches for Your Post | Roomzi",
  description:
    "Review eligible rooms, PGs, flatmates, and seekers matched to your Roomzi post.",
};

export default async function PostMatchPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect(`/login?next=${encodeURIComponent(`/matches/post/${postId}`)}`);
  }

  const matches = await loadPostMatches(claims.sub, postId);
  if (!matches) notFound();

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/15">
        <section className="content-shell py-8 sm:py-12 lg:py-16">
          <PostMatches data={matches} />
        </section>
      </main>
    </>
  );
}
