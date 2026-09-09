import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { resolveListingStaleAfterDays } from "@/lib/listing-freshness";
import {
  buildLocalityPulse,
  type LocalityPulseAggregate,
} from "@/lib/locality-pulse";
import { prisma } from "@/lib/prisma";
import type { LocalityPulse } from "@/types/locality-pulse";

type AggregateRow = {
  activeListings: bigint | number | string;
  peopleSearching: bigint | number | string;
  rentSampleSize: bigint | number | string;
  medianRent: number | string | null;
  depositSampleSize: bigint | number | string;
  medianDeposit: number | string | null;
  freshListingCount: bigint | number | string;
  recentSupply: bigint | number | string;
  recentDemand: bigint | number | string;
  previousSupply: bigint | number | string;
  previousDemand: bigint | number | string;
  moveInSampleSize: bigint | number | string;
  moveInSoon: bigint | number | string;
  moveInOneToTwoMonths: bigint | number | string;
  moveInTwoToThreeMonths: bigint | number | string;
  moveInLater: bigint | number | string;
  commuteSampleSize: bigint | number | string;
  medianPreferredCommuteKm: number | string | null;
};

const DAY_MS = 86_400_000;

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function safeNumber(value: bigint | number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function count(value: bigint | number | string) {
  return Math.max(0, Math.floor(safeNumber(value) ?? 0));
}

function normalizeAggregate(row: AggregateRow): LocalityPulseAggregate {
  return {
    activeListings: count(row.activeListings),
    peopleSearching: count(row.peopleSearching),
    rentSampleSize: count(row.rentSampleSize),
    medianRent: safeNumber(row.medianRent),
    depositSampleSize: count(row.depositSampleSize),
    medianDeposit: safeNumber(row.medianDeposit),
    freshListingCount: count(row.freshListingCount),
    recentSupply: count(row.recentSupply),
    recentDemand: count(row.recentDemand),
    previousSupply: count(row.previousSupply),
    previousDemand: count(row.previousDemand),
    moveInSampleSize: count(row.moveInSampleSize),
    moveInSoon: count(row.moveInSoon),
    moveInOneToTwoMonths: count(row.moveInOneToTwoMonths),
    moveInTwoToThreeMonths: count(row.moveInTwoToThreeMonths),
    moveInLater: count(row.moveInLater),
    commuteSampleSize: count(row.commuteSampleSize),
    medianPreferredCommuteKm: safeNumber(row.medianPreferredCommuteKm),
  };
}

export async function loadLocalityPulse(
  communityId: string,
  localityId: string,
  now = new Date(),
): Promise<LocalityPulse> {
  const staleAfterDays = resolveListingStaleAfterDays();
  const today = startOfUtcDay(now);
  const inThirtyDays = addDays(today, 30);
  const inSixtyDays = addDays(today, 60);
  const inNinetyDays = addDays(today, 90);
  const recentStart = addDays(now, -30);
  const previousStart = addDays(now, -60);
  const freshAfter = addDays(now, -staleAfterDays);

  const rows = await prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
    WITH locality_scope AS (
      SELECT community."id" AS community_id, community."localityId" AS locality_id
      FROM public."Community" AS community
      WHERE community."id" = ${communityId}
        AND community."localityId" = ${localityId}
        AND community."isActive" = TRUE
    ), eligible_posts AS (
      SELECT
        post."authorId",
        post."type"::text AS post_type,
        post."monthlyAmountMin",
        post."monthlyAmountMax",
        post."securityDeposit",
        post."moveInDate",
        post."publishedAt",
        post."lastConfirmedAt"
      FROM public."Post" AS post
      JOIN locality_scope AS scope ON scope.community_id = post."communityId"
      JOIN public."User" AS author ON author."id" = post."authorId"
      LEFT JOIN public."UserModerationState" AS moderation
        ON moderation."userId" = author."id"
      WHERE post."status"::text = 'ACTIVE'
        AND post."moderationStatus"::text = 'VISIBLE'
        AND post."availabilityStatus"::text IN ('AVAILABLE', 'RESERVED')
        AND post."publishedAt" IS NOT NULL
        AND COALESCE(moderation."status"::text, '') <> 'SUSPENDED'
    ), supply_posts AS (
      SELECT *,
        CASE
          WHEN "monthlyAmountMin" IS NOT NULL AND "monthlyAmountMax" IS NOT NULL
            THEN ("monthlyAmountMin" + "monthlyAmountMax")::numeric / 2
          ELSE COALESCE("monthlyAmountMin", "monthlyAmountMax")::numeric
        END AS rent_amount
      FROM eligible_posts
      WHERE post_type IN ('ROOM_AVAILABLE', 'PG_AVAILABLE')
    ), demand_posts AS (
      SELECT *
      FROM eligible_posts
      WHERE post_type IN ('NEED_ROOM', 'NEED_FLATMATE')
    ), commute_preferences AS (
      SELECT preferences."preferredCommuteKm" AS preferred_commute_km
      FROM public."UserPreferredLocality" AS preferred_locality
      JOIN locality_scope AS scope
        ON scope.locality_id = preferred_locality."localityId"
      JOIN public."UserPreferences" AS preferences
        ON preferences."id" = preferred_locality."preferencesId"
      JOIN public."User" AS searcher ON searcher."id" = preferences."userId"
      LEFT JOIN public."UserModerationState" AS moderation
        ON moderation."userId" = searcher."id"
      WHERE preferences."preferredCommuteKm" IS NOT NULL
        AND COALESCE(moderation."status"::text, '') <> 'SUSPENDED'
    )
    SELECT
      (SELECT count(*) FROM supply_posts) AS "activeListings",
      (SELECT count(DISTINCT "authorId") FROM demand_posts
        WHERE "lastConfirmedAt" >= ${freshAfter}) AS "peopleSearching",
      (SELECT count(rent_amount) FROM supply_posts) AS "rentSampleSize",
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY rent_amount)
        FROM supply_posts WHERE rent_amount IS NOT NULL) AS "medianRent",
      (SELECT count("securityDeposit") FROM supply_posts) AS "depositSampleSize",
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "securityDeposit")
        FROM supply_posts WHERE "securityDeposit" IS NOT NULL) AS "medianDeposit",
      (SELECT count(*) FROM supply_posts
        WHERE "lastConfirmedAt" >= ${freshAfter}) AS "freshListingCount",
      (SELECT count(*) FROM supply_posts
        WHERE "publishedAt" >= ${recentStart}) AS "recentSupply",
      (SELECT count(*) FROM demand_posts
        WHERE "publishedAt" >= ${recentStart}) AS "recentDemand",
      (SELECT count(*) FROM supply_posts
        WHERE "publishedAt" >= ${previousStart}
          AND "publishedAt" < ${recentStart}) AS "previousSupply",
      (SELECT count(*) FROM demand_posts
        WHERE "publishedAt" >= ${previousStart}
          AND "publishedAt" < ${recentStart}) AS "previousDemand",
      (SELECT count("moveInDate") FROM eligible_posts) AS "moveInSampleSize",
      (SELECT count(*) FROM eligible_posts
        WHERE "moveInDate" IS NOT NULL
          AND "moveInDate" < ${inThirtyDays}) AS "moveInSoon",
      (SELECT count(*) FROM eligible_posts
        WHERE "moveInDate" >= ${inThirtyDays}
          AND "moveInDate" < ${inSixtyDays}) AS "moveInOneToTwoMonths",
      (SELECT count(*) FROM eligible_posts
        WHERE "moveInDate" >= ${inSixtyDays}
          AND "moveInDate" < ${inNinetyDays}) AS "moveInTwoToThreeMonths",
      (SELECT count(*) FROM eligible_posts
        WHERE "moveInDate" >= ${inNinetyDays}) AS "moveInLater",
      (SELECT count(preferred_commute_km) FROM commute_preferences) AS "commuteSampleSize",
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY preferred_commute_km)
        FROM commute_preferences) AS "medianPreferredCommuteKm"
  `);

  const row = rows[0];
  const aggregate = row
    ? normalizeAggregate(row)
    : normalizeAggregate({
        activeListings: 0,
        peopleSearching: 0,
        rentSampleSize: 0,
        medianRent: null,
        depositSampleSize: 0,
        medianDeposit: null,
        freshListingCount: 0,
        recentSupply: 0,
        recentDemand: 0,
        previousSupply: 0,
        previousDemand: 0,
        moveInSampleSize: 0,
        moveInSoon: 0,
        moveInOneToTwoMonths: 0,
        moveInTwoToThreeMonths: 0,
        moveInLater: 0,
        commuteSampleSize: 0,
        medianPreferredCommuteKm: null,
      });

  return buildLocalityPulse(aggregate, { staleAfterDays });
}

export async function loadLocalityPulseForPost(postId: string) {
  if (!postId || postId.length > 128) return null;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      communityId: true,
      community: { select: { localityId: true } },
    },
  });
  return post
    ? loadLocalityPulse(post.communityId, post.community.localityId)
    : null;
}
