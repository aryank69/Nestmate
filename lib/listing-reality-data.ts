import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  calculateListingRealityScore,
  notEnoughListingRealityFeedback,
} from "@/lib/listing-reality";
import { prisma } from "@/lib/prisma";
import type { ListingRealityScore } from "@/types/listing-reality";

type ListingRealityAggregateRow = {
  postId: string;
  responseCount: number | bigint;
  photosAccuracy: number | string;
  costAccuracy: number | string;
  amenitiesAccuracy: number | string;
  conditionAccuracy: number | string;
  locationAccuracy: number | string;
  descriptionAccuracy: number | string;
};

export async function loadListingRealityScores(
  postIds: string[],
): Promise<Map<string, ListingRealityScore>> {
  const uniquePostIds = [...new Set(postIds)].slice(0, 200);
  if (!uniquePostIds.length) return new Map();

  const rows = await prisma.$queryRaw<ListingRealityAggregateRow[]>(Prisma.sql`
    SELECT
      aggregate."postId",
      aggregate."responseCount",
      aggregate."photosAccuracy",
      aggregate."costAccuracy",
      aggregate."amenitiesAccuracy",
      aggregate."conditionAccuracy",
      aggregate."locationAccuracy",
      aggregate."descriptionAccuracy"
    FROM nestmate_private.listing_reality_aggregate AS aggregate
    WHERE aggregate."postId" IN (${Prisma.join(uniquePostIds)})
  `);

  return new Map(rows.map((row) => [
    row.postId,
    calculateListingRealityScore({
      responseCount: Number(row.responseCount),
      photosAccuracy: Number(row.photosAccuracy),
      costAccuracy: Number(row.costAccuracy),
      amenitiesAccuracy: Number(row.amenitiesAccuracy),
      conditionAccuracy: Number(row.conditionAccuracy),
      locationAccuracy: Number(row.locationAccuracy),
      descriptionAccuracy: Number(row.descriptionAccuracy),
    }),
  ]));
}

export function emptyListingRealityScore() {
  return notEnoughListingRealityFeedback();
}
