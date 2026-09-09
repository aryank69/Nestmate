export type LocalityPulseMetric<T extends string | number = string> =
  | {
      status: "AVAILABLE";
      value: T;
      detail: string;
    }
  | {
      status: "INSUFFICIENT";
      value: null;
      detail: string;
    };

export type LocalityPulse = {
  minimumSampleSize: number;
  activeListings: LocalityPulseMetric<number>;
  peopleSearching: LocalityPulseMetric<number>;
  medianRent: LocalityPulseMetric;
  typicalDeposit: LocalityPulseMetric;
  listingFreshness: LocalityPulseMetric;
  supplyDemandTrend: LocalityPulseMetric;
  popularMoveInPeriod: LocalityPulseMetric;
  commutePattern: LocalityPulseMetric;
};
