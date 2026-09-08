import "server-only";

import { DATABASE_TO_POST_TYPE, formatCommunityAmount } from "@/lib/community";
import { prisma } from "@/lib/prisma";
import { mergeRecentViews } from "@/lib/recently-viewed";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  RecentViewRow,
  RecentViewTarget,
} from "@/types/recently-viewed";

function formatDate(value: Date | null) {
  if (!value) return "Flexible";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function formatBudget(minimum: number | null, maximum: number | null) {
  if (minimum === null && maximum === null) return "Budget flexible";
  const money = (value: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  if (minimum !== null && maximum !== null) {
    return minimum === maximum
      ? money(minimum)
      : `${money(minimum)}–${money(maximum)}`;
  }
  return minimum !== null ? `${money(minimum)}+` : `Up to ${money(maximum!)}`;
}

export async function loadRecentViews(viewerId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("RecentView")
    .select("id,postId,viewedUserId,viewedAt")
    .eq("viewerId", viewerId)
    .order("viewedAt", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as RecentViewRow[];
  const postIds = rows
    .map(({ postId }) => postId)
    .filter((value): value is string => Boolean(value));
  const userIds = rows
    .map(({ viewedUserId }) => viewedUserId)
    .filter((value): value is string => Boolean(value));

  const [posts, users] = await Promise.all([
    postIds.length
      ? prisma.post.findMany({
          where: {
            id: { in: postIds },
            status: "ACTIVE",
            moderationStatus: "VISIBLE",
            availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
            publishedAt: { not: null },
            author: {
              AND: [
                { blocksCreated: { none: { blockedId: viewerId } } },
                { blocksReceived: { none: { blockerId: viewerId } } },
                { moderationState: { isNot: { status: "SUSPENDED" } } },
              ],
            },
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
                  select: { name: true, city: { select: { name: true } } },
                },
              },
            },
          },
        })
      : [],
    userIds.length
      ? prisma.user.findMany({
          where: {
            id: { in: userIds, not: viewerId },
            preferences: { isNot: null },
            blocksCreated: { none: { blockedId: viewerId } },
            blocksReceived: { none: { blockerId: viewerId } },
            moderationState: { isNot: { status: "SUSPENDED" } },
          },
          select: {
            id: true,
            name: true,
            profession: true,
            companyOrCollege: true,
            preferences: {
              select: {
                budgetMin: true,
                budgetMax: true,
                preferredMoveInDate: true,
                preferredLocalities: {
                  orderBy: { priority: "asc" },
                  take: 2,
                  select: { locality: { select: { name: true } } },
                },
              },
            },
          },
        })
      : [],
  ]);

  const targets: RecentViewTarget[] = [
    ...posts.map((post) => {
      const category = DATABASE_TO_POST_TYPE[post.type];
      return {
        targetId: post.id,
        kind: "POST" as const,
        title: post.title,
        eyebrow: category,
        description: `${post.community.locality.name}, ${post.community.locality.city.name} · Posted by ${post.author.name}`,
        details: [
          formatCommunityAmount(
            category,
            post.monthlyAmountMin,
            post.monthlyAmountMax,
          ),
          `Move-in ${formatDate(post.moveInDate)}`,
        ],
        href: `/community/post/${encodeURIComponent(post.id)}`,
      };
    }),
    ...users.map((user) => ({
      targetId: user.id,
      kind: "USER" as const,
      title: user.name,
      eyebrow: "Flatmate profile",
      description:
        [user.profession, user.companyOrCollege].filter(Boolean).join(" · ") ||
        "NestMate member",
      details: [
        formatBudget(
          user.preferences?.budgetMin ?? null,
          user.preferences?.budgetMax ?? null,
        ),
        user.preferences?.preferredMoveInDate
          ? `Moving ${formatDate(user.preferences.preferredMoveInDate)}`
          : "Move-in flexible",
        ...(user.preferences?.preferredLocalities.length
          ? [
              user.preferences.preferredLocalities
                .map(({ locality }) => locality.name)
                .join(" · "),
            ]
          : []),
      ],
      href: `/flatmates/${encodeURIComponent(user.id)}`,
    })),
  ];

  return {
    items: mergeRecentViews(rows, targets),
    error: error
      ? "We could not load your recently viewed history. Please refresh and try again."
      : "",
  };
}
