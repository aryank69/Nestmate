import type {
  ListingLocationPrecision,
  MapPoint,
  PropertyMapLocation,
} from "@/types/map";

export const APPROXIMATE_LOCATION_DECIMALS = 2;
const EXACT_LOCATION_DECIMALS = 6;

export type MapProvider = {
  id: string;
  embedUrl: (location: PropertyMapLocation) => string;
  externalUrl: (location: PropertyMapLocation) => string;
};

function roundCoordinate(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function publicMapPoint(
  point: MapPoint,
  precision: ListingLocationPrecision,
): PropertyMapLocation {
  const decimals =
    precision === "APPROXIMATE"
      ? APPROXIMATE_LOCATION_DECIMALS
      : EXACT_LOCATION_DECIMALS;

  return {
    latitude: roundCoordinate(point.latitude, decimals),
    longitude: roundCoordinate(point.longitude, decimals),
    precision,
  };
}

const openStreetMapProvider: MapProvider = {
  id: "openstreetmap",
  embedUrl(location) {
    const radius = location.precision === "APPROXIMATE" ? 0.035 : 0.008;
    const params = new URLSearchParams({
      bbox: [
        location.longitude - radius,
        location.latitude - radius,
        location.longitude + radius,
        location.latitude + radius,
      ].join(","),
      layer: "mapnik",
      marker: `${location.latitude},${location.longitude}`,
    });
    return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
  },
  externalUrl(location) {
    const zoom = location.precision === "APPROXIMATE" ? 13 : 16;
    return `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=${zoom}/${location.latitude}/${location.longitude}`;
  },
};

export function getMapProvider(): MapProvider {
  return openStreetMapProvider;
}
