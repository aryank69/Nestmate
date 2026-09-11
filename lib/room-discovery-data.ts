import "server-only";

import {
  loadCommunityLocations,
  loadCommunityPosts,
  type CommunityPostQueryOptions,
} from "@/lib/community-data";
import { loadUserProfile } from "@/lib/profile-data";
import {
  calculateListingRecommendation,
  rankListingRecommendations,
} from "@/lib/recommendations";
import { filterRoomDiscoveryResults } from "@/lib/room-discovery";
import { roomRecoveryCandidates } from "@/lib/zero-result-recovery";
import type { CommunityLocationOption } from "@/types/community";
import type {
  CommunityPostFilters,
  RoomDiscoveryFilters,
  ZeroResultSuggestion,
} from "@/types/discovery";

function roomTypeScope(filters: RoomDiscoveryFilters) {
  const kindTypes =
    filters.kind === "FLAT_SHARED"
      ? (["SHARED_ROOM", "ENTIRE_PLACE"] as const)
      : null;
  if (!filters.roomType) return kindTypes ? [...kindTypes] : undefined;
  if (kindTypes && !kindTypes.includes(filters.roomType as (typeof kindTypes)[number])) {
    return [];
  }
  return [filters.roomType];
}
function queryOptions(filters: RoomDiscoveryFilters): CommunityPostQueryOptions {
  return {
    housingTypes:
      filters.kind === "PG_AVAILABLE"
        ? ["PG_AVAILABLE"]
        : filters.kind === "ROOM_AVAILABLE" || filters.kind === "FLAT_SHARED"
          ? ["ROOM_AVAILABLE"]
          : ["ROOM_AVAILABLE", "PG_AVAILABLE"],
    furnishingStatus: filters.furnishing,
    roomTypes: roomTypeScope(filters),
  };
}

type RoomViewer = Awaited<ReturnType<typeof loadUserProfile>> | null;

async function loadRoomDiscoveryMatches(
  viewerAuthUserId: string | null,
  filters: RoomDiscoveryFilters,
  locations: CommunityLocationOption[],
  viewer: RoomViewer,
) {
  const selectedLocality = filters.communityId
    ? locations.find((location) => location.id === filters.communityId)
    : null;
  const cityLocations = filters.citySlug
    ? locations.filter((location) => location.citySlug === filters.citySlug)
    : locations;
  const localityMatchesCity =
    !selectedLocality ||
    !filters.citySlug ||
    selectedLocality.citySlug === filters.citySlug;
  const scope = selectedLocality
    ? [selectedLocality.id]
    : filters.citySlug
      ? cityLocations.map((location) => location.id)
      : null;
  const types = roomTypeScope(filters);

  const baseFilters: CommunityPostFilters = {
    query: filters.query,
    postType: null,
    budgetMin: filters.budgetMin,
    budgetMax: filters.budgetMax,
    moveInBy: filters.moveInBy,
    genderPreference: null,
    maximumDistanceKm: filters.maximumDistanceKm,
    sort: filters.sort === "lowest-rent" ? "lowest-amount" : "newest",
  };

  const posts =
    localityMatchesCity && (types === undefined || types.length > 0)
      ? await loadCommunityPosts(
          viewerAuthUserId,
          scope,
          baseFilters,
          undefined,
          undefined,
          queryOptions(filters),
        )
      : [];

  const scored =
    filters.sort === "recommended"
      ? rankListingRecommendations(posts, viewer, true)
      : posts.map((post) => ({
          ...post,
          recommendation: viewer
            ? calculateListingRecommendation(post, viewer)
            : null,
        }));
  return filterRoomDiscoveryResults(scored, filters);
}

async function loadRoomRecoverySuggestions(
  viewerAuthUserId: string | null,
  filters: RoomDiscoveryFilters,
  locations: CommunityLocationOption[],
  viewer: RoomViewer,
) {
  const suggestions: ZeroResultSuggestion[] = [];
  let hasLocalitySuggestion = false;

  for (const candidate of roomRecoveryCandidates(filters, locations)) {
    if (candidate.id.startsWith("room-locality-") && hasLocalitySuggestion) {
      continue;
    }
    const matches = await loadRoomDiscoveryMatches(
      viewerAuthUserId,
      candidate.filters,
      locations,
      viewer,
    );
    if (!matches.length) continue;

    suggestions.push({
      id: candidate.id,
      title: candidate.title,
      description: candidate.description,
      href: candidate.href,
      relaxedCriteria: candidate.relaxedCriteria,
      resultCount: matches.length,
    });
    if (candidate.id.startsWith("room-locality-")) {
      hasLocalitySuggestion = true;
    }
    if (suggestions.length >= 5) break;
  }

  return suggestions;
}

export async function loadRoomDiscovery(
  viewerAuthUserId: string | null,
  filters: RoomDiscoveryFilters,
) {
  const [locations, viewer] = await Promise.all([
    loadCommunityLocations(),
    viewerAuthUserId ? loadUserProfile(viewerAuthUserId) : Promise.resolve(null),
  ]);
  const listings = await loadRoomDiscoveryMatches(
    viewerAuthUserId,
    filters,
    locations,
    viewer,
  );
  const recoverySuggestions = listings.length
    ? []
    : await loadRoomRecoverySuggestions(
        viewerAuthUserId,
        filters,
        locations,
        viewer,
      );
  const selectedLocality = filters.communityId
    ? locations.find((location) => location.id === filters.communityId)
    : null;

  return {
    listings,
    recoverySuggestions,
    locations,
    viewer,
    selectedLocality,
  };
}
