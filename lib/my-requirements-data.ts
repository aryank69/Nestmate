import "server-only";

import { DATABASE_TO_POST_TYPE, formatCommunityAmount } from "@/lib/community";
import {
  myListingActions,
  myListingLifecycleLabel,
  myListingLifecycleStatus,
} from "@/lib/my-listings";
import {
  recentRequirementActivity,
  requirementKind,
} from "@/lib/my-requirements";
import { loadPostMatches } from "@/lib/post-match-data";
import { prisma } from "@/lib/prisma";
import type { MyRequirementsData } from "@/types/my-requirements";

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export async function loadMyRequirements(
  authUserId: string,
): Promise<MyRequirementsData> {
  const owner = await prisma.user.findUnique({
    where: { authUserId },
    select: {
      id: true,
      blocksCreated: { select: { blockedId: true } },
      blocksReceived: { select: { blockerId: true } },
    },
  });

  if (!owner) {
    return {
      requirements: [],
      summary: { total: 0, active: 0, paused: 0, closed: 0, matches: 0 },
    };
  }

  const hiddenUserIds = new Set([
    ...owner.blocksCreated.map(({ blockedId }) => blockedId),
    ...owner.blocksReceived.map(({ blockerId }) => blockerId),
  ]);
  const posts = await prisma.post.findMany({
    where: {
      authorId: owner.id,
      type: { in: ["NEED_ROOM", "NEED_FLATMATE"] },
      publishedAt: { not: null },
    },
    select: {
      id: true,
      type: true,
      status: true,
      availabilityStatus: true,
      moderationStatus: true,
      title: true,
      monthlyAmountMin: true,
      monthlyAmountMax: true,
      updatedAt: true,
      community: {
        select: {
          locality: {
            select: { name: true, city: { select: { name: true } } },
          },
        },
      },
      savedBy: { select: { userId: true, createdAt: true } },
      interestActivity: {
        where: { stage: { not: "NOT_INTERESTED" } },
        select: { userId: true, updatedAt: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 100,
  });

  const notifications = posts.length
    ? await prisma.notification.findMany({
        where: {
          recipientId: owner.id,
          type: "POST_ACTIVITY",
          resourceId: { in: posts.map(({ id }) => id) },
        },
        select: { resourceId: true, actorId: true, createdAt: true },
      })
    : [];
  const notificationsByPost = new Map<
    string,
    typeof notifications
  >();
  for (const notification of notifications) {
    if (!notification.actorId || hiddenUserIds.has(notification.actorId)) {
      continue;
    }
    const entries = notificationsByPost.get(notification.resourceId) ?? [];
    entries.push(notification);
    notificationsByPost.set(notification.resourceId, entries);
  }

  const matchesByPost = new Map<string, number>();
  await Promise.all(
    posts.map(async (post) => {
      if (
        post.status !== "ACTIVE" ||
        post.availabilityStatus === "CLOSED" ||
        post.moderationStatus !== "VISIBLE"
      ) {
        return;
      }
      const matches = await loadPostMatches(authUserId, post.id);
      matchesByPost.set(post.id, matches?.matchCounts.total ?? 0);
    }),
  );

  const requirements = posts.map((post) => {
    const lifecycleStatus = myListingLifecycleStatus(post);
    const actions = myListingActions(post);
    const visibleSaves = post.savedBy.filter(
      ({ userId }) => userId !== owner.id && !hiddenUserIds.has(userId),
    );
    const visibleInterests = post.interestActivity.filter(
      ({ userId }) => userId !== owner.id && !hiddenUserIds.has(userId),
    );
    const interestUserIds = new Set([
      ...visibleSaves.map(({ userId }) => userId),
      ...visibleInterests.map(({ userId }) => userId),
    ]);
    const postNotifications = notificationsByPost.get(post.id) ?? [];
    const messageUserIds = new Set(
      postNotifications.flatMap(({ actorId }) => (actorId ? [actorId] : [])),
    );
    const activity = recentRequirementActivity([
      ...visibleSaves.map(({ createdAt }) => createdAt),
      ...visibleInterests.map(({ updatedAt }) => updatedAt),
      ...postNotifications.map(({ createdAt }) => createdAt),
    ]);
    const isActive = post.status === "ACTIVE";
    const isPaused = post.status === "ARCHIVED";
    const isClosed = post.availabilityStatus === "CLOSED";
    const category = DATABASE_TO_POST_TYPE[post.type];

    return {
      id: post.id,
      title: post.title,
      kind: requirementKind(post.type),
      city: post.community.locality.city.name,
      locality: post.community.locality.name,
      budgetLabel: formatCommunityAmount(
        category,
        post.monthlyAmountMin,
        post.monthlyAmountMax,
      ),
      lifecycleStatus,
      lifecycleLabel: myListingLifecycleLabel(lifecycleStatus),
      metrics: {
        matches: matchesByPost.get(post.id) ?? 0,
        savesOrInterests: interestUserIds.size,
        messages: messageUserIds.size,
        recentActivity: activity.count,
      },
      recentActivityLabel: activity.label,
      updatedLabel: dateLabel(post.updatedAt),
      detailHref: actions.detailAvailable
        ? `/community/post/${encodeURIComponent(post.id)}`
        : null,
      editHref:
        actions.detailAvailable && !isPaused
          ? `/community/post/${encodeURIComponent(post.id)}/edit`
          : null,
      matchesHref:
        isActive && !isClosed && post.moderationStatus === "VISIBLE"
          ? `/matches/post/${encodeURIComponent(post.id)}`
          : null,
      canPause: actions.canPause,
      canReopen: actions.canReopen,
      canClose: actions.canClose,
      canDelete: actions.canDelete,
    };
  });

  return {
    requirements,
    summary: {
      total: requirements.length,
      active: requirements.filter(({ lifecycleStatus }) =>
        lifecycleStatus === "AVAILABLE" || lifecycleStatus === "RESERVED",
      ).length,
      paused: requirements.filter(
        ({ lifecycleStatus }) => lifecycleStatus === "PAUSED",
      ).length,
      closed: requirements.filter(({ lifecycleStatus }) =>
        lifecycleStatus === "CLOSED" || lifecycleStatus === "UNAVAILABLE",
      ).length,
      matches: requirements.reduce(
        (total, requirement) => total + requirement.metrics.matches,
        0,
      ),
    },
  };
}
