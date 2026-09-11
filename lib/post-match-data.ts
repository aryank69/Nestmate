import "server-only";

import { peopleFilterQuery } from "@/lib/discovery";
import { loadPeopleDiscovery } from "@/lib/people-data";
import { postMatchFilters } from "@/lib/post-match";
import { prisma } from "@/lib/prisma";
import { roomDiscoveryQuery } from "@/lib/room-discovery";
import { loadRoomDiscovery } from "@/lib/room-discovery-data";
import type { PostMatchData, PostMatchSource } from "@/types/post-matches";

export async function loadPostMatches(
  authUserId: string,
  postId: string,
): Promise<PostMatchData | null> {
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      status: "ACTIVE",
      availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
      moderationStatus: "VISIBLE",
      publishedAt: { not: null },
      author: { authUserId },
      community: { isActive: true },
    },
    select: {
      id: true,
      type: true,
      title: true,
      communityId: true,
      monthlyAmountMin: true,
      monthlyAmountMax: true,
      moveInDate: true,
      furnishingStatus: true,
      propertyType: true,
      roomType: true,
      tags: true,
      community: {
        select: {
          locality: {
            select: {
              id: true,
              name: true,
              slug: true,
              city: { select: { name: true, slug: true } },
            },
          },
        },
      },
    },
  });

  if (!post) return null;

  const source: PostMatchSource = {
    id: post.id,
    type: post.type,
    title: post.title,
    communityId: post.communityId,
    localityId: post.community.locality.id,
    locality: post.community.locality.name,
    localitySlug: post.community.locality.slug,
    city: post.community.locality.city.name,
    citySlug: post.community.locality.city.slug,
    monthlyAmountMin: post.monthlyAmountMin,
    monthlyAmountMax: post.monthlyAmountMax,
    moveInDate: post.moveInDate?.toISOString().slice(0, 10) ?? "",
    furnishingStatus: post.furnishingStatus,
    propertyType: post.propertyType,
    roomType: post.roomType,
    tags: post.tags,
  };
  const filters = postMatchFilters(source);

  const [roomDiscovery, people] = await Promise.all([
    filters.room
      ? loadRoomDiscovery(authUserId, filters.room)
      : Promise.resolve(null),
    loadPeopleDiscovery(authUserId, filters.people, undefined, {
      requirementTypes: filters.seekerTypes,
      requirementCommunityId: source.communityId,
    }),
  ]);
  const roomQuery = filters.room ? roomDiscoveryQuery(filters.room) : "";
  const peopleQuery = peopleFilterQuery(filters.people);
  const listingMatchCount = roomDiscovery?.listings.length ?? 0;
  const peopleMatchCount = people.length;

  return {
    source,
    listings: roomDiscovery?.listings.slice(0, 6) ?? [],
    people: people.slice(0, 6),
    matchCounts: {
      listings: listingMatchCount,
      people: peopleMatchCount,
      total: listingMatchCount + peopleMatchCount,
    },
    roomFilters: filters.room,
    peopleFilters: filters.people,
    roomsHref: filters.room ? `/rooms${roomQuery ? `?${roomQuery}` : ""}` : null,
    peopleHref: `/flatmates${peopleQuery ? `?${peopleQuery}` : ""}`,
  };
}
