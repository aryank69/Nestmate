import { peopleFilterQuery } from "@/lib/discovery";
import { roomDiscoveryQuery } from "@/lib/room-discovery";
import type { CommunityLocationOption } from "@/types/community";
import type {
  PeopleFilters,
  PeopleRecoveryCandidate,
  RoomDiscoveryFilters,
  RoomRecoveryCandidate,
} from "@/types/discovery";

const MAX_MONEY = 10_000_000;
const MAX_COMMUTE_KM = 100;

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function roomHref(filters: RoomDiscoveryFilters) {
  const query = roomDiscoveryQuery(filters);
  return "/rooms" + (query ? "?" + query : "");
}

function peopleHref(filters: PeopleFilters) {
  const query = peopleFilterQuery(filters);
  return "/flatmates" + (query ? "?" + query : "");
}

function laterDate(value: string, days: number) {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value + "T00:00:00.000Z"));
}

function widenedBudget(minimum: number | null, maximum: number | null) {
  if (minimum === null && maximum === null) return null;
  const reference = maximum ?? minimum ?? 0;
  const change = Math.max(2_000, Math.ceil(reference * 0.15 / 500) * 500);
  const nextMinimum =
    minimum === null ? null : Math.max(0, minimum - change);
  const nextMaximum =
    maximum === null ? null : Math.min(MAX_MONEY, maximum + change);
  if (nextMinimum === minimum && nextMaximum === maximum) return null;
  return { minimum: nextMinimum, maximum: nextMaximum };
}

function budgetRangeLabel(minimum: number | null, maximum: number | null) {
  if (minimum !== null && maximum !== null) {
    return money(minimum) + "–" + money(maximum);
  }
  if (minimum !== null) return money(minimum) + "+";
  if (maximum !== null) return "Up to " + money(maximum);
  return "Any budget";
}

function roomNearbyCandidates(
  filters: RoomDiscoveryFilters,
  locations: CommunityLocationOption[],
): RoomRecoveryCandidate[] {
  if (!filters.communityId) return [];
  const selected = locations.find(({ id }) => id === filters.communityId);
  if (!selected) return [];
  if (filters.citySlug && filters.citySlug !== selected.citySlug) return [];

  return locations
    .filter(
      (location) =>
        location.id !== selected.id &&
        location.citySlug === selected.citySlug,
    )
    .slice(0, 3)
    .map((location) => {
      const relaxed = {
        ...filters,
        citySlug: location.citySlug,
        communityId: location.id,
      };
      return {
        id: "room-locality-" + location.id,
        title: "Try " + location.locality,
        description:
          "Explore another locality in " + location.city + " while keeping your other filters.",
        href: roomHref(relaxed),
        relaxedCriteria: [
          "Locality: " + selected.locality + " → " + location.locality,
        ],
        filters: relaxed,
      };
    });
}

