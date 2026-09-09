import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  formatCommunityAmount,
  formatListingOccupancy,
} from "@/lib/community";
import { createListingImageUrls } from "@/lib/listing-images.server";
import { listingFreshness } from "@/lib/listing-freshness";
import { loadLocalityPulse } from "@/lib/locality-pulse-data";
import { calculateMoveInReadiness } from "@/lib/move-in-readiness";
import {
  loadLatestListingPhotoAtByPostIds,
  loadOpenVisitSlotSignalByOwnerIds,
} from "@/lib/move-in-readiness-data";
import {
  isEligiblePublicListing,
  privacySafeListingTokens,
  publicListingCategory,
  publicListingTitle,
  PUBLIC_LISTING_DATABASE_TYPES,
} from "@/lib/public-listings";
import { loadResponsivenessByUserIds } from "@/lib/responsiveness-data";
import {
  loadListingFeedbackAggregates,
  loadUserTrustScores,
} from "@/lib/trust-score-data";
import { calculateListingTrustScore } from "@/lib/trust-score";
import {
  emptyListingRealityScore,
  loadListingRealityScores,
} from "@/lib/listing-reality-data";
import { verificationSummary } from "@/lib/verification";
import type {
  PublicListing,
  PublicListingDetail,
  PublicListingSitemapEntry,
} from "@/types/public-listing";
import type { TrustScore } from "@/types/trust";

const furnishingLabels = {
  FURNISHED: "Furnished",
  SEMI_FURNISHED: "Semi-furnished",
  UNFURNISHED: "Unfurnished",
} as const;

const roomTypeLabels = {
  PRIVATE_ROOM: "Private room",
  SHARED_ROOM: "Shared room",
  ENTIRE_PLACE: "Entire place",
} as const;

const preferredOccupantLabels = {
  ANY: "No preference",
  WORKING_PROFESSIONAL: "Working professional",
  STUDENT: "Student",
  FAMILY: "Family",
} as const;

const parkingLabels = {
  NONE: "No parking",
  TWO_WHEELER: "Two-wheeler parking",
  CAR: "Car parking",
  BOTH: "Car and two-wheeler parking",
} as const;

const neutralTrust: TrustScore = {
  score: 50,
  confidence: "neutral",
  label: "Trust history building",
  reasons: [],
};

