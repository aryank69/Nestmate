import type { MapPoint } from "@/types/map";

export type CommutePreference = {
  destination: string;
  latitude: number | null;
  longitude: number | null;
  preferredRangeKm: number | null;
};

export type CommuteSummary = {
  destinationLabel: string;
  distanceKm: number;
  distanceLabel: string;
  relevanceLabel: string;
  withinPreferredRange: boolean | null;
  basedOnApproximateLocation: boolean;
};

export type CommuteBounds = {
  latitudeMin: number;
  latitudeMax: number;
  longitudeMin: number;
  longitudeMax: number;
};

export type PrivateCommuteDestination = MapPoint & {
  label: string;
  preferredRangeKm: number | null;
};
