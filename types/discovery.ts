import type { CompatibilityResult } from "@/types/compatibility";
import type { CommunityPostCategory } from "@/types/community";

export type SearchParamRecord = Record<
  string,
  string | string[] | undefined
>;

export type CommunityPostSort = "newest" | "lowest-amount";

export type CommunityPostFilters = {
  query: string;
  postType: "NEED_ROOM" | "ROOM_AVAILABLE" | "NEED_FLATMATE" | "PG_AVAILABLE" | null;
  budgetMin: number | null;
  budgetMax: number | null;
  moveInBy: string;
  genderPreference: "ANY" | "WOMEN" | "MEN" | null;
  sort: CommunityPostSort;
};

export type PeopleSort = "highest-compatibility" | "lowest-budget" | "newest";

export type PeopleFilters = {
  query: string;
  localityId: string;
  budgetMin: number | null;
  budgetMax: number | null;
  moveInBy: string;
  diet: "VEGETARIAN" | "NON_VEGETARIAN" | "EGGETARIAN" | "VEGAN" | null;
  smoking: "NEVER" | "OCCASIONALLY" | "REGULARLY" | null;
  drinking: "NEVER" | "OCCASIONALLY" | "REGULARLY" | null;
  sleepSchedule: "EARLY_BIRD" | "BALANCED" | "NIGHT_OWL" | null;
  cleanliness: "RELAXED" | "MODERATE" | "VERY_TIDY" | null;
  pets: "HAS_PETS" | "PET_FRIENDLY" | "PREFERS_NO_PETS" | null;
  occupationStatus:
    | "STUDENT"
    | "WORKING_PROFESSIONAL"
    | "SELF_EMPLOYED"
    | "FREELANCER"
    | "OTHER"
    | null;
  minimumCompatibility: number | null;
  sort: PeopleSort;
};

export type PeopleDiscoveryProfile = {
  id: string;
  authUserId: string;
  name: string;
  initials: string;
  age: number | null;
  profession: string;
  organization: string;
  bio: string;
  budgetLabel: string;
  moveInLabel: string;
  preferredLocalities: string[];
  lifestyleTags: string[];
  compatibility: CompatibilityResult | null;
};

export type CommunityPostTypeOption = {
  value: NonNullable<CommunityPostFilters["postType"]>;
  label: CommunityPostCategory;
};

export type CommunityPostTypeCounts = Record<
  NonNullable<CommunityPostFilters["postType"]>,
  number
>;
