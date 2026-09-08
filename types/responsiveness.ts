export type ResponsivenessLevel = "quick" | "active" | "limited" | "neutral";

export type ResponsivenessIndicator = {
  level: ResponsivenessLevel;
  label:
    | "Usually responds quickly"
    | "Active recently"
    | "Limited activity"
    | "Response history building";
  description: string;
  recommendationAlignment: number | null;
};
