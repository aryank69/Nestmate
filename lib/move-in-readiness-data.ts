import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { LISTING_IMAGE_BUCKET } from "@/lib/listing-images";
import { prisma } from "@/lib/prisma";
import {
  generateVisitSlots,
  VISIT_AVAILABILITY_DAYS,
} from "@/lib/visit-availability";

const DAY_MS = 86_400_000;

type ListingPhotoSeed = {
  id: string;
  imagePaths: string[];
};

type ListingPhotoTimestampRow = {
  name: string;
  updatedAt: Date | string | null;
};

export async function loadLatestListingPhotoAtByPostIds(
  posts: ListingPhotoSeed[],
) {
  const uniquePaths = [...new Set(posts.flatMap(({ imagePaths }) => imagePaths))];
  if (!uniquePaths.length) {
    return new Map(posts.map(({ id }) => [id, null] as const));
  }

  const rows = await prisma.$queryRaw<ListingPhotoTimestampRow[]>(Prisma.sql`
    SELECT
      stored_object.name,
      COALESCE(stored_object.updated_at, stored_object.created_at) AS "updatedAt"
    FROM storage.objects AS stored_object
    WHERE stored_object.bucket_id = ${LISTING_IMAGE_BUCKET}
      AND stored_object.name IN (${Prisma.join(uniquePaths)})
  `);
  const timestampByPath = new Map(
    rows.flatMap((row) => row.updatedAt ? [[row.name, new Date(row.updatedAt)] as const] : []),
  );

  return new Map(posts.map((post) => {
    const timestamps = post.imagePaths.flatMap((path) => {
      const timestamp = timestampByPath.get(path);
      return timestamp && Number.isFinite(timestamp.getTime()) ? [timestamp] : [];
    });
    const latest = timestamps.sort(
      (first, second) => second.getTime() - first.getTime(),
    )[0] ?? null;
    return [post.id, latest] as const;
  }));
}

export async function loadOpenVisitSlotSignalByOwnerIds(
  ownerIds: string[],
  now = new Date(),
) {
  const uniqueOwnerIds = [...new Set(ownerIds)];
  if (!uniqueOwnerIds.length) return new Map<string, boolean>();
  const horizon = new Date(
    now.getTime() + (VISIT_AVAILABILITY_DAYS + 1) * DAY_MS,
  );

  const [rules, blocks, occupied] = await Promise.all([
    prisma.visitAvailabilityRule.findMany({
      where: { ownerId: { in: uniqueOwnerIds } },
      select: { ownerId: true, weekday: true, startMinute: true, endMinute: true },
    }),
    prisma.visitAvailabilityBlock.findMany({
      where: {
        ownerId: { in: uniqueOwnerIds },
        startsAt: { lt: horizon },
        endsAt: { gt: now },
      },
      select: { ownerId: true, startsAt: true, endsAt: true },
    }),
    prisma.visitRequest.findMany({
      where: {
        ownerId: { in: uniqueOwnerIds },
        status: "ACCEPTED",
        scheduledAt: { gte: now, lt: horizon },
      },
      select: { ownerId: true, scheduledAt: true },
    }),
  ]);

  return new Map(
    uniqueOwnerIds.map((ownerId) => {
      const hasOpenSlot = generateVisitSlots({
        rules: rules.filter((rule) => rule.ownerId === ownerId),
        blocks: blocks.filter((block) => block.ownerId === ownerId),
        occupiedStarts: occupied.flatMap((visit) =>
          visit.ownerId === ownerId && visit.scheduledAt
            ? [visit.scheduledAt]
            : [],
        ),
        now,
        days: VISIT_AVAILABILITY_DAYS,
      }).length > 0;
      return [ownerId, hasOpenSlot] as const;
    }),
  );
}
