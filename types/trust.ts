export type TrustReason =
  | "Verified profile"
  | "Profile information complete"
  | "Consistent visit history"
  | "Usually responds quickly"
  | "Active Roomzi history"
  | "Listing recently confirmed"
  | "Verified listing details"
  | "Positive aggregated visit feedback";

export type TrustScore = {
  score: number;
  confidence: "neutral" | "established";
  label:
    | "Trust history building"
    | "Trust history developing"
    | "Established trust signals"
    | "Strong trust signals";
  reasons: TrustReason[];
};

export type ListingFeedbackAggregate = {
  responseCount: number;
  propertyAccuracy: number;
  cleanliness: number;
  communicationQuality: number;
  safetyComfort: number;
  overallExperience: number;
};
