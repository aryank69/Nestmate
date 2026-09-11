import { parseRequirementTags } from "@/lib/community";
import type {
  PostMatchFilters,
  PostMatchSource,
} from "@/types/post-matches";

function matchableRoomKind(source: PostMatchSource) {
  if (source.propertyType === "PG") return "PG_AVAILABLE" as const;
  if (
    source.roomType === "SHARED_ROOM" ||
    source.roomType === "ENTIRE_PLACE"
  ) {
    return "FLAT_SHARED" as const;
  }
  if (source.roomType === "PRIVATE_ROOM") return "ROOM_AVAILABLE" as const;
  return "ALL" as const;
}

export function postMatchFilters(
  source: PostMatchSource,
): PostMatchFilters {
  const requirementDetails = parseRequirementTags(source.tags);
  const preferredCommuteKm = requirementDetails.preferredCommuteKm
    ? Number(requirementDetails.preferredCommuteKm)
    : null;
  const isRoomRequirement = source.type === "NEED_ROOM";
  const sourceAmount =
    source.monthlyAmountMin ?? source.monthlyAmountMax ?? null;

  return {
    room: isRoomRequirement
      ? {
          query: "",
          citySlug: source.citySlug,
          communityId: source.communityId,
          kind: matchableRoomKind(source),
          budgetMin: source.monthlyAmountMin,
          budgetMax: source.monthlyAmountMax,
          moveInBy: source.moveInDate,
          furnishing: source.furnishingStatus,
          roomType:
            source.propertyType === "PG" ? null : source.roomType,
          amenities: [],
          maximumDistanceKm: preferredCommuteKm,
          minimumLivingFit: null,
          minimumRealityScore: null,
          minimumReadiness: null,
          sort: "recommended",
        }
      : null,
    people: {
      query: "",
      localityId: source.localityId,
      budgetMin:
        source.type === "ROOM_AVAILABLE" || source.type === "PG_AVAILABLE"
          ? sourceAmount
          : source.monthlyAmountMin,
      budgetMax:
        source.type === "ROOM_AVAILABLE" || source.type === "PG_AVAILABLE"
          ? sourceAmount
          : source.monthlyAmountMax,
      moveInBy: source.moveInDate,
      diet: null,
      smoking: null,
      drinking: null,
      sleepSchedule: null,
      cleanliness: null,
      pets: null,
      occupationStatus: null,
      minimumCompatibility: null,
      preferredCommuteKm,
      sort: "recommended",
    },
    seekerTypes:
      source.type === "NEED_ROOM"
        ? ["NEED_ROOM", "NEED_FLATMATE"]
        : ["NEED_ROOM"],
  };
}

export function postMatchHeading(type: PostMatchSource["type"]) {
  if (type === "ROOM_AVAILABLE" || type === "PG_AVAILABLE") {
    return {
      eyebrow: "Potential seekers",
      title: "People whose housing needs fit your listing",
      description:
        "Ranked using their published requirement and the preferences both of you chose to share.",
    };
  }
  if (type === "NEED_FLATMATE") {
    return {
      eyebrow: "Potential flatmates",
      title: "People who may fit your home and routine",
      description:
        "Compatibility remains transparent and uses the preferences already available in Roomzi.",
    };
  }
  return {
    eyebrow: "Matches for your requirement",
    title: "Homes and people worth considering",
    description:
      "These results respect the locality, budget, timing, commute, and place type you just published.",
  };
}