function formatMoney(value: number | null) {
  if (value === null) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAvailableFrom(value: Date | null) {
  if (!value) return "Available now";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function listingDetails(input: {
  category: "Room Available" | "PG Available";
  furnishing: string | null;
  roomType: string | null;
  availableSpots: number | null;
  securityDeposit: number | null;
  maintenanceAmount: number | null;
  preferredOccupant: string | null;
  attachedBathroom: boolean | null;
  parking: string | null;
}): PublicListingDetail[] {
  return [
    { label: "Furnishing", value: input.furnishing },
    { label: "Room type", value: input.roomType },
    {
      label: "Occupancy",
      value: formatListingOccupancy(input.category, input.availableSpots),
    },
    { label: "Deposit", value: formatMoney(input.securityDeposit) },
    {
      label: "Maintenance",
      value: input.maintenanceAmount === null
        ? null
        : `${formatMoney(input.maintenanceAmount)} / month`,
    },
    { label: "Preferred occupant", value: input.preferredOccupant },
    {
      label: "Attached bathroom",
      value: input.attachedBathroom === null
        ? null
        : input.attachedBathroom ? "Yes" : "No",
    },
    { label: "Parking", value: input.parking },
  ].flatMap(({ label, value }) => value ? [{ label, value }] : []);
}

export const loadPublicListing = cache(async function loadPublicListing(
  postId: string,
  viewerAuthUserId: string | null = null,
): Promise<PublicListing | null> {
  if (!postId || postId.length > 128) return null;
  const viewer = viewerAuthUserId
    ? await prisma.user.findUnique({
        where: { authUserId: viewerAuthUserId },
        select: { id: true },
      })
    : null;

  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      type: { in: [...PUBLIC_LISTING_DATABASE_TYPES] },
      status: "ACTIVE",
      availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
      moderationStatus: "VISIBLE",
      publishedAt: { not: null },
      community: { isActive: true },
      author: {
        moderationState: { isNot: { status: "SUSPENDED" } },
        ...(viewer
          ? {
              blocksReceived: { none: { blockerId: viewer.id } },
              blocksCreated: { none: { blockedId: viewer.id } },
            }
          : {}),
      },
    },
    select: {
      id: true,
      type: true,
      status: true,
      availabilityStatus: true,
      moderationStatus: true,
      monthlyAmountMin: true,
      monthlyAmountMax: true,
      securityDeposit: true,
      maintenanceAmount: true,
      moveInDate: true,
      furnishingStatus: true,
      roomType: true,
      preferredOccupant: true,
      attachedBathroom: true,
      parkingType: true,
      availableSpots: true,
      amenities: true,
      imagePaths: true,
      publishedAt: true,
      lastConfirmedAt: true,
      updatedAt: true,
      community: {
        select: {
          id: true,
          localityId: true,
          isActive: true,
          locality: {
            select: {
              name: true,
              slug: true,
              city: { select: { name: true, slug: true } },
            },
          },
        },
      },
      verificationChecks: {
        where: { status: "VERIFIED" },
        select: { kind: true, status: true, verifiedAt: true, expiresAt: true },
      },
      author: {
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          moderationState: { select: { status: true } },
        },
      },
    },
  });

  if (
    !post ||
    !post.publishedAt ||
    (post.type !== "ROOM_AVAILABLE" && post.type !== "PG_AVAILABLE") ||
    (post.availabilityStatus !== "AVAILABLE" &&
      post.availabilityStatus !== "RESERVED")
  ) return null;
  const authorSuspended = post.author.moderationState?.status === "SUSPENDED";
  if (!isEligiblePublicListing({
    type: post.type,
    status: post.status,
    availabilityStatus: post.availabilityStatus,
    moderationStatus: post.moderationStatus,
    publishedAt: post.publishedAt,
    communityActive: post.community.isActive,
    authorSuspended,
    viewerBlocked: false,
  })) return null;

  const category = publicListingCategory(post.type);
  const furnishing = post.furnishingStatus
    ? furnishingLabels[post.furnishingStatus]
    : null;
  const roomType = post.roomType ? roomTypeLabels[post.roomType] : null;
  const availability = listingFreshness(
    post.availabilityStatus,
    post.lastConfirmedAt,
  );
  const responsiveness = await loadResponsivenessByUserIds([{
    id: post.author.id,
    createdAt: post.author.createdAt,
    updatedAt: post.author.updatedAt,
  }]);
  const ownerTrust = (await loadUserTrustScores([{
    id: post.author.id,
    responsiveness: responsiveness.get(post.author.id)!,
  }])).get(post.author.id) ?? neutralTrust;
  const listingVerification = verificationSummary(post.verificationChecks);
  const listingFeedback = (await loadListingFeedbackAggregates([post.id])).get(post.id) ?? null;
  const reality = (await loadListingRealityScores([post.id])).get(post.id)
    ?? emptyListingRealityScore();
  const trust = calculateListingTrustScore({
    ownerTrust,
    verificationKinds: listingVerification.badges.map(({ kind }) => kind),
    availability,
    feedback: listingFeedback,
  });
  const [openSlotsByOwnerId, latestPhotoAtByPostId, localityPulse] = await Promise.all([
    loadOpenVisitSlotSignalByOwnerIds([post.author.id]),
    loadLatestListingPhotoAtByPostIds([
      { id: post.id, imagePaths: post.imagePaths },
    ]),
    loadLocalityPulse(post.community.id, post.community.localityId),
  ]);
  const readiness = calculateMoveInReadiness({
    availability,
    imageCount: post.imagePaths.length,
    latestPhotoAt: latestPhotoAtByPostId.get(post.id) ?? null,
    verificationKinds: listingVerification.badges.map(({ kind }) => kind),
    trust,
    responsiveness: responsiveness.get(post.author.id)!,
    hasOpenVisitSlots: openSlotsByOwnerId.get(post.author.id) ?? false,
    propertyDetails: {
      rent:
        post.monthlyAmountMin !== null || post.monthlyAmountMax !== null,
      availabilityDate: post.moveInDate !== null,
      furnishing: post.furnishingStatus !== null,
      roomType: post.roomType !== null,
      occupancy: post.availableSpots !== null,
      deposit: post.securityDeposit !== null,
      maintenance: post.maintenanceAmount !== null,
      preferredOccupant: post.preferredOccupant !== null,
      attachedBathroom: post.attachedBathroom !== null,
      parking: post.parkingType !== null,
      amenities: post.amenities.length > 0,
    },
  });
  const locality = post.community.locality;

  return {
    id: post.id,
    category,
    seoTitle: publicListingTitle({
      category,
      locality: locality.name,
      city: locality.city.name,
      furnishing,
      roomType,
    }),
    city: locality.city.name,
    citySlug: locality.city.slug,
    locality: locality.name,
    localitySlug: locality.slug,
    priceLabel: formatCommunityAmount(
      category,
      post.monthlyAmountMin,
      post.monthlyAmountMax,
    ),
    availableFrom: formatAvailableFrom(post.moveInDate),
    images: await createListingImageUrls(post.imagePaths, 60 * 60 * 24),
    amenities: privacySafeListingTokens(post.amenities),
    details: listingDetails({
      category,
      furnishing,
      roomType,
      availableSpots: post.availableSpots,
      securityDeposit: post.securityDeposit,
      maintenanceAmount: post.maintenanceAmount,
      preferredOccupant: post.preferredOccupant
        ? preferredOccupantLabels[post.preferredOccupant]
        : null,
      attachedBathroom: post.attachedBathroom,
      parking: post.parkingType ? parkingLabels[post.parkingType] : null,
    }),
    availability: {
      status: post.availabilityStatus,
      label: availability.label,
      isStale: availability.isStale,
      freshnessLabel: availability.freshnessLabel,
    },
    verification: listingVerification,
    trust,
    reality,
    readiness,
    localityPulse,
    publishedAt: post.publishedAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
});

export async function loadPublicListingSitemapEntries(): Promise<PublicListingSitemapEntry[]> {
  return prisma.post.findMany({
    where: {
      type: { in: [...PUBLIC_LISTING_DATABASE_TYPES] },
      status: "ACTIVE",
      availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
      moderationStatus: "VISIBLE",
      publishedAt: { not: null },
      community: { isActive: true },
      author: { moderationState: { isNot: { status: "SUSPENDED" } } },
    },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });
}
