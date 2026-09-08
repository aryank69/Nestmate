import "server-only";

import { parseComparisonSelection } from "@/lib/comparison";
import { loadCommunityPostDetail } from "@/lib/community-data";
import { prisma } from "@/lib/prisma";
import { loadUserProfile } from "@/lib/profile-data";
import { calculateListingRecommendation } from "@/lib/recommendations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ComparisonListing,
  ListingComparisonData,
} from "@/types/comparison";

type ComparisonSearchValue = string | string[] | undefined;

export async function loadListingComparison(input: {
  userId: string;
  authUserId: string;
  selection: ComparisonSearchValue;
}): Promise<ListingComparisonData> {
  const parsed = parseComparisonSelection(input.selection);
  if (!parsed.ids.length) {
    return { slots: [], selectionWasTrimmed: false, error: "" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: savedRows, error: savedError } = await supabase
    .from("SavedPost")
    .select("postId")
    .eq("userId", input.userId)
    .in("postId", parsed.ids);

  if (savedError) {
    console.error("[comparison:saved] Saved listing check failed", {
      code: savedError.code,
      message: savedError.message,
    });
    return {
      slots: parsed.ids.map((id) => ({
        id,
        listing: null,
        unavailableReason: "We could not verify this saved listing.",
      })),
      selectionWasTrimmed: parsed.selectionWasTrimmed,
      error: "We could not load your saved listings. Refresh and try again.",
    };
  }

  const savedIds = new Set((savedRows ?? []).map((row) => row.postId as string));
  const candidates = await prisma.post.findMany({
    where: {
      id: { in: parsed.ids.filter((id) => savedIds.has(id)) },
      type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] },
      status: "ACTIVE",
      moderationStatus: "VISIBLE",
      publishedAt: { not: null },
      author: {
        blocksCreated: { none: { blockedId: input.userId } },
        blocksReceived: { none: { blockerId: input.userId } },
        moderationState: { isNot: { status: "SUSPENDED" } },
      },
    },
    select: { id: true, availabilityStatus: true },
  });
  const candidateById = new Map(candidates.map((post) => [post.id, post]));
  const comparableIds = parsed.ids.filter((id) => {
    const candidate = candidateById.get(id);
    return Boolean(candidate && candidate.availabilityStatus !== "CLOSED");
  });

  const [viewer, details] = await Promise.all([
    loadUserProfile(input.authUserId),
    Promise.all(
      comparableIds.map((id) => loadCommunityPostDetail(id, input.authUserId)),
    ),
  ]);
  const detailById = new Map(
    details.flatMap((post) => (post ? [[post.id, post] as const] : [])),
  );

  const slots = parsed.ids.map((id) => {
    if (!savedIds.has(id)) {
      return {
        id,
        listing: null,
        unavailableReason: "This listing is no longer saved or available.",
      };
    }
    const candidate = candidateById.get(id);
    if (!candidate) {
      return {
        id,
        listing: null,
        unavailableReason:
          "This listing is unavailable, was removed, or can no longer be shown to you.",
      };
    }
    if (candidate.availabilityStatus === "CLOSED") {
      return {
        id,
        listing: null,
        unavailableReason: "The owner has closed this listing.",
      };
    }

    const post = detailById.get(id);
    if (
      !post ||
      (post.category !== "Room Available" && post.category !== "PG Available") ||
      !post.listingDetails
    ) {
      return {
        id,
        listing: null,
        unavailableReason: "This listing can no longer be compared.",
      };
    }

    const recommendation = calculateListingRecommendation(post, viewer);
    const listing: ComparisonListing = {
      id: post.id,
      title: post.title,
      category: post.category,
      locality: post.locality,
      city: post.city,
      detailHref: `/community/post/${encodeURIComponent(post.id)}`,
      rent: {
        minimum: post.monthlyAmountMin,
        maximum: post.monthlyAmountMax,
        label: post.priceLabel,
      },
      deposit: post.listingDetails.deposit,
      maintenance: post.listingDetails.maintenance,
      furnishing: post.listingDetails.furnishing,
      roomType: post.listingDetails.roomType,
      amenities: post.listingDetails.amenities,
      availabilityDate: post.moveInDate,
      availability: {
        status: post.availability.status,
        label: post.availability.label,
      },
      commute: post.commute,
      recommendation,
      freshness: {
        isStale: post.availability.isStale,
        ageDays: post.availability.ageDays,
        label: post.availability.freshnessLabel,
      },
      verificationLabels: post.verification.badges.map((badge) => badge.label),
    };
    return { id, listing, unavailableReason: null };
  });

  return {
    slots,
    selectionWasTrimmed: parsed.selectionWasTrimmed,
    error: "",
  };
}
