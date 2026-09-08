import "server-only";

import { prisma } from "@/lib/prisma";
import {
  generateVisitSlots,
  VISIT_AVAILABILITY_DAYS,
} from "@/lib/visit-availability";
import type { VisitAvailabilityView } from "@/types/visit";

const DAY_MS = 24 * 60 * 60_000;

export async function loadVisitAvailability(
  authUserId: string,
): Promise<VisitAvailabilityView> {
  const user = await prisma.user.findUnique({
    where: { authUserId },
    select: {
      id: true,
      _count: {
        select: {
          posts: {
            where: { type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] } },
          },
        },
      },
      visitAvailabilityRules: {
        select: { weekday: true, startMinute: true, endMinute: true },
        orderBy: { weekday: "asc" },
      },
      visitAvailabilityBlocks: {
        where: { endsAt: { gte: new Date() } },
        select: { id: true, startsAt: true, endsAt: true },
        orderBy: { startsAt: "asc" },
        take: 100,
      },
    },
  });
  if (!user) return { canManage: false, rules: [], blocks: [] };

  return {
    canManage: user._count.posts > 0,
    rules: user.visitAvailabilityRules,
    blocks: user.visitAvailabilityBlocks.map((block) => ({
      id: block.id,
      startsAt: block.startsAt.toISOString(),
      endsAt: block.endsAt.toISOString(),
    })),
  };
}

export async function loadOwnerVisitSlots(
  ownerId: string,
  options: { excludedVisitId?: string; now?: Date; days?: number } = {},
) {
  const now = options.now ?? new Date();
  const days = options.days ?? VISIT_AVAILABILITY_DAYS;
  const horizon = new Date(now.getTime() + (days + 1) * DAY_MS);
  const [rules, blocks, occupied] = await Promise.all([
    prisma.visitAvailabilityRule.findMany({
      where: { ownerId },
      select: { weekday: true, startMinute: true, endMinute: true },
      orderBy: { weekday: "asc" },
    }),
    prisma.visitAvailabilityBlock.findMany({
      where: {
        ownerId,
        startsAt: { lt: horizon },
        endsAt: { gt: now },
      },
      select: { startsAt: true, endsAt: true },
    }),
    prisma.visitRequest.findMany({
      where: {
        ownerId,
        status: "ACCEPTED",
        scheduledAt: { gte: now, lt: horizon },
        ...(options.excludedVisitId
          ? { id: { not: options.excludedVisitId } }
          : {}),
      },
      select: { scheduledAt: true },
    }),
  ]);

  return generateVisitSlots({
    rules,
    blocks,
    occupiedStarts: occupied.flatMap(({ scheduledAt }) =>
      scheduledAt ? [scheduledAt] : [],
    ),
    now,
    days,
  }).map((slot) => slot.toISOString());
}

export async function isOwnerVisitSlotAvailable(
  ownerId: string,
  scheduledAt: Date,
  excludedVisitId?: string,
) {
  const slots = await loadOwnerVisitSlots(ownerId, { excludedVisitId });
  return slots.includes(scheduledAt.toISOString());
}

export async function loadListingVisitSlots(
  postId: string,
  authUserId: string | null,
) {
  if (!authUserId) return [];
  const viewer = await prisma.user.findUnique({
    where: { authUserId },
    select: { id: true },
  });
  if (!viewer) return [];

  const listing = await prisma.post.findFirst({
    where: {
      id: postId,
      type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] },
      status: "ACTIVE",
      moderationStatus: "VISIBLE",
      availabilityStatus: "AVAILABLE",
      publishedAt: { not: null },
      authorId: { not: viewer.id },
      author: {
        blocksCreated: { none: { blockedId: viewer.id } },
        blocksReceived: { none: { blockerId: viewer.id } },
        moderationState: { isNot: { status: "SUSPENDED" } },
      },
    },
    select: { authorId: true },
  });
  return listing ? loadOwnerVisitSlots(listing.authorId) : [];
}
