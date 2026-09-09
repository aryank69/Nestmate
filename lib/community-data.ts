import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  commuteBounds,
  distanceBetweenKm,
  summarizeCommute,
} from "@/lib/commute";
import { prisma } from "@/lib/prisma";
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
import {
  communityInitials,
  DATABASE_TO_GENDER,
  DATABASE_TO_POST_TYPE,
  formatListingOccupancy,
  formatCommunityAmount,
} from "@/lib/community";
import {
  createListingImageUrlMap,
  createListingImageUrls,
} from "@/lib/listing-images.server";
import { listingFreshness } from "@/lib/listing-freshness";
import { loadLocalityPulse } from "@/lib/locality-pulse-data";
import { calculateMoveInReadiness } from "@/lib/move-in-readiness";
import {
  loadLatestListingPhotoAtByPostIds,
  loadOpenVisitSlotSignalByOwnerIds,
} from "@/lib/move-in-readiness-data";
import { publicMapPoint } from "@/lib/maps";
import { verificationSummary } from "@/lib/verification";
import type { CompatibilityProfile } from "@/types/compatibility";
import type {
  CommuteBounds,
  PrivateCommuteDestination,
} from "@/types/commute";
import type {
  CommunityPostFilters,
  CommunityPostTypeCounts,
} from "@/types/discovery";
import type {
  CommunityLocationOption,
  CommunityPost,
  CommunityPostFormInitial,
} from "@/types/community";

const dietLabels = {
  VEGETARIAN: "Vegetarian",
  NON_VEGETARIAN: "Non-vegetarian",
  EGGETARIAN: "Eggetarian",
  VEGAN: "Vegan",
} as const;

const habitLabels = {
  NEVER: "Never",
  OCCASIONALLY: "Occasionally",
  REGULARLY: "Regularly",
} as const;

const sleepLabels = {
  EARLY_BIRD: "Early bird",
  BALANCED: "Flexible",
  NIGHT_OWL: "Night owl",
} as const;

const cleanlinessLabels = {
  RELAXED: "Relaxed",
  MODERATE: "Moderately tidy",
  VERY_TIDY: "Very tidy",
} as const;

const petLabels = {
  HAS_PETS: "Have a pet",
  PET_FRIENDLY: "Pet friendly",
  PREFERS_NO_PETS: "Prefer no pets",
} as const;

const occupationLabels = {
  STUDENT: "Student",
  WORKING_PROFESSIONAL: "Working professional",
  SELF_EMPLOYED: "Self-employed",
  FREELANCER: "Freelancer",
  OTHER: "Other",
} as const;

const furnishingLabels = {
  FURNISHED: "Furnished",
  SEMI_FURNISHED: "Semi-furnished",
  UNFURNISHED: "Unfurnished",
} as const;

const preferredOccupantLabels = {
  ANY: "No preference",
  WORKING_PROFESSIONAL: "Working professional",
  STUDENT: "Student",
  FAMILY: "Family",
} as const;

const parkingLabels = {
  NONE: "No parking",
  TWO_WHEELER: "Two-wheeler",
  CAR: "Car",
  BOTH: "Car and two-wheeler",
} as const;

export async function loadCommunityLocations(): Promise<
  CommunityLocationOption[]
> {
  const communities = await prisma.community.findMany({
    where: { isActive: true },
    select: {
      id: true,
      localityId: true,
      name: true,
      description: true,
      locality: {
        select: {
          name: true,
          slug: true,
          city: { select: { name: true, slug: true } },
        },
      },
      _count: {
        select: {
          members: true,
          posts: {
            where: {
              status: "ACTIVE",
              availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
              publishedAt: { not: null },
            },
          },
        },
      },
    },
    orderBy: [
      { locality: { city: { name: "asc" } } },
      { locality: { name: "asc" } },
    ],
  });

  return communities.map((community) => ({
    id: community.id,
    localityId: community.localityId,
    name: community.name,
    description: community.description,
    city: community.locality.city.name,
    citySlug: community.locality.city.slug,
    locality: community.locality.name,
    localitySlug: community.locality.slug,
    memberCount: community._count.members,
    postCount: community._count.posts,
  }));
}

