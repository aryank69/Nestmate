import {
  COMMUNITY_POST_TYPE_OPTIONS,
  communityFilterQuery,
  parseCommunityPostFilters,
  parsePeopleFilters,
  peopleFilterQuery,
} from "@/lib/discovery";
import type { SearchParamRecord } from "@/types/discovery";
import type { SavedSearchInput, SavedSearchKind } from "@/types/saved";

export const MAX_SAVED_SEARCH_NAME_LENGTH = 80;
export const MAX_SAVED_SEARCH_HREF_LENGTH = 500;

const postTypeLabels = new Map<string, string>(
  COMMUNITY_POST_TYPE_OPTIONS.map(({ value, label }) => [value, label]),
);

function paramsRecord(searchParams: URLSearchParams): SearchParamRecord {
  return Object.fromEntries(searchParams.entries());
}

function safeLocalPath(kind: SavedSearchKind, value: string) {
  if (!value || value.length > MAX_SAVED_SEARCH_HREF_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(value, "https://roomzi.local");
  } catch {
    return null;
  }

  if (url.origin !== "https://roomzi.local") return null;
  if (kind === "PEOPLE" && url.pathname !== "/flatmates") return null;
  if (
    kind === "COMMUNITY_POSTS" &&
    !/^\/community\/[^/]+\/[^/]+$/.test(url.pathname)
  ) {
    return null;
  }

  return url;
}

export function validateSavedSearchInput(input: SavedSearchInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_SAVED_SEARCH_NAME_LENGTH) {
    return {
      success: false as const,
      message: "Name the search using 1 to 80 characters.",
    };
  }
  if (input.kind !== "COMMUNITY_POSTS" && input.kind !== "PEOPLE") {
    return { success: false as const, message: "Choose a valid search type." };
  }

  const url = safeLocalPath(input.kind, input.href);
  if (!url) {
    return { success: false as const, message: "That search link is invalid." };
  }

  if (input.kind === "COMMUNITY_POSTS") {
    const filters = parseCommunityPostFilters(paramsRecord(url.searchParams));
    const query = communityFilterQuery(filters, filters.postType);
    return {
      success: true as const,
      data: {
        name,
        kind: input.kind,
        path: `${url.pathname}${query ? `?${query}` : ""}`,
        filters: { version: 1, ...filters },
      },
    };
  }

  const filters = parsePeopleFilters(paramsRecord(url.searchParams));
  const query = peopleFilterQuery(filters);
  return {
    success: true as const,
    data: {
      name,
      kind: input.kind,
      path: `/flatmates${query ? `?${query}` : ""}`,
      filters: { version: 1, ...filters },
    },
  };
}

function objectValue(value: unknown, key: string) {
  return value && typeof value === "object" && key in value
    ? (value as Record<string, unknown>)[key]
    : null;
}

function stringValue(value: unknown, key: string) {
  const candidate = objectValue(value, key);
  return typeof candidate === "string" && candidate ? candidate : null;
}

function numberValue(value: unknown, key: string) {
  const candidate = objectValue(value, key);
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : null;
}

const enumLabels: Record<string, string> = {
  WOMEN: "Women welcome",
  MEN: "Men welcome",
  ANY: "Any gender",
  VEGETARIAN: "Vegetarian",
  NON_VEGETARIAN: "Non-vegetarian",
  EGGETARIAN: "Eggetarian",
  VEGAN: "Vegan",
  NEVER: "Never",
  OCCASIONALLY: "Occasionally",
  REGULARLY: "Regularly",
  EARLY_BIRD: "Early bird",
  BALANCED: "Flexible sleeper",
  NIGHT_OWL: "Night owl",
  RELAXED: "Relaxed cleanliness",
  MODERATE: "Moderately tidy",
  VERY_TIDY: "Very tidy",
  HAS_PETS: "Has pets",
  PET_FRIENDLY: "Pet friendly",
  PREFERS_NO_PETS: "Prefers no pets",
  STUDENT: "Student",
  WORKING_PROFESSIONAL: "Working professional",
  SELF_EMPLOYED: "Self-employed",
  FREELANCER: "Freelancer",
  OTHER: "Other status",
};

export function savedSearchFilterLabels(kind: SavedSearchKind, filters: unknown) {
  const labels: string[] = [];
  const query = stringValue(filters, "query");
  const minimum = numberValue(filters, "budgetMin");
  const maximum = numberValue(filters, "budgetMax");
  const moveInBy = stringValue(filters, "moveInBy");

  if (query) labels.push(`“${query}”`);
  if (minimum !== null) labels.push(`From ₹${minimum.toLocaleString("en-IN")}`);
  if (maximum !== null) labels.push(`Up to ₹${maximum.toLocaleString("en-IN")}`);
  if (moveInBy) labels.push(`Move in by ${moveInBy}`);

  if (kind === "COMMUNITY_POSTS") {
    const postType = stringValue(filters, "postType");
    const gender = stringValue(filters, "genderPreference");
    const maximumDistance = numberValue(filters, "maximumDistanceKm");
    if (postType) labels.push(postTypeLabels.get(postType) ?? postType);
    if (gender) labels.push(enumLabels[gender] ?? gender);
    if (maximumDistance !== null) {
      labels.push(`Within ${maximumDistance} km`);
    }
  } else {
    const score = numberValue(filters, "minimumCompatibility");
    const preferredCommute = numberValue(filters, "preferredCommuteKm");
    if (score !== null) labels.push(`${score}%+ compatibility`);
    if (preferredCommute !== null) {
      labels.push(`Commute up to ${preferredCommute} km`);
    }
    for (const key of [
      "diet",
      "smoking",
      "drinking",
      "sleepSchedule",
      "cleanliness",
      "pets",
      "occupationStatus",
    ]) {
      const value = stringValue(filters, key);
      if (value) labels.push(enumLabels[value] ?? value);
    }
  }

  return labels.slice(0, 8);
}
