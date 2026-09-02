import type {
  CommunityPostFilters,
  CommunityPostTypeOption,
  PeopleFilters,
  SearchParamRecord,
} from "@/types/discovery";

export const COMMUNITY_POST_TYPE_OPTIONS: readonly CommunityPostTypeOption[] = [
  { value: "NEED_ROOM", label: "Need a Room" },
  { value: "ROOM_AVAILABLE", label: "Room Available" },
  { value: "NEED_FLATMATE", label: "Need Flatmate" },
  { value: "PG_AVAILABLE", label: "PG Available" },
];

const postTypes = new Set(COMMUNITY_POST_TYPE_OPTIONS.map(({ value }) => value));
const genderPreferences = new Set(["ANY", "WOMEN", "MEN"]);
const communitySorts = new Set(["newest", "lowest-amount"]);
const peopleSorts = new Set([
  "highest-compatibility",
  "lowest-budget",
  "newest",
]);
const diets = new Set(["VEGETARIAN", "NON_VEGETARIAN", "EGGETARIAN", "VEGAN"]);
const habits = new Set(["NEVER", "OCCASIONALLY", "REGULARLY"]);
const sleepSchedules = new Set(["EARLY_BIRD", "BALANCED", "NIGHT_OWL"]);
const cleanlinessLevels = new Set(["RELAXED", "MODERATE", "VERY_TIDY"]);
const petPreferences = new Set(["HAS_PETS", "PET_FRIENDLY", "PREFERS_NO_PETS"]);
const occupationStatuses = new Set([
  "STUDENT",
  "WORKING_PROFESSIONAL",
  "SELF_EMPLOYED",
  "FREELANCER",
  "OTHER",
]);

function singleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanText(value: string | string[] | undefined, maximum = 80) {
  return (singleValue(value) ?? "").trim().slice(0, maximum);
}

function positiveInteger(value: string | string[] | undefined) {
  const raw = singleValue(value);
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10_000_000
    ? parsed
    : null;
}

function validDate(value: string | string[] | undefined) {
  const raw = singleValue(value) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? "" : raw;
}

function enumValue<T extends string>(
  value: string | string[] | undefined,
  allowed: Set<string>,
): T | null {
  const raw = singleValue(value);
  return raw && allowed.has(raw) ? (raw as T) : null;
}

export function parseCommunityPostFilters(
  params: SearchParamRecord,
): CommunityPostFilters {
  const minimum = positiveInteger(params.min);
  const maximum = positiveInteger(params.max);

  return {
    query: cleanText(params.q),
    postType: enumValue(params.type, postTypes),
    budgetMin: minimum,
    budgetMax: maximum !== null && minimum !== null && maximum < minimum
      ? minimum
      : maximum,
    moveInBy: validDate(params.moveInBy),
    genderPreference: enumValue(params.gender, genderPreferences),
    sort: enumValue(params.sort, communitySorts) ?? "newest",
  };
}

export function parsePeopleFilters(params: SearchParamRecord): PeopleFilters {
  const minimum = positiveInteger(params.min);
  const maximum = positiveInteger(params.max);
  const compatibility = positiveInteger(params.score);

  return {
    query: cleanText(params.q),
    localityId: cleanText(params.locality, 128),
    budgetMin: minimum,
    budgetMax: maximum !== null && minimum !== null && maximum < minimum
      ? minimum
      : maximum,
    moveInBy: validDate(params.moveInBy),
    diet: enumValue(params.diet, diets),
    smoking: enumValue(params.smoking, habits),
    drinking: enumValue(params.drinking, habits),
    sleepSchedule: enumValue(params.sleep, sleepSchedules),
    cleanliness: enumValue(params.cleanliness, cleanlinessLevels),
    pets: enumValue(params.pets, petPreferences),
    occupationStatus: enumValue(params.status, occupationStatuses),
    minimumCompatibility:
      compatibility !== null && compatibility <= 100 ? compatibility : null,
    sort: enumValue(params.sort, peopleSorts) ?? "highest-compatibility",
  };
}

export function communityFilterQuery(
  filters: CommunityPostFilters,
  postType: CommunityPostFilters["postType"],
) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (postType) params.set("type", postType);
  if (filters.budgetMin !== null) params.set("min", String(filters.budgetMin));
  if (filters.budgetMax !== null) params.set("max", String(filters.budgetMax));
  if (filters.moveInBy) params.set("moveInBy", filters.moveInBy);
  if (filters.genderPreference) params.set("gender", filters.genderPreference);
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  return params.toString();
}

export function peopleFilterQuery(filters: PeopleFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.localityId) params.set("locality", filters.localityId);
  if (filters.budgetMin !== null) params.set("min", String(filters.budgetMin));
  if (filters.budgetMax !== null) params.set("max", String(filters.budgetMax));
  if (filters.moveInBy) params.set("moveInBy", filters.moveInBy);
  if (filters.diet) params.set("diet", filters.diet);
  if (filters.smoking) params.set("smoking", filters.smoking);
  if (filters.drinking) params.set("drinking", filters.drinking);
  if (filters.sleepSchedule) params.set("sleep", filters.sleepSchedule);
  if (filters.cleanliness) params.set("cleanliness", filters.cleanliness);
  if (filters.pets) params.set("pets", filters.pets);
  if (filters.occupationStatus) params.set("status", filters.occupationStatus);
  if (filters.minimumCompatibility !== null) {
    params.set("score", String(filters.minimumCompatibility));
  }
  if (filters.sort !== "highest-compatibility") params.set("sort", filters.sort);
  return params.toString();
}

export function activeCommunityFilterCount(filters: CommunityPostFilters) {
  return [
    filters.query,
    filters.budgetMin,
    filters.budgetMax,
    filters.moveInBy,
    filters.genderPreference,
  ].filter((value) => value !== "" && value !== null).length;
}

export function activePeopleFilterCount(filters: PeopleFilters) {
  return [
    filters.query,
    filters.localityId,
    filters.budgetMin,
    filters.budgetMax,
    filters.moveInBy,
    filters.diet,
    filters.smoking,
    filters.drinking,
    filters.sleepSchedule,
    filters.cleanliness,
    filters.pets,
    filters.occupationStatus,
    filters.minimumCompatibility,
  ].filter((value) => value !== "" && value !== null).length;
}
