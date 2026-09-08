export type ListingRealityCategoryKey =
  | "photosAccuracy"
  | "costAccuracy"
  | "amenitiesAccuracy"
  | "conditionAccuracy"
  | "locationAccuracy"
  | "descriptionAccuracy";

export type ListingRealityRatings = Record<ListingRealityCategoryKey, number>;

export type ListingRealityCategoryIndicator = {
  key: ListingRealityCategoryKey;
  label: string;
  score: number;
  indicator: string;
};

export type ListingRealityScore = {
  score: number | null;
  label: string;
  responseCount: number | null;
  categories: ListingRealityCategoryIndicator[];
};

export type ListingRealityFeedbackView = ListingRealityRatings & {
  privateNote: string | null;
  updatedAt: string;
};