export function roomRecoveryCandidates(
  filters: RoomDiscoveryFilters,
  locations: CommunityLocationOption[],
): RoomRecoveryCandidate[] {
  const candidates: RoomRecoveryCandidate[] = [
    ...roomNearbyCandidates(filters, locations),
  ];
  const budget = widenedBudget(filters.budgetMin, filters.budgetMax);

  if (budget) {
    const relaxed = {
      ...filters,
      budgetMin: budget.minimum,
      budgetMax: budget.maximum,
    };
    candidates.push({
      id: "room-budget",
      title: "Widen the budget slightly",
      description: "Keep the same place and preferences with a modestly broader monthly range.",
      href: roomHref(relaxed),
      relaxedCriteria: [
        "Budget: " +
          budgetRangeLabel(filters.budgetMin, filters.budgetMax) +
          " → " +
          budgetRangeLabel(budget.minimum, budget.maximum),
      ],
      filters: relaxed,
    });
  }

  if (
    filters.maximumDistanceKm !== null &&
    filters.maximumDistanceKm < MAX_COMMUTE_KM
  ) {
    const distance = Math.min(
      MAX_COMMUTE_KM,
      Math.max(filters.maximumDistanceKm + 5, Math.ceil(filters.maximumDistanceKm * 1.5)),
    );
    const relaxed = { ...filters, maximumDistanceKm: distance };
    candidates.push({
      id: "room-commute",
      title: "Expand the commute range",
      description: "Look a little farther away without changing your other requirements.",
      href: roomHref(relaxed),
      relaxedCriteria: [
        "Maximum commute: " + filters.maximumDistanceKm + " km → " + distance + " km",
      ],
      filters: relaxed,
    });
  }

  if (filters.moveInBy) {
    const moveInBy = laterDate(filters.moveInBy, 14);
    const relaxed = { ...filters, moveInBy };
    candidates.push({
      id: "room-move-in",
      title: "Try a later move-in window",
      description: "Include homes becoming available during the following two weeks.",
      href: roomHref(relaxed),
      relaxedCriteria: [
        "Move-in by: " + dateLabel(filters.moveInBy) + " → " + dateLabel(moveInBy),
      ],
      filters: relaxed,
    });
  }

  if (filters.minimumLivingFit !== null && filters.minimumLivingFit > 0) {
    const score = Math.max(0, filters.minimumLivingFit - 10);
    const relaxed = { ...filters, minimumLivingFit: score };
    candidates.push({
      id: "room-living-fit",
      title: "See close Living Fit matches",
      description: "Include homes just below your threshold while keeping every practical filter.",
      href: roomHref(relaxed),
      relaxedCriteria: [
        "Minimum Living Fit: " + filters.minimumLivingFit + "% → " + score + "%",
      ],
      filters: relaxed,
    });
  }

  if (
    filters.furnishing ||
    filters.roomType ||
    filters.amenities.length ||
    filters.minimumRealityScore !== null ||
    filters.minimumReadiness !== null
  ) {
    const relaxed = {
      ...filters,
      furnishing: null,
      roomType: null,
      amenities: [],
      minimumRealityScore: null,
      minimumReadiness: null,
    };
    candidates.push({
      id: "room-details",
      title: "Broaden property details",
      description: "Keep locality, budget, commute, timing, and Living Fit while making home details flexible.",
      href: roomHref(relaxed),
      relaxedCriteria: ["Furnishing, room details, amenities, and listing-signal thresholds"],
      filters: relaxed,
    });
  }

  if (filters.query) {
    const relaxed = { ...filters, query: "" };
    candidates.push({
      id: "room-search",
      title: "Search beyond those words",
      description: "Keep every structured filter and remove only the typed search phrase.",
      href: roomHref(relaxed),
      relaxedCriteria: ["Search phrase: “" + filters.query + "” → Any wording"],
      filters: relaxed,
    });
  }

  return candidates;
}

function peopleNearbyCandidates(
  filters: PeopleFilters,
  locations: CommunityLocationOption[],
): PeopleRecoveryCandidate[] {
  if (!filters.localityId) return [];
  const selected = locations.find(
    (location) =>
      location.localityId === filters.localityId ||
      location.id === filters.localityId,
  );
  if (!selected) return [];

  return locations
    .filter(
      (location) =>
        location.localityId !== selected.localityId &&
        location.citySlug === selected.citySlug,
    )
    .slice(0, 3)
    .map((location) => {
      const relaxed = { ...filters, localityId: location.localityId };
      return {
        id: "people-locality-" + location.localityId,
        title: "Try " + location.locality,
        description:
          "Meet people considering another locality in " + location.city + ".",
        href: peopleHref(relaxed),
        relaxedCriteria: [
          "Locality: " + selected.locality + " → " + location.locality,
        ],
        filters: relaxed,
      };
    });
}

