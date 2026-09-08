export type RecommendationFactorKey =
  | "locality"
  | "budget"
  | "compatibility"
  | "commute"
  | "moveIn"
  | "lifestyle"
  | "property"
  | "freshness"
  | "responsiveness"
  | "visitHistory"
  | "trust";

export type RecommendationFactor = {
  key: RecommendationFactorKey;
  label: string;
  weight: number;
  alignment: number;
  weightedPoints: number;
  status: "strong" | "partial" | "weak";
  reason: string;
};

export type RecommendationResult = {
  score: number | null;
  label: string;
  comparedWeight: number;
  factors: RecommendationFactor[];
  reasons: string[];
  considerations: string[];
};

export type LivingFitFactor = RecommendationFactor;
export type LivingFitResult = RecommendationResult;
