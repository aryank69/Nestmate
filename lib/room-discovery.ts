import type { CommunityPost } from "@/types/community";
import type {
  RoomDiscoveryFilters,
  RoomDiscoverySort,
  RoomListingKind,
  SearchParamRecord,
} from "@/types/discovery";

const listingKinds = new Set<RoomListingKind>([
  "ALL",
  "ROOM_AVAILABLE",
  "FLAT_SHARED",
  "PG_AVAILABLE",
]);
const furnishings = new Set<NonNullable<RoomDiscoveryFilters["furnishing"]>>([
  "FURNISHED",
  "SEMI_FURNISHED",
  "UNFURNISHED",
]);
const roomTypes = new Set<NonNullable<RoomDiscoveryFilters["roomType"]>>([
  "PRIVATE_ROOM",
  "SHARED_ROOM",
  "ENTIRE_PLACE",
]);
const sorts = new Set<RoomDiscoverySort>([
  "recommended",
  "newest",
  "lowest-rent",
  "highest-readiness",
]);

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function clean(value: string | string[] | undefined, maximum = 100) {
  return (single(value) ?? "").trim().slice(0, maximum);
}

function integer(value: string | string[] | undefined, maximum: number) {
  const raw = single(value);
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maximum
    ? parsed
    : null;
}

function percent(value: string | string[] | undefined) {
  return integer(value, 100);
}

function date(value: string | string[] | undefined) {
  const raw = single(value) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return Number.isNaN(new Date(`${raw}T00:00:00.000Z`).getTime()) ? "" : raw;
}

function enumValue<T extends string>(
  value: string | string[] | undefined,
  allowed: Set<T>,
): T | null {
  const raw = single(value) as T | undefined;
  return raw && allowed.has(raw) ? raw : null;
}

function amenities(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const unique = new Map<string, string>();
  for (const part of values.flatMap((item) => item.split(","))) {
    const label = part.trim().slice(0, 40);
    const key = label.toLocaleLowerCase("en-IN");
    if (label && !unique.has(key)) unique.set(key, label);
  }
  return [...unique.values()].slice(0, 8);
}

export function parseRoomDiscoveryFilters(
  params: SearchParamRecord,
): RoomDiscoveryFilters {
  const minimum = integer(params.min, 10_000_000);
  const maximum = integer(params.max, 10_000_000);

  return {
    query: clean(params.q),
    citySlug: clean(params.city, 80),
    communityId: clean(params.locality, 128),
    kind: enumValue(params.kind, listingKinds) ?? "ALL",
    budgetMin: minimum,
    budgetMax:
      minimum !== null && maximum !== null && maximum < minimum
        ? minimum
        : maximum,
    moveInBy: date(params.moveInBy),
    furnishing: enumValue(params.furnishing, furnishings),
    roomType: enumValue(params.roomType, roomTypes),
    amenities: amenities(params.amenities),
    maximumDistanceKm: (() => {
      const value = integer(params.distance, 100);
      return value !== null && value >= 1 ? value : null;
    })(),
    minimumLivingFit: percent(params.livingFit),
    minimumRealityScore: percent(params.reality),
    minimumReadiness: percent(params.readiness),
    sort: enumValue(params.sort, sorts) ?? "recommended",
  };
}

export function roomDiscoveryQuery(filters: RoomDiscoveryFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.citySlug) params.set("city", filters.citySlug);
  if (filters.communityId) params.set("locality", filters.communityId);
  if (filters.kind !== "ALL") params.set("kind", filters.kind);
  if (filters.budgetMin !== null) params.set("min", String(filters.budgetMin));
  if (filters.budgetMax !== null) params.set("max", String(filters.budgetMax));
  if (filters.moveInBy) params.set("moveInBy", filters.moveInBy);
  if (filters.furnishing) params.set("furnishing", filters.furnishing);
  if (filters.roomType) params.set("roomType", filters.roomType);
  if (filters.amenities.length) params.set("amenities", filters.amenities.join(","));
  if (filters.maximumDistanceKm !== null) params.set("distance", String(filters.maximumDistanceKm));
  if (filters.minimumLivingFit !== null) params.set("livingFit", String(filters.minimumLivingFit));
  if (filters.minimumRealityScore !== null) params.set("reality", String(filters.minimumRealityScore));
  if (filters.minimumReadiness !== null) params.set("readiness", String(filters.minimumReadiness));
  if (filters.sort !== "recommended") params.set("sort", filters.sort);
  return params.toString();
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("en-IN");
}

export function filterRoomDiscoveryResults(
  posts: CommunityPost[],
  filters: RoomDiscoveryFilters,
) {
  const wantedAmenities = filters.amenities.map(normalized);
  const filtered = posts.filter((post) => {
    if (wantedAmenities.length) {
      const available = new Set(
        (post.listingDetails?.amenities ?? []).map(normalized),
      );
      if (!wantedAmenities.every((amenity) => available.has(amenity))) return false;
    }
    if (
      filters.minimumLivingFit !== null &&
      (post.recommendation?.score ?? -1) < filters.minimumLivingFit
    ) return false;
    if (
      filters.minimumRealityScore !== null &&
      (post.reality.score ?? -1) < filters.minimumRealityScore
    ) return false;
    if (
      filters.minimumReadiness !== null &&
      (post.readiness?.score ?? -1) < filters.minimumReadiness
    ) return false;
    return true;
  });

  if (filters.sort === "lowest-rent") {
    return filtered.sort(
      (first, second) =>
        (first.monthlyAmountMin ?? first.monthlyAmountMax ?? Number.MAX_SAFE_INTEGER) -
        (second.monthlyAmountMin ?? second.monthlyAmountMax ?? Number.MAX_SAFE_INTEGER),
    );
  }
  if (filters.sort === "highest-readiness") {
    return filtered.sort(
      (first, second) =>
        (second.readiness?.score ?? -1) - (first.readiness?.score ?? -1),
    );
  }
  return filtered;
}

export function activeRoomFilterCount(filters: RoomDiscoveryFilters) {
  return [
    filters.query,
    filters.citySlug,
    filters.communityId,
    filters.kind === "ALL" ? null : filters.kind,
    filters.budgetMin,
    filters.budgetMax,
    filters.moveInBy,
    filters.furnishing,
    filters.roomType,
    filters.amenities.length ? filters.amenities : null,
    filters.maximumDistanceKm,
    filters.minimumLivingFit,
    filters.minimumRealityScore,
    filters.minimumReadiness,
  ].filter((value) => value !== "" && value !== null).length;
}
