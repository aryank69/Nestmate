export type ListingDecisionSignalKey =
  | "livingFit"
  | "reality"
  | "readiness"
  | "localityPulse";

export type ListingDecisionSignal = {
  key: ListingDecisionSignalKey;
  label: string;
  value: string;
  explanation: string;
  status: "positive" | "neutral" | "caution" | "missing";
};
export type ListingDecision = {
  label: "Strong Match" | "Worth Considering" | "Low Priority";
  explanation: string;
  signals: ListingDecisionSignal[];
};
