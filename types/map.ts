export type ListingLocationPrecision = "EXACT" | "APPROXIMATE";

export type MapPoint = {
  latitude: number;
  longitude: number;
};

export type PropertyMapLocation = MapPoint & {
  precision: ListingLocationPrecision;
};
