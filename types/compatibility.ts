import type { UserProfile } from "@/types/profile";

export type CompatibilityFactorKey =
  | "budget"
  | "locality"
  | "diet"
  | "smoking"
  | "drinking"
  | "sleepSchedule"
  | "cleanliness"
  | "pets"
  | "occupationStatus";

export type CompatibilityBudget = {
  minimum: number | null;
  maximum: number | null;
};

export type CompatibilityProfile = {
  budget: CompatibilityBudget | null;
  preferredLocalities: string[];
  diet: string | null;
  smoking: string | null;
  drinking: string | null;
  sleepSchedule: string | null;
  cleanliness: string | null;
  pets: string | null;
  occupationStatus: string | null;
};

export type CompatibilityFactor = {
  key: CompatibilityFactorKey;
  label: string;
  weight: number;
  alignment: number;
  weightedPoints: number;
  status: "match" | "partial" | "mismatch";
  detail: string;
};

export type CompatibilityResult = {
  score: number | null;
  label: string;
  comparedFactors: number;
  totalFactors: number;
  comparedWeight: number;
  factors: CompatibilityFactor[];
  mainMatches: CompatibilityFactor[];
  mainMismatches: CompatibilityFactor[];
};

export type CompatibilitySourceProfile = Pick<
  UserProfile,
  "budget" | "preferredLocalities" | "preferences"
>;
