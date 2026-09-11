import type { ListingAvailabilityStatus } from "@/lib/listing-freshness";

export type MyListingLifecycleStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "PAUSED"
  | "CLOSED"
  | "UNAVAILABLE";

export type MyListingView = {
  id: string;
  title: string;
  kind: "Room" | "Flat / Shared Flat" | "PG";
  city: string;
  locality: string;
  priceLabel: string;
  availabilityStatus: ListingAvailabilityStatus;
  lifecycleStatus: MyListingLifecycleStatus;
  lifecycleLabel: string;
  freshness: {
    status: ListingAvailabilityStatus;
    label: string;
    isStale: boolean;
    ageDays: number;
    lastConfirmedAt: string;
    freshnessLabel: string;
  };
  metrics: {
    views: number;
    saves: number;
    messagesOrInterests: number;
    visitRequests: number;
    openVisitRequests: number;
  };
  updatedLabel: string;
  detailHref: string | null;
  editHref: string | null;
  matchesHref: string | null;
  canPause: boolean;
  canReopen: boolean;
  canClose: boolean;
  canDelete: boolean;
};

export type MyListingsData = {
  listings: MyListingView[];
  summary: {
    total: number;
    available: number;
    reserved: number;
    paused: number;
    closed: number;
  };
};