export function peopleRecoveryCandidates(
  filters: PeopleFilters,
  locations: CommunityLocationOption[],
): PeopleRecoveryCandidate[] {
  const candidates: PeopleRecoveryCandidate[] = [
    ...peopleNearbyCandidates(filters, locations),
  ];
  const budget = widenedBudget(filters.budgetMin, filters.budgetMax);

  if (budget) {
    const relaxed = {
      ...filters,
      budgetMin: budget.minimum,
      budgetMax: budget.maximum,
    };
    candidates.push({
      id: "people-budget",
      title: "Widen the budget overlap",
      description: "Include people whose preferred budget is just outside your current range.",
      href: peopleHref(relaxed),
      relaxedCriteria: [
        "Budget: " +
          budgetRangeLabel(filters.budgetMin, filters.budgetMax) +
          " → " +
          budgetRangeLabel(budget.minimum, budget.maximum),
      ],
      filters: relaxed,
    });
  }

  if (
    filters.preferredCommuteKm !== null &&
    filters.preferredCommuteKm < MAX_COMMUTE_KM
  ) {
    const commute = Math.min(
      MAX_COMMUTE_KM,
      Math.max(filters.preferredCommuteKm + 5, Math.ceil(filters.preferredCommuteKm * 1.5)),
    );
    const relaxed = { ...filters, preferredCommuteKm: commute };
    candidates.push({
      id: "people-commute",
      title: "Widen the commute preference",
      description: "Include people comfortable with a slightly broader commute range.",
      href: peopleHref(relaxed),
      relaxedCriteria: [
        "Commute range: " + filters.preferredCommuteKm + " km → " + commute + " km",
      ],
      filters: relaxed,
    });
  }

  if (filters.moveInBy) {
    const moveInBy = laterDate(filters.moveInBy, 14);
    const relaxed = { ...filters, moveInBy };
    candidates.push({
      id: "people-move-in",
      title: "Try a later move-in window",
      description: "Include people planning to move during the following two weeks.",
      href: peopleHref(relaxed),
      relaxedCriteria: [
        "Move-in by: " + dateLabel(filters.moveInBy) + " → " + dateLabel(moveInBy),
      ],
      filters: relaxed,
    });
  }

  if (
    filters.minimumCompatibility !== null &&
    filters.minimumCompatibility > 0
  ) {
    const score = Math.max(0, filters.minimumCompatibility - 10);
    const relaxed = { ...filters, minimumCompatibility: score };
    candidates.push({
      id: "people-living-fit",
      title: "See close Living Fit matches",
      description: "Include people just below your match threshold without changing other filters.",
      href: peopleHref(relaxed),
      relaxedCriteria: [
        "Minimum match: " + filters.minimumCompatibility + "% → " + score + "%",
      ],
      filters: relaxed,
    });
  }

  const lifestyleCount = [
    filters.diet,
    filters.smoking,
    filters.drinking,
    filters.sleepSchedule,
    filters.cleanliness,
    filters.pets,
    filters.occupationStatus,
  ].filter(Boolean).length;
  if (lifestyleCount) {
    const relaxed = {
      ...filters,
      diet: null,
      smoking: null,
      drinking: null,
      sleepSchedule: null,
      cleanliness: null,
      pets: null,
      occupationStatus: null,
    };
    candidates.push({
      id: "people-lifestyle",
      title: "Compare close lifestyle matches",
      description: "Keep locality, budget, timing, commute, and match threshold while broadening lifestyle choices.",
      href: peopleHref(relaxed),
      relaxedCriteria: [
        lifestyleCount +
          " lifestyle preference" +
          (lifestyleCount === 1 ? "" : "s"),
      ],
      filters: relaxed,
    });
  }

  if (filters.query) {
    const relaxed = { ...filters, query: "" };
    candidates.push({
      id: "people-search",
      title: "Search beyond those words",
      description: "Keep every structured filter and remove only the name or profession phrase.",
      href: peopleHref(relaxed),
      relaxedCriteria: ["Search phrase: “" + filters.query + "” → Any wording"],
      filters: relaxed,
    });
  }

  return candidates;
}
