export type MoveInReadinessLevel = "high" | "medium" | "low";

export type MoveInReadinessFactorKey =
  | "availability"
  | "freshness"
  | "photos"
  | "verification"
  | "responsiveness"
  | "visitSlots"
  | "propertyDetails";

export type MoveInReadinessFactor = {
  key: MoveInReadinessFactorKey;
  label: string;
  weight: number;
  alignment: number;
  weightedPoints: number;
  reason: string;
  tone: "positive" | "neutral" | "caution";
};
export type MoveInReadiness = {
  score: number;
  level: MoveInReadinessLevel;
  label: "High readiness" | "Medium readiness" | "Low readiness";
  reasons: string[];
  considerations: string[];
  factors: MoveInReadinessFactor[];
};
