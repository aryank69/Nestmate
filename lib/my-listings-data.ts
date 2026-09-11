import "server-only";

import { DATABASE_TO_POST_TYPE, formatCommunityAmount } from "@/lib/community";
import { listingFreshness } from "@/lib/listing-freshness";
import {
  myListingActions,
  myListingKind,
  myListingLifecycleLabel,
  myListingLifecycleStatus,
} from "@/lib/my-listings";
import { prisma } from "@/lib/prisma";
import type { MyListingsData } from "@/types/my-listings";

function updatedLabel(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export async function loadMyListings(
  authUserId: string,
): Promise<MyListingsData> {
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
      listings: [],
      summary: { total: 0, available: 0, reserved: 0, paused: 0, closed: 0 },
    };
  }

  const hiddenUserIds = new Set([
    ...owner.blocksCreated.map(({ blockedId }) => blockedId),
    ...owner.blocksReceived.map(({ blockerId }) => blockerId),
  ]);
  const posts = await prisma.post.findMany({
    where: {
      authorId: owner.id,
      type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] },
      publishedAt: { not: null },
    },
    select: {
      id: true,
      type: true,
      status: true,
      availabilityStatus: true,
      moderationStatus: true,
      title: true,
      roomType: true,
      monthlyAmountMin: true,
      monthlyAmountMax: true,
      lastConfirmedAt: true,
      updatedAt: true,
      community: {
        select: {
          locality: {
            select: {
              name: true,
              city: { select: { name: true } },
            },
          },
        },
      },
      recentViews: { select: { viewerId: true } },
      savedBy: { select: { userId: true } },
      interestActivity: {
        where: { stage: { not: "NOT_INTERESTED" } },
        select: { userId: true },
      },
      visitRequests: {
        select: { requesterId: true, status: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 200,
  });

  const notifications = posts.length
    ? await prisma.notification.findMany({
        where: {
          recipientId: owner.id,
          type: "POST_ACTIVITY",
          resourceId: { in: posts.map(({ id }) => id) },
        },
        select: { resourceId: true, actorId: true },
      })
    : [];
  const contactIdsByPost = new Map<string, Set<string>>();
  for (const notification of notifications) {
    if (!notification.actorId || hiddenUserIds.has(notification.actorId)) {
      continue;
    }
    const contacts = contactIdsByPost.get(notification.resourceId) ?? new Set();
    contacts.add(notification.actorId);
    contactIdsByPost.set(notification.resourceId, contacts);
  }

  const listings = posts.map((post) => {
    const status = myListingLifecycleStatus(post);
    const visibleInterestIds = new Set(
      post.interestActivity
        .map(({ userId }) => userId)
        .filter((userId) => !hiddenUserIds.has(userId)),
    );
    for (const userId of contactIdsByPost.get(post.id) ?? []) {
      visibleInterestIds.add(userId);
    }
    const visits = post.visitRequests.filter(
      ({ requesterId }) => !hiddenUserIds.has(requesterId),
    );
    const actions = myListingActions(post);
    const isActive = post.status === "ACTIVE";
    const isPaused = post.status === "ARCHIVED";
    const isClosed = post.availabilityStatus === "CLOSED";
    const category = DATABASE_TO_POST_TYPE[post.type];

    return {
      id: post.id,
      title: post.title,
      kind: myListingKind(post),
      city: post.community.locality.city.name,
      locality: post.community.locality.name,
      priceLabel: formatCommunityAmount(
        category,
        post.monthlyAmountMin,
        post.monthlyAmountMax,
      ),
      availabilityStatus: post.availabilityStatus,
      lifecycleStatus: status,
      lifecycleLabel: myListingLifecycleLabel(status),
      freshness: listingFreshness(
        post.availabilityStatus,
        post.lastConfirmedAt,
      ),
      metrics: {
        views: new Set(
          post.recentViews
            .map(({ viewerId }) => viewerId)
            .filter(
              (viewerId) =>
                viewerId !== owner.id && !hiddenUserIds.has(viewerId),
            ),
        ).size,
        saves: new Set(
          post.savedBy
            .map(({ userId }) => userId)
            .filter(
              (userId) => userId !== owner.id && !hiddenUserIds.has(userId),
            ),
        ).size,
        messagesOrInterests: visibleInterestIds.size,
        visitRequests: visits.length,
        openVisitRequests: visits.filter(({ status: visitStatus }) =>
          ["PENDING", "PROPOSED", "ACCEPTED"].includes(visitStatus),
        ).length,
      },
      updatedLabel: updatedLabel(post.updatedAt),
      detailHref: actions.detailAvailable
        ? "/community/post/" + encodeURIComponent(post.id)
        : null,
      editHref: actions.detailAvailable && !isPaused
        ? "/community/post/" + encodeURIComponent(post.id) + "/edit"
        : null,
      matchesHref:
        isActive && !isClosed && post.moderationStatus === "VISIBLE"
          ? "/matches/post/" + encodeURIComponent(post.id)
          : null,
      canPause: actions.canPause,
      canReopen: actions.canReopen,
      canClose: actions.canClose,
      canDelete: actions.canDelete,
    };
  });

  return {
    listings,
    summary: {
      total: listings.length,
      available: listings.filter(
        ({ lifecycleStatus: status }) => status === "AVAILABLE",
      ).length,
      reserved: listings.filter(
        ({ lifecycleStatus: status }) => status === "RESERVED",
      ).length,
      paused: listings.filter(
        ({ lifecycleStatus: status }) => status === "PAUSED",
      ).length,
      closed: listings.filter(({ lifecycleStatus: status }) =>
        status === "CLOSED" || status === "UNAVAILABLE",
      ).length,
    },
  };
}
