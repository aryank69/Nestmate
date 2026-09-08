import "server-only";

import { parseComparisonSelection } from "@/lib/comparison";
import { loadCommunityPostDetail } from "@/lib/community-data";
import { prisma } from "@/lib/prisma";
import { loadUserProfile } from "@/lib/profile-data";
import { calculateListingRecommendation } from "@/lib/recommendations";
import type { ComparisonListing, ListingComparisonData } from "@/types/comparison";

export async function loadSearchTeamListingComparison(input: {
  teamId: string;
  userId: string;
  authUserId: string;
  selection: string | string[] | undefined;
}): Promise<ListingComparisonData | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.teamId)) {
    return null;
  }
  const member = await prisma.searchTeamMember.findUnique({
    where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
    select: { userId: true },
  });
  if (!member) return null;
  const parsed = parseComparisonSelection(input.selection);
  if (!parsed.ids.length) return { slots: [], selectionWasTrimmed: false, error: "" };

  const shared = await prisma.searchTeamListing.findMany({
    where: {
      teamId: input.teamId,
      postId: { in: parsed.ids },
      post: {
        type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] },
        status: "ACTIVE",
        moderationStatus: "VISIBLE",
        availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
        publishedAt: { not: null },
        author: {
          blocksCreated: { none: { blockedId: input.userId } },
          blocksReceived: { none: { blockerId: input.userId } },
          moderationState: { isNot: { status: "SUSPENDED" } },
        },
      },
    },
    select: { postId: true },
  });
  const sharedIds = new Set(shared.map(({ postId }) => postId));
  const visibleIds = parsed.ids.filter((id) => sharedIds.has(id));
  const [viewer, details] = await Promise.all([
    loadUserProfile(input.authUserId),
    Promise.all(visibleIds.map((id) => loadCommunityPostDetail(id, input.authUserId))),
  ]);
  const detailById = new Map(details.flatMap((post) => post ? [[post.id, post] as const] : []));

  return {
    selectionWasTrimmed: parsed.selectionWasTrimmed,
    error: "",
    slots: parsed.ids.map((id) => {
      const post = detailById.get(id);
      if (!sharedIds.has(id) || !post || !post.listingDetails || (post.category !== "Room Available" && post.category !== "PG Available")) {
        return { id, listing: null, unavailableReason: "This team listing is unavailable, blocked, closed, or no longer shared." };
      }
      const listing: ComparisonListing = {
        id: post.id,
        title: post.title,
        category: post.category,
        locality: post.locality,
        city: post.city,
        detailHref: `/community/post/${encodeURIComponent(post.id)}`,
        rent: { minimum: post.monthlyAmountMin, maximum: post.monthlyAmountMax, label: post.priceLabel },
        deposit: post.listingDetails.deposit,
        maintenance: post.listingDetails.maintenance,
        furnishing: post.listingDetails.furnishing,
        roomType: post.listingDetails.roomType,
        amenities: post.listingDetails.amenities,
        availabilityDate: post.moveInDate,
        availability: { status: post.availability.status, label: post.availability.label },
        commute: post.commute,
        recommendation: calculateListingRecommendation(post, viewer),
        freshness: { isStale: post.availability.isStale, ageDays: post.availability.ageDays, label: post.availability.freshnessLabel },
        verificationLabels: post.verification.badges.map(({ label }) => label),
      };
      return { id, listing, unavailableReason: null };
    }),
  };
}
