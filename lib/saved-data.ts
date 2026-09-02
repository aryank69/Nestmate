import "server-only";

import { DATABASE_TO_POST_TYPE, formatCommunityAmount } from "@/lib/community";
import { prisma } from "@/lib/prisma";
import { savedSearchFilterLabels } from "@/lib/saved";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SavedPostView, SavedSearchKind, SavedSearchView } from "@/types/saved";

type SavedPostRow = { postId: string; createdAt: string };
type SavedSearchRow = {
  id: string;
  name: string;
  kind: SavedSearchKind;
  path: string;
  filters: unknown;
  createdAt: string;
};

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function filterString(filters: unknown, key: string) {
  if (!filters || typeof filters !== "object") return null;
  const value = (filters as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

function safeSavedHref(kind: SavedSearchKind, path: string) {
  if (path.startsWith("/") && !path.startsWith("//") && path.length <= 500) {
    if (kind === "PEOPLE" && path.startsWith("/flatmates")) return path;
    if (kind === "COMMUNITY_POSTS" && path.startsWith("/community/")) return path;
  }
  return kind === "PEOPLE" ? "/flatmates" : "/community";
}

export async function loadSavedData(userId: string) {
  const supabase = await createSupabaseServerClient();
  const [savedPostsResult, savedSearchesResult] = await Promise.all([
    supabase
      .from("SavedPost")
      .select("postId,createdAt")
      .eq("userId", userId)
      .order("createdAt", { ascending: false })
      .limit(100),
    supabase
      .from("SavedSearch")
      .select("id,name,kind,path,filters,createdAt")
      .eq("userId", userId)
      .order("createdAt", { ascending: false })
      .limit(100),
  ]);

  const savedPostRows = (savedPostsResult.data ?? []) as SavedPostRow[];
  const savedSearchRows = (savedSearchesResult.data ?? []) as SavedSearchRow[];
  const postIds = savedPostRows.map(({ postId }) => postId);
  const localityIds = savedSearchRows
    .map(({ filters }) => filterString(filters, "localityId"))
    .filter((value): value is string => Boolean(value));

  const [posts, localities] = await Promise.all([
    postIds.length
      ? prisma.post.findMany({
          where: {
            id: { in: postIds },
            status: "ACTIVE",
            publishedAt: { not: null },
            author: { blocksReceived: { none: { blockerId: userId } } },
          },
          select: {
            id: true,
            type: true,
            title: true,
            monthlyAmountMin: true,
            monthlyAmountMax: true,
            moveInDate: true,
            author: { select: { name: true } },
            community: {
              select: {
                locality: {
                  select: {
                    name: true,
                    slug: true,
                    city: { select: { name: true, slug: true } },
                  },
                },
              },
            },
          },
        })
      : [],
    localityIds.length
      ? prisma.locality.findMany({
          where: { id: { in: localityIds } },
          select: { id: true, name: true, city: { select: { name: true } } },
        })
      : [],
  ]);

  const postById = new Map(posts.map((post) => [post.id, post]));
  const savedPosts: SavedPostView[] = savedPostRows.flatMap((saved) => {
    const post = postById.get(saved.postId);
    if (!post) return [];
    const category = DATABASE_TO_POST_TYPE[post.type];
    return [{
      id: post.id,
      title: post.title,
      category,
      locality: post.community.locality.name,
      city: post.community.locality.city.name,
      priceLabel: formatCommunityAmount(
        category,
        post.monthlyAmountMin,
        post.monthlyAmountMax,
      ),
      moveInLabel: post.moveInDate ? formatDate(post.moveInDate) : "Flexible",
      authorName: post.author.name,
      communityHref: `/community/${encodeURIComponent(post.community.locality.city.slug)}/${encodeURIComponent(post.community.locality.slug)}`,
      savedAt: formatDate(saved.createdAt),
    }];
  });

  const localityById = new Map(
    localities.map((locality) => [
      locality.id,
      `${locality.name}, ${locality.city.name}`,
    ]),
  );
  const savedSearches: SavedSearchView[] = savedSearchRows.map((saved) => {
    const labels = savedSearchFilterLabels(saved.kind, saved.filters);
    const localityId = filterString(saved.filters, "localityId");
    const localityLabel = localityId ? localityById.get(localityId) : null;
    return {
      id: saved.id,
      name: saved.name,
      kind: saved.kind,
      kindLabel: saved.kind === "PEOPLE" ? "Flatmate search" : "Community posts",
      href: safeSavedHref(saved.kind, saved.path),
      filterLabels: localityLabel ? [localityLabel, ...labels].slice(0, 8) : labels,
      savedAt: formatDate(saved.createdAt),
    };
  });

  return {
    savedPosts,
    savedSearches,
    error:
      savedPostsResult.error || savedSearchesResult.error
        ? "We could not load all your saved items. Please refresh and try again."
        : "",
  };
}
