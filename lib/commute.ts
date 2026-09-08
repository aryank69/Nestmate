import type {
  CommuteBounds,
  CommutePreference,
  CommuteSummary,
  PrivateCommuteDestination,
} from "@/types/commute";
import type { PropertyMapLocation } from "@/types/map";

export const MAX_COMMUTE_DISTANCE_KM = 100;
const EARTH_RADIUS_KM = 6_371.0088;

type CommutePreferenceInput = {
  destination: unknown;
  latitude: unknown;
  longitude: unknown;
  preferredRangeKm: unknown;
};

export type CommutePreferenceValidation =
  | { success: true; data: CommutePreference }
  | { success: false; message: string };

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function validateCommutePreference(
  input: CommutePreferenceInput,
): CommutePreferenceValidation {
  const destination =
    typeof input.destination === "string" ? input.destination.trim() : "";
  const latitude = optionalNumber(input.latitude);
  const longitude = optionalNumber(input.longitude);
  const preferredRangeKm = optionalNumber(input.preferredRangeKm);
  const hasDestinationPoint = Boolean(
    destination || latitude !== null || longitude !== null,
  );

  if (
    preferredRangeKm !== null &&
    (!Number.isInteger(preferredRangeKm) ||
      preferredRangeKm < 1 ||
      preferredRangeKm > MAX_COMMUTE_DISTANCE_KM)
  ) {
    return {
      success: false,
      message: `Preferred commute must be between 1 and ${MAX_COMMUTE_DISTANCE_KM} km.`,
    };
  }

  if (!hasDestinationPoint) {
    return {
      success: true,
      data: {
        destination: "",
        latitude: null,
        longitude: null,
        preferredRangeKm,
      },
    };
  }

  if (destination.length < 2 || destination.length > 120) {
    return {
      success: false,
      message: "Name the destination using 2 to 120 characters.",
    };
  }
  if (latitude === null || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return {
      success: false,
      message: "Enter a destination latitude between -90 and 90.",
    };
  }
  if (
    longitude === null ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return {
      success: false,
      message: "Enter a destination longitude between -180 and 180.",
    };
  }

  return {
    success: true,
    data: {
      destination,
      latitude: Math.round(latitude * 1_000_000) / 1_000_000,
      longitude: Math.round(longitude * 1_000_000) / 1_000_000,
      preferredRangeKm,
    },
  };
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceBetweenKm(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_KM *
    Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))))
  );
}

export function commuteBounds(
  destination: { latitude: number; longitude: number },
  maximumDistanceKm: number,
): CommuteBounds {
  const latitudeDelta = maximumDistanceKm / 111.32;
  const longitudeScale = Math.max(
    0.01,
    Math.cos(radians(destination.latitude)),
  );
  const longitudeDelta = maximumDistanceKm / (111.32 * longitudeScale);

  return {
    latitudeMin: Math.max(-90, destination.latitude - latitudeDelta),
    latitudeMax: Math.min(90, destination.latitude + latitudeDelta),
    longitudeMin: Math.max(-180, destination.longitude - longitudeDelta),
    longitudeMax: Math.min(180, destination.longitude + longitudeDelta),
  };
}

function distanceLabel(distanceKm: number) {
  const rounded = distanceKm < 10 ? Math.round(distanceKm * 10) / 10 : Math.round(distanceKm);
  return `~${rounded.toLocaleString("en-IN")} km away`;
}

export function summarizeCommute(
  listingLocation: PropertyMapLocation,
  destination: PrivateCommuteDestination,
): CommuteSummary {
  const distanceKm = distanceBetweenKm(listingLocation, destination);
  const withinPreferredRange =
    destination.preferredRangeKm === null
      ? null
      : distanceKm <= destination.preferredRangeKm;
  const relevanceLabel =
    withinPreferredRange === true
      ? "Within your preferred commute"
      : withinPreferredRange === false
        ? "Beyond your preferred commute"
        : distanceKm <= 3
          ? "Very close"
          : distanceKm <= 8
            ? "Easy commute"
            : distanceKm <= 15
              ? "Manageable commute"
              : "Longer commute";

  return {
    destinationLabel: destination.label,
    distanceKm,
    distanceLabel: distanceLabel(distanceKm),
    relevanceLabel,
    withinPreferredRange,
    basedOnApproximateLocation:
      listingLocation.precision === "APPROXIMATE",
  };
}
