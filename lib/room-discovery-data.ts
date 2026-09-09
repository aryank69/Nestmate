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
import type { CommunityPostFilters, RoomDiscoveryFilters } from "@/types/discovery";

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

export async function loadRoomDiscovery(
  viewerAuthUserId: string | null,
  filters: RoomDiscoveryFilters,
) {
  const locations = await loadCommunityLocations();
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

  const [posts, viewer] = await Promise.all([
    localityMatchesCity && (types === undefined || types.length > 0)
      ? loadCommunityPosts(
          viewerAuthUserId,
          scope,
          baseFilters,
          undefined,
          undefined,
          queryOptions(filters),
        )
      : Promise.resolve([]),
    viewerAuthUserId ? loadUserProfile(viewerAuthUserId) : Promise.resolve(null),
  ]);

  const scored =
    filters.sort === "recommended"
      ? rankListingRecommendations(posts, viewer, true)
      : posts.map((post) => ({
          ...post,
          recommendation: viewer
            ? calculateListingRecommendation(post, viewer)
            : null,
        }));
  const listings = filterRoomDiscoveryResults(scored, filters);

  return {
    listings,
    locations,
    viewer,
    selectedLocality,
  };
}
