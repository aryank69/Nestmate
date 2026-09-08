import type { CommunityPostCategory } from "@/types/community";
import type { CommuteSummary } from "@/types/commute";
import type { RecommendationResult } from "@/types/recommendation";

export type ComparisonListing = {
  id: string;
  title: string;
  category: Extract<
    CommunityPostCategory,
    "Room Available" | "PG Available"
  >;
  locality: string;
  city: string;
  detailHref: string;
  rent: { minimum: number | null; maximum: number | null; label: string };
  deposit: string | null;
  maintenance: string | null;
  furnishing: string | null;
  roomType: string | null;
  amenities: string[];
  availabilityDate: string;
  availability: {
    status: "AVAILABLE" | "RESERVED" | "CLOSED";
    label: string;
  };
  commute: CommuteSummary | null;
  recommendation: RecommendationResult;
  freshness: {
    isStale: boolean;
    ageDays: number;
    label: string;
  };
  verificationLabels: string[];
};

export type ComparisonSlot = {
  id: string;
  listing: ComparisonListing | null;
  unavailableReason: string | null;
};

export type ListingComparisonData = {
  slots: ComparisonSlot[];
  selectionWasTrimmed: boolean;
  error: string;
};
