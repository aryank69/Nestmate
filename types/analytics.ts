export const PRODUCT_ANALYTICS_EVENTS = [
  "SIGNUP_COMPLETED",
  "PROFILE_COMPLETED",
  "LOCALITY_SELECTED",
  "SEARCH_FILTERS_USED",
  "LISTING_VIEWED",
  "PROFILE_VIEWED",
  "LISTING_SAVED",
  "MESSAGE_STARTED",
  "VISIT_REQUESTED",
  "VISIT_COMPLETED",
  "MATCH_FINALIZED",
] as const;

export type ProductAnalyticsEventName =
  (typeof PRODUCT_ANALYTICS_EVENTS)[number];

export type AnalyticsPropertyValue = string | number | boolean;
export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

export type ProductAnalyticsEventInput = {
  name: ProductAnalyticsEventName;
  properties?: Record<string, unknown>;
};

export type SanitizedProductAnalyticsEvent = {
  name: ProductAnalyticsEventName;
  properties: AnalyticsProperties;
};

export type AnalyticsFunnelStage =
  | "discovery"
  | "contact"
  | "visit"
  | "finalization";

export type AnalyticsFunnelStageSummary = {
  stage: AnalyticsFunnelStage;
  label: string;
  users: number;
  conversionFromPrevious: number | null;
};

export type ProductAnalyticsFunnel = {
  periodDays: number;
  totalEvents: number;
  generatedAt: string;
  onboarding: {
    signups: number;
    profilesCompleted: number;
    profileCompletionRate: number;
  };
  stages: AnalyticsFunnelStageSummary[];
};
