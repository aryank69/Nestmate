import "server-only";

import { prisma } from "@/lib/prisma";
import {
  communityInitials,
  DATABASE_TO_GENDER,
  DATABASE_TO_POST_TYPE,
  formatCommunityAmount,
} from "@/lib/community";
import type { CompatibilityProfile } from "@/types/compatibility";
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

function profileValue<T extends string>(
  map: Record<T, string>,
  value: T | null,
) {
  return value ? map[value] : null;
}

export async function loadCommunityPosts(
  viewerAuthUserId: string | null,
  communityId: string,
): Promise<CommunityPost[]> {
  const posts = await prisma.post.findMany({
    where: {
      communityId,
      status: "ACTIVE",
      publishedAt: { not: null },
    },
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      monthlyAmountMin: true,
      monthlyAmountMax: true,
      moveInDate: true,
      tags: true,
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
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: 100,
  });

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
      isOwner: post.author.authUserId === viewerAuthUserId,
    };
  });
}

export async function loadCommunityRoom(
  citySlug: string,
  localitySlug: string,
  viewerAuthUserId: string | null,
) {
  const community = await loadCommunityLocation(citySlug, localitySlug);
  if (!community) return null;

  const [posts, viewer] = await Promise.all([
    loadCommunityPosts(viewerAuthUserId, community.id),
    viewerAuthUserId
      ? prisma.user.findUnique({
          where: { authUserId: viewerAuthUserId },
          select: {
            id: true,
            name: true,
            memberships: {
              where: { communityId: community.id },
              select: { communityId: true, lastChatReadAt: true },
              take: 1,
            },
          },
        })
      : null,
  ]);

  const membership = viewer?.memberships[0];
  const chatUnreadCount =
    viewer && membership
      ? await prisma.communityMessage.count({
          where: {
            communityId: community.id,
            senderId: { not: viewer.id },
            ...(membership.lastChatReadAt
              ? { createdAt: { gt: membership.lastChatReadAt } }
              : {}),
          },
        })
      : 0;

  return {
    community,
    posts,
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
    description: post.description,
    tags: post.tags.join(", "),
  };
}
