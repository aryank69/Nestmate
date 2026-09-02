import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  communityInitials,
  DATABASE_TO_GENDER,
  DATABASE_TO_POST_TYPE,
  formatCommunityAmount,
} from "@/lib/community";
import {
  createListingImageUrlMap,
  createListingImageUrls,
} from "@/lib/listing-images.server";
import type { CompatibilityProfile } from "@/types/compatibility";
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
            where: { status: "ACTIVE", publishedAt: { not: null } },
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
            where: { status: "ACTIVE", publishedAt: { not: null } },
          },
        },
      },
    },
  });

  if (!community) return null;

  return {
    id: community.id,
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

function occupancyLabel(
  category: CommunityPost["category"],
  roomType: "PRIVATE_ROOM" | "SHARED_ROOM" | "ENTIRE_PLACE" | null,
  availableSpots: number | null,
) {
  if (category === "PG Available") {
    if (availableSpots === 1) return "Single occupancy";
    if (availableSpots === 2) return "Twin sharing";
    if (availableSpots === 3) return "Triple sharing";
    return availableSpots ? `${availableSpots} sharing` : "Multiple options";
  }
  return roomTypeLabel(roomType);
}

function profileValue<T extends string>(
  map: Record<T, string>,
  value: T | null,
) {
  return value ? map[value] : null;
}

export async function loadCommunityPosts(
  viewerAuthUserId: string | null,
  communityId: string,
  filters: CommunityPostFilters,
  knownBlockedUserIds?: string[],
  knownSavedPostIds?: string[],
  requestedPostId?: string,
): Promise<CommunityPost[]> {
  const viewerState =
    viewerAuthUserId &&
    (knownBlockedUserIds === undefined || knownSavedPostIds === undefined)
      ? await prisma.user.findUnique({
          where: { authUserId: viewerAuthUserId },
          select: {
            blocksCreated: { select: { blockedId: true } },
            savedPosts: { select: { postId: true } },
          },
        })
      : null;
  const blockedUserIds =
    knownBlockedUserIds ??
    viewerState?.blocksCreated.map(({ blockedId }) => blockedId) ??
    [];
  const savedPostIds = new Set(
    knownSavedPostIds ?? viewerState?.savedPosts.map(({ postId }) => postId) ?? [],
  );

  const where = communityPostWhere(
    communityId,
    filters,
    blockedUserIds,
    true,
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
      roomType: true,
      bedrooms: true,
      availableSpots: true,
      mealsIncluded: true,
      amenities: true,
      tags: true,
      imagePaths: true,
      publishedAt: true,
      createdAt: true,
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

  return posts.map((post) => {
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

    return {
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
        compatibilityProfile,
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
      moveInDate: formatMoveInDate(post.moveInDate),
      tags: post.tags,
      postedAt: relativePostedAt(post.publishedAt ?? post.createdAt),
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
              occupancy: occupancyLabel(
                category,
                post.roomType,
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
      isOwner: post.author.authUserId === viewerAuthUserId,
      isSaved: savedPostIds.has(post.id),
    };
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
      sort: "newest",
    },
    undefined,
    undefined,
    postId,
  );
  return posts[0] ?? null;
}

function communityPostWhere(
  communityId: string,
  filters: CommunityPostFilters,
  blockedUserIds: string[],
  includePostType: boolean,
): Prisma.PostWhereInput {
  const and: Prisma.PostWhereInput[] = [];

  if (filters.query) {
    and.push({
      OR: [
        { title: { contains: filters.query, mode: "insensitive" } },
        { description: { contains: filters.query, mode: "insensitive" } },
        { author: { name: { contains: filters.query, mode: "insensitive" } } },
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

  return {
    communityId,
    status: "ACTIVE",
    publishedAt: { not: null },
    ...(includePostType && filters.postType ? { type: filters.postType } : {}),
    ...(blockedUserIds.length ? { authorId: { notIn: blockedUserIds } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

async function loadCommunityPostTypeCounts(
  communityId: string,
  filters: CommunityPostFilters,
  blockedUserIds: string[],
): Promise<CommunityPostTypeCounts> {
  const rows = await prisma.post.groupBy({
    by: ["type"],
    where: communityPostWhere(communityId, filters, blockedUserIds, false),
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
  const [posts, postTypeCounts] = await Promise.all([
    loadCommunityPosts(
      viewerAuthUserId,
      community.id,
      filters,
      blockedUserIds,
      savedPostIds,
    ),
    loadCommunityPostTypeCounts(community.id, filters, blockedUserIds),
  ]);

  const membership = viewer?.memberships[0];
  const chatUnreadCount =
    viewer && membership
      ? await prisma.communityMessage.count({
          where: {
            communityId: community.id,
            senderId: {
              notIn: [
                viewer.id,
                ...viewer.blocksCreated.map(({ blockedId }) => blockedId),
              ],
            },
            ...(membership.lastChatReadAt
              ? { createdAt: { gt: membership.lastChatReadAt } }
              : {}),
          },
        })
      : 0;

  return {
    community,
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
    description: post.description,
    tags: post.tags.join(", "),
    images,
  };
}