export async function loadCommunityLocation(
  citySlug: string,
  localitySlug: string,
): Promise<CommunityLocationOption | null> {
  const community = await prisma.community.findFirst({
    where: {
      isActive: true,
      locality: { slug: localitySlug, city: { slug: citySlug } },
    },
    select: {
      id: true,
      localityId: true,
      name: true,
      description: true,
      locality: {
        select: {
          name: true,
          slug: true,
          city: { select: { name: true, slug: true } },
        },
      },
      _count: {
        select: {
          members: true,
          posts: {
            where: {
              status: "ACTIVE",
              availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
              publishedAt: { not: null },
            },
          },
        },
      },
    },
  });

  if (!community) return null;

  return {
    id: community.id,
    localityId: community.localityId,
    name: community.name,
    description: community.description,
    city: community.locality.city.name,
    citySlug: community.locality.city.slug,
    locality: community.locality.name,
    localitySlug: community.locality.slug,
    memberCount: community._count.members,
    postCount: community._count.posts,
  };
}

function relativePostedAt(value: Date) {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - value.getTime()) / 1000),
  );

  if (elapsedSeconds < 60) return "just now";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: value.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric",
    timeZone: "UTC",
  }).format(value);
}

function formatMoveInDate(value: Date | null) {
  if (!value) return "Flexible";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function formatListingMoney(value: number | null) {
  if (value === null) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function profileValue<T extends string>(
  map: Record<T, string>,
  value: T | null,
) {
  return value ? map[value] : null;
}

function privateCommuteDestination(
  preference:
    | {
        commuteDestination: string | null;
        commuteLatitude: Prisma.Decimal | null;
        commuteLongitude: Prisma.Decimal | null;
        preferredCommuteKm: number | null;
      }
    | null
    | undefined,
): PrivateCommuteDestination | null {
  if (
    !preference?.commuteDestination ||
    preference.commuteLatitude === null ||
    preference.commuteLongitude === null
  ) {
    return null;
  }

  return {
    label: preference.commuteDestination,
    latitude: Number(preference.commuteLatitude),
    longitude: Number(preference.commuteLongitude),
    preferredRangeKm: preference.preferredCommuteKm,
  };
}

type KnownCommunityViewerState = {
  blockedUserIds: string[];
  savedPostIds: string[];
  closedPostIds: string[];
  activityStages: Array<{ postId: string | null; stage: import("@/types/activity").InterestStage }>;
  commuteDestination: PrivateCommuteDestination | null;
};

export type CommunityPostQueryOptions = {
  housingTypes?: Array<"ROOM_AVAILABLE" | "PG_AVAILABLE">;
  furnishingStatus?: "FURNISHED" | "SEMI_FURNISHED" | "UNFURNISHED" | null;
  roomTypes?: Array<"PRIVATE_ROOM" | "SHARED_ROOM" | "ENTIRE_PLACE">;
};

type CommunityScope = string | readonly string[] | null;

export async function loadCommunityPosts(
  viewerAuthUserId: string | null,
  communityId: CommunityScope,
  filters: CommunityPostFilters,
  knownViewerState?: KnownCommunityViewerState,
  requestedPostId?: string,
  queryOptions?: CommunityPostQueryOptions,
): Promise<CommunityPost[]> {
  const viewerState =
    viewerAuthUserId && !knownViewerState
      ? await prisma.user.findUnique({
          where: { authUserId: viewerAuthUserId },
          select: {
            id: true,
            blocksCreated: { select: { blockedId: true } },
            savedPosts: { select: { postId: true } },
            interestsTracked: {
              where: { targetType: "LISTING" },
              select: { postId: true, stage: true },
            },
            documentSpacesAsParticipantOne: {
              where: { status: "CLOSED", targetType: "LISTING" },
              select: { postId: true, post: { select: { authorId: true } } },
            },
            documentSpacesAsParticipantTwo: {
              where: { status: "CLOSED", targetType: "LISTING" },
              select: { postId: true, post: { select: { authorId: true } } },
            },
            preferences: {
              select: {
                commuteDestination: true,
                commuteLatitude: true,
                commuteLongitude: true,
                preferredCommuteKm: true,
              },
            },
          },
        })
      : null;
  const blockedUserIds =
    knownViewerState?.blockedUserIds ??
    viewerState?.blocksCreated.map(({ blockedId }) => blockedId) ??
    [];
  const savedPostIds = new Set(
    knownViewerState?.savedPostIds ??
      viewerState?.savedPosts.map(({ postId }) => postId) ??
      [],
  );
  const closedPostIds =
    knownViewerState?.closedPostIds ??
    [
      ...(viewerState?.documentSpacesAsParticipantOne ?? []),
      ...(viewerState?.documentSpacesAsParticipantTwo ?? []),
    ].flatMap((space) =>
      space.postId && space.post?.authorId !== viewerState?.id
        ? [space.postId]
        : [],
    );
  const activityStageByPostId = new Map(
    (knownViewerState?.activityStages ?? viewerState?.interestsTracked ?? []).flatMap(
      ({ postId, stage }) => postId ? [[postId, stage] as const] : [],
    ),
  );
  const destination =
    knownViewerState?.commuteDestination ??
    privateCommuteDestination(viewerState?.preferences);
  const bounds =
    destination && filters.maximumDistanceKm
      ? commuteBounds(destination, filters.maximumDistanceKm)
      : null;

  const where = communityPostWhere(
    communityId,
    filters,
    blockedUserIds,
    closedPostIds,
    true,
    bounds,
    requestedPostId ? viewerAuthUserId : null,
    queryOptions,
  );

  const posts = await prisma.post.findMany({
    where: { ...where, ...(requestedPostId ? { id: requestedPostId } : {}) },
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      monthlyAmountMin: true,
      monthlyAmountMax: true,
      securityDeposit: true,
      maintenanceAmount: true,
      moveInDate: true,
      furnishingStatus: true,
      preferredOccupant: true,
      attachedBathroom: true,
      parkingType: true,
      latitude: true,
      longitude: true,
      locationPrecision: true,
      roomType: true,
      bedrooms: true,
      availableSpots: true,
      mealsIncluded: true,
      amenities: true,
      tags: true,
      imagePaths: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      availabilityStatus: true,
      lastConfirmedAt: true,
      verificationChecks: {
        where: { status: "VERIFIED" },
        select: {
          kind: true,
          status: true,
          verifiedAt: true,
          expiresAt: true,
        },
      },
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
      author: {
        select: {
          id: true,
          authUserId: true,
          name: true,
          profession: true,
          createdAt: true,
          updatedAt: true,
          verificationChecks: {
            where: { status: "VERIFIED" },
            select: {
              kind: true,
              status: true,
              verifiedAt: true,
              expiresAt: true,
            },
          },
          preferences: {
            select: {
              budgetMin: true,
              budgetMax: true,
              diet: true,
              smoking: true,
              drinking: true,
              sleepSchedule: true,
              cleanliness: true,
              pets: true,
              occupationStatus: true,
              preferredLocalities: {
                orderBy: { priority: "asc" },
                select: { locality: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
    orderBy:
      filters.sort === "lowest-amount"
        ? [
            { monthlyAmountMin: { sort: "asc", nulls: "last" } },
            { monthlyAmountMax: { sort: "asc", nulls: "last" } },
            { publishedAt: "desc" },
            { id: "desc" },
          ]
        : [{ publishedAt: "desc" }, { id: "desc" }],
    take: requestedPostId ? 1 : 100,
  });

  const imageUrlMap = await createListingImageUrlMap(
    posts.flatMap((post) => post.imagePaths),
  );
  const responsivenessByUserId = await loadResponsivenessByUserIds(
    [...new Map(
      posts.map((post) => [
        post.author.id,
        {
          id: post.author.id,
          createdAt: post.author.createdAt,
          updatedAt: post.author.updatedAt,
        },
      ]),
    ).values()],
  );
  const listingPostIds = posts
    .filter(({ type }) => type === "ROOM_AVAILABLE" || type === "PG_AVAILABLE")
    .map(({ id }) => id);
  const listingOwnerIds = posts
    .filter(({ type }) => type === "ROOM_AVAILABLE" || type === "PG_AVAILABLE")
    .map(({ author }) => author.id);
  const [
    trustByUserId,
    feedbackByPostId,
    realityByPostId,
    openSlotsByOwnerId,
    latestPhotoAtByPostId,
  ] = await Promise.all([
    loadUserTrustScores(
      [...new Map(
        posts.map((post) => [
          post.author.id,
          {
            id: post.author.id,
            responsiveness: responsivenessByUserId.get(post.author.id)!,
          },
        ]),
      ).values()],
    ),
    loadListingFeedbackAggregates(listingPostIds),
    loadListingRealityScores(listingPostIds),
    loadOpenVisitSlotSignalByOwnerIds(listingOwnerIds),
    loadLatestListingPhotoAtByPostIds(
      posts
        .filter(({ type }) => type === "ROOM_AVAILABLE" || type === "PG_AVAILABLE")
        .map(({ id, imagePaths }) => ({ id, imagePaths })),
    ),
  ]);

  return posts.flatMap((post) => {
    const category = DATABASE_TO_POST_TYPE[post.type];
    const preferences = post.author.preferences;
    const compatibilityProfile: CompatibilityProfile | undefined =
      preferences && post.author.authUserId !== viewerAuthUserId
        ? {
            budget:
              preferences.budgetMin !== null || preferences.budgetMax !== null
                ? {
                    minimum: preferences.budgetMin,
                    maximum: preferences.budgetMax,
                  }
                : null,
            preferredLocalities: preferences.preferredLocalities.map(
              ({ locality }) => locality.name,
            ),
            diet: profileValue(dietLabels, preferences.diet),
            smoking:
              preferences.smoking === "NEVER"
                ? "Non-smoker"
                : profileValue(habitLabels, preferences.smoking),
            drinking: profileValue(habitLabels, preferences.drinking),
            sleepSchedule: profileValue(sleepLabels, preferences.sleepSchedule),
            cleanliness: profileValue(
              cleanlinessLabels,
              preferences.cleanliness,
            ),
            pets: profileValue(petLabels, preferences.pets),
            occupationStatus: profileValue(
              occupationLabels,
              preferences.occupationStatus,
            ),
          }
        : undefined;

    const listingLocation =
      (category === "Room Available" || category === "PG Available") &&
      post.latitude !== null &&
      post.longitude !== null &&
      post.locationPrecision
        ? publicMapPoint(
            {
              latitude: Number(post.latitude),
              longitude: Number(post.longitude),
            },
            post.locationPrecision,
          )
        : null;
    const commute =
      listingLocation && destination
        ? summarizeCommute(listingLocation, destination)
        : null;

    if (
      filters.maximumDistanceKm !== null &&
      destination &&
      (!commute || commute.distanceKm > filters.maximumDistanceKm)
    ) {
      return [];
    }

    const authorVerification = verificationSummary(
      post.author.verificationChecks,
    );
    const authorTrust = trustByUserId.get(post.author.id)!;
    const availability = listingFreshness(
      post.availabilityStatus,
      post.lastConfirmedAt,
    );
    const listingVerification = verificationSummary(post.verificationChecks);
    const trust =
      category === "Room Available" || category === "PG Available"
        ? calculateListingTrustScore({
            ownerTrust: authorTrust,
            verificationKinds: listingVerification.badges.map(({ kind }) => kind),
            availability,
            feedback: feedbackByPostId.get(post.id) ?? null,
          })
        : authorTrust;
    const readiness =
      category === "Room Available" || category === "PG Available"
        ? calculateMoveInReadiness({
            availability,
            imageCount: post.imagePaths.length,
            latestPhotoAt: latestPhotoAtByPostId.get(post.id) ?? null,
            verificationKinds: listingVerification.badges.map(({ kind }) => kind),
            trust,
            responsiveness: responsivenessByUserId.get(post.author.id)!,
            hasOpenVisitSlots: openSlotsByOwnerId.get(post.author.id) ?? false,
            propertyDetails: {
              rent:
                post.monthlyAmountMin !== null ||
                post.monthlyAmountMax !== null,
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
          })
        : null;

    return [{
      id: post.id,
      author: {
        authUserId: post.author.authUserId,
        id: post.author.id,
        name: post.author.name,
        initials: communityInitials(post.author.name),
        role:
          post.author.profession ||
          (preferences?.occupationStatus
            ? occupationLabels[preferences.occupationStatus]
            : "NestMate member"),
        verification: authorVerification,
        trust: authorTrust,
        compatibilityProfile,
        responsiveness: responsivenessByUserId.get(post.author.id)!,
      },
      city: post.community.locality.city.name,
      locality: post.community.locality.name,
      category,
      title: post.title,
      description: post.description,
      priceLabel: formatCommunityAmount(
        category,
        post.monthlyAmountMin,
        post.monthlyAmountMax,
      ),
      monthlyAmountMin: post.monthlyAmountMin,
      monthlyAmountMax: post.monthlyAmountMax,
      securityDeposit: post.securityDeposit,
      maintenanceAmount: post.maintenanceAmount,
      moveInDate: formatMoveInDate(post.moveInDate),
      moveInDateValue: post.moveInDate?.toISOString().slice(0, 10) ?? null,
      tags: post.tags,
      postedAt: relativePostedAt(post.publishedAt ?? post.createdAt),
      availability,
      images: post.imagePaths.flatMap((path) => {
        const url = imageUrlMap.get(path);
        return url ? [{ path, url }] : [];
      }),
      listingDetails:
        category === "Room Available" || category === "PG Available"
          ? {
              furnishing: post.furnishingStatus
                ? furnishingLabels[post.furnishingStatus]
                : null,
              occupancy: formatListingOccupancy(
                category,
                post.availableSpots,
              ),
              deposit: formatListingMoney(post.securityDeposit),
              maintenance:
                post.maintenanceAmount === null
                  ? null
                  : `${formatListingMoney(post.maintenanceAmount)} / month`,
              preferredOccupant: post.preferredOccupant
                ? preferredOccupantLabels[post.preferredOccupant]
                : null,
              roomType:
                category === "Room Available"
                  ? `${post.bedrooms ?? 1}BHK · ${
                      post.tags.includes("Master bedroom")
                        ? "Master bedroom"
                        : roomTypeLabel(post.roomType)
                    }`
                  : roomTypeLabel(post.roomType),
              attachedBathroom:
                post.attachedBathroom === null
                  ? null
                  : post.attachedBathroom
                    ? "Yes"
                    : "No",
              parking: post.parkingType
                ? parkingLabels[post.parkingType]
                : null,
              amenities: post.amenities,
            }
          : null,
      listingLocation,
      commute,
      recommendation: null,
      verification: listingVerification,
      trust,
      reality: realityByPostId.get(post.id) ?? emptyListingRealityScore(),
      readiness,
      isOwner: post.author.authUserId === viewerAuthUserId,
      isSaved: savedPostIds.has(post.id),
      activityStage:
        activityStageByPostId.get(post.id) ??
        (savedPostIds.has(post.id) ? "SHORTLISTED" : null),
    }];
  });
}

export async function loadCommunityPostDetail(
  postId: string,
  viewerAuthUserId: string | null,
) {
  if (!postId || postId.length > 128) return null;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { communityId: true },
  });
  if (!post) return null;

  const posts = await loadCommunityPosts(
    viewerAuthUserId,
    post.communityId,
    {
      query: "",
      postType: null,
      budgetMin: null,
      budgetMax: null,
      moveInBy: "",
      genderPreference: null,
      maximumDistanceKm: null,
      sort: "recommended",
    },
    undefined,
    postId,
  );
  return posts[0] ?? null;
}

function communityPostWhere(
  communityId: CommunityScope,
  filters: CommunityPostFilters,
  blockedUserIds: string[],
  closedPostIds: string[],
  includePostType: boolean,
  bounds: CommuteBounds | null = null,
  closedOwnerAuthUserId: string | null = null,
  queryOptions?: CommunityPostQueryOptions,
): Prisma.PostWhereInput {
  const and: Prisma.PostWhereInput[] = [];

  and.push({
    OR: [
      { availabilityStatus: { in: ["AVAILABLE", "RESERVED"] } },
      ...(closedOwnerAuthUserId
        ? [{
            availabilityStatus: "CLOSED" as const,
            author: { authUserId: closedOwnerAuthUserId },
          }]
        : []),
    ],
  });

  if (filters.query) {
    and.push({
      OR: [
        { title: { contains: filters.query, mode: "insensitive" } },
        { description: { contains: filters.query, mode: "insensitive" } },
        { author: { name: { contains: filters.query, mode: "insensitive" } } },
        { community: { locality: { name: { contains: filters.query, mode: "insensitive" } } } },
        { community: { locality: { city: { name: { contains: filters.query, mode: "insensitive" } } } } },
      ],
    });
  }
  if (filters.budgetMin !== null || filters.budgetMax !== null) {
    const range = {
      ...(filters.budgetMin !== null ? { gte: filters.budgetMin } : {}),
      ...(filters.budgetMax !== null ? { lte: filters.budgetMax } : {}),
    };
    and.push({
      OR: [
        { monthlyAmountMin: range },
        { monthlyAmountMin: null, monthlyAmountMax: range },
      ],
    });
  }
  if (filters.moveInBy) {
    and.push({
      OR: [
        { moveInDate: null },
        { moveInDate: { lte: new Date(`${filters.moveInBy}T00:00:00.000Z`) } },
      ],
    });
  }
  if (filters.genderPreference) {
    and.push({
      genderPreference:
        filters.genderPreference === "ANY"
          ? "ANY"
          : { in: ["ANY", filters.genderPreference] },
    });
  }
  if (bounds) {
    and.push({
      type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] },
      latitude: { gte: bounds.latitudeMin, lte: bounds.latitudeMax },
      longitude: { gte: bounds.longitudeMin, lte: bounds.longitudeMax },
    });
  }

  if (queryOptions?.housingTypes?.length) {
    and.push({ type: { in: queryOptions.housingTypes } });
  }
  if (queryOptions?.furnishingStatus) {
    and.push({ furnishingStatus: queryOptions.furnishingStatus });
  }
  if (queryOptions?.roomTypes?.length) {
    and.push({ roomType: { in: queryOptions.roomTypes } });
  }

  const communityWhere =
    typeof communityId === "string"
      ? { communityId }
      : Array.isArray(communityId)
        ? { communityId: { in: [...communityId] } }
        : {};

  return {
    ...communityWhere,
    status: "ACTIVE",
    moderationStatus: "VISIBLE",
    publishedAt: { not: null },
    author: { moderationState: { isNot: { status: "SUSPENDED" } } },
    ...(includePostType && filters.postType ? { type: filters.postType } : {}),
    ...(blockedUserIds.length ? { authorId: { notIn: blockedUserIds } } : {}),
    ...(closedPostIds.length ? { id: { notIn: closedPostIds } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

async function loadCommunityPostTypeCounts(
  communityId: string,
  filters: CommunityPostFilters,
  blockedUserIds: string[],
  closedPostIds: string[],
  destination: PrivateCommuteDestination | null,
): Promise<CommunityPostTypeCounts> {
  const bounds =
    destination && filters.maximumDistanceKm
      ? commuteBounds(destination, filters.maximumDistanceKm)
      : null;
  if (bounds && filters.maximumDistanceKm && destination) {
    const candidates = await prisma.post.findMany({
      where: communityPostWhere(
        communityId,
        filters,
        blockedUserIds,
        closedPostIds,
        false,
        bounds,
      ),
      select: {
        type: true,
        latitude: true,
        longitude: true,
      },
      take: 500,
    });
    const counts: CommunityPostTypeCounts = {
      NEED_ROOM: 0,
      ROOM_AVAILABLE: 0,
      NEED_FLATMATE: 0,
      PG_AVAILABLE: 0,
    };
    for (const post of candidates) {
      if (
        post.latitude !== null &&
        post.longitude !== null &&
        distanceBetweenKm(
          destination,
          {
            latitude: Number(post.latitude),
            longitude: Number(post.longitude),
          },
        ) <= filters.maximumDistanceKm
      ) {
        counts[post.type] += 1;
      }
    }
    return counts;
  }

  const rows = await prisma.post.groupBy({
    by: ["type"],
    where: communityPostWhere(
      communityId,
      filters,
      blockedUserIds,
      closedPostIds,
      false,
    ),
    _count: { _all: true },
  });
  const counts: CommunityPostTypeCounts = {
    NEED_ROOM: 0,
    ROOM_AVAILABLE: 0,
    NEED_FLATMATE: 0,
    PG_AVAILABLE: 0,
  };
  for (const row of rows) counts[row.type] = row._count._all;
  return counts;
}

export async function loadCommunityRoom(
  citySlug: string,
  localitySlug: string,
  viewerAuthUserId: string | null,
  filters: CommunityPostFilters,
) {
  const community = await loadCommunityLocation(citySlug, localitySlug);
  if (!community) return null;

  const viewer = viewerAuthUserId
    ? await prisma.user.findUnique({
        where: { authUserId: viewerAuthUserId },
        select: {
          id: true,
          name: true,
          blocksCreated: { select: { blockedId: true } },
          savedPosts: { select: { postId: true } },
          interestsTracked: {
            where: { targetType: "LISTING" },
            select: { postId: true, stage: true },
          },
          documentSpacesAsParticipantOne: {
            where: { status: "CLOSED", targetType: "LISTING" },
            select: { postId: true, post: { select: { authorId: true } } },
          },
          documentSpacesAsParticipantTwo: {
            where: { status: "CLOSED", targetType: "LISTING" },
            select: { postId: true, post: { select: { authorId: true } } },
          },
          preferences: {
            select: {
              commuteDestination: true,
              commuteLatitude: true,
              commuteLongitude: true,
              preferredCommuteKm: true,
            },
          },
          memberships: {
            where: { communityId: community.id },
            select: { communityId: true, lastChatReadAt: true },
            take: 1,
          },
        },
      })
    : null;
  const blockedUserIds =
    viewer?.blocksCreated.map(({ blockedId }) => blockedId) ?? [];
  const savedPostIds = viewer?.savedPosts.map(({ postId }) => postId) ?? [];
  const closedPostIds = [
    ...(viewer?.documentSpacesAsParticipantOne ?? []),
    ...(viewer?.documentSpacesAsParticipantTwo ?? []),
  ].flatMap((space) =>
    space.postId && space.post?.authorId !== viewer?.id ? [space.postId] : [],
  );
  const destination = privateCommuteDestination(viewer?.preferences);
  const knownViewerState: KnownCommunityViewerState = {
    blockedUserIds,
    savedPostIds,
    closedPostIds,
    activityStages: viewer?.interestsTracked ?? [],
    commuteDestination: destination,
  };
  const [posts, postTypeCounts, localityPulse] = await Promise.all([
    loadCommunityPosts(
      viewerAuthUserId,
      community.id,
      filters,
      knownViewerState,
    ),
    loadCommunityPostTypeCounts(
      community.id,
      filters,
      blockedUserIds,
      closedPostIds,
      destination,
    ),
    loadLocalityPulse(community.id, community.localityId),
  ]);

  const membership = viewer?.memberships[0];
  const chatUnreadCount =
    viewer && membership
      ? await prisma.communityMessage.count({
          where: {
            communityId: community.id,
            moderationStatus: "VISIBLE",
            senderId: {
              notIn: [
                viewer.id,
                ...viewer.blocksCreated.map(({ blockedId }) => blockedId),
              ],
            },
            sender: {
              moderationState: { isNot: { status: "SUSPENDED" } },
            },
            ...(membership.lastChatReadAt
              ? { createdAt: { gt: membership.lastChatReadAt } }
              : {}),
          },
        })
      : 0;

  return {
    community,
    localityPulse,
    posts,
    postTypeCounts,
    isMember: Boolean(membership),
    chatIdentity:
      viewer && membership ? { id: viewer.id, name: viewer.name } : null,
    chatUnreadCount,
  };
}

function roomTypeLabel(value: "PRIVATE_ROOM" | "SHARED_ROOM" | "ENTIRE_PLACE" | null) {
  if (value === "PRIVATE_ROOM") return "Private room";
  if (value === "SHARED_ROOM") return "Shared room";
  return "Either works";
}

export async function loadEditableCommunityPost(
  postId: string,
  authUserId: string,
): Promise<CommunityPostFormInitial | null> {
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      status: "ACTIVE",
      moderationStatus: "VISIBLE",
      author: { authUserId },
    },
  });

  if (!post) return null;

  const images = await createListingImageUrls(post.imagePaths);

  const postType = DATABASE_TO_POST_TYPE[post.type];
  let housingType = "";
  let housingFeature = "";

  if (postType === "Need a Room") {
    housingType = roomTypeLabel(post.roomType);
    housingFeature =
      post.furnishingStatus === "FURNISHED"
        ? "Furnished"
        : post.furnishingStatus === "SEMI_FURNISHED"
          ? "Semi-furnished"
          : post.furnishingStatus === "UNFURNISHED"
            ? "Unfurnished"
            : "No preference";
  } else if (postType === "PG Available") {
    housingType =
      post.availableSpots === 1
        ? "Single occupancy"
        : post.availableSpots === 2
          ? "Twin sharing"
          : post.availableSpots === 3
            ? "Triple sharing"
            : "Multiple options";
    housingFeature =
      post.mealsIncluded === true
        ? "Included"
        : post.mealsIncluded === false
          ? "Not included"
          : "Optional meal plan";
  } else {
    housingType =
      post.bedrooms && post.bedrooms >= 4
        ? "4BHK or larger"
        : `${post.bedrooms ?? 1}BHK`;
    housingFeature = post.tags.includes("Master bedroom")
      ? "Master bedroom"
      : roomTypeLabel(post.roomType);
  }

  return {
    id: post.id,
    postType,
    communityId: post.communityId,
    title: post.title,
    amount: String(post.monthlyAmountMin ?? post.monthlyAmountMax ?? ""),
    moveInDate: post.moveInDate?.toISOString().slice(0, 10) ?? "",
    genderPreference: DATABASE_TO_GENDER[post.genderPreference],
    housingType,
    housingFeature,
    occupancy:
      postType === "Room Available"
        ? post.availableSpots === 1
          ? "Single occupancy"
          : post.availableSpots === 2
            ? "Double sharing"
            : post.availableSpots === 3
              ? "Triple sharing"
              : ""
        : "",
    furnishingStatus:
      postType === "Room Available" || postType === "PG Available"
        ? post.furnishingStatus
          ? furnishingLabels[post.furnishingStatus]
          : ""
        : "",
    securityDeposit: String(post.securityDeposit ?? ""),
    maintenanceAmount: String(post.maintenanceAmount ?? ""),
    amenities: post.amenities.join(", "),
    preferredOccupant: post.preferredOccupant
      ? post.preferredOccupant === "ANY"
        ? "Any"
        : preferredOccupantLabels[post.preferredOccupant]
      : "",
    attachedBathroom:
      post.attachedBathroom === null ? "" : post.attachedBathroom ? "Yes" : "No",
    parkingType: post.parkingType ? parkingLabels[post.parkingType] : "",
    locationLatitude: post.latitude?.toString() ?? "",
    locationLongitude: post.longitude?.toString() ?? "",
    locationPrecision:
      post.locationPrecision === "EXACT" ? "Exact" : "Approximate",
    description: post.description,
    tags: post.tags.join(", "),
    images,
  };
}
