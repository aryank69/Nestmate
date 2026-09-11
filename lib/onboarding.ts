import { validateCommutePreference } from "@/lib/commute";
import type {
  OnboardingFormValues,
  OnboardingIntent,
  OnboardingLocation,
} from "@/types/onboarding";

export const ONBOARDING_INTENTS: ReadonlyArray<{
  value: OnboardingIntent;
  label: string;
  description: string;
}> = [
  {
    value: "FIND_ROOM",
    label: "Find a Room",
    description: "Browse rooms, shared flats, and PGs.",
  },
  {
    value: "FIND_ROOMMATE",
    label: "Find a Roommate",
    description: "Discover compatible people.",
  },
  {
    value: "LIST_PROPERTY",
    label: "List a Property",
    description: "Create a room, flat, or PG listing.",
  },
  {
    value: "POST_REQUIREMENT",
    label: "Post a Requirement",
    description: "Share what room or flatmate you need.",
  },
];

const intentValues = new Set(ONBOARDING_INTENTS.map(({ value }) => value));

function onboardingIntent(value: string): OnboardingIntent | null {
  return intentValues.has(value as OnboardingIntent)
    ? (value as OnboardingIntent)
    : null;
}

function formText(value: FormDataEntryValue | string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function budgetValue(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10_000_000
    ? parsed
    : null;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(value + "T00:00:00.000Z").getTime());
}

export function onboardingValues(formData: FormData): OnboardingFormValues {
  return {
    intent: formText(formData.get("intent")) as OnboardingIntent | "",
    communityId: formText(formData.get("communityId")),
    budgetMin: formText(formData.get("budgetMin")),
    budgetMax: formText(formData.get("budgetMax")),
    moveInDate: formText(formData.get("moveInDate")),
    commuteDestination: formText(formData.get("commuteDestination")),
    commuteLatitude: formText(formData.get("commuteLatitude")),
    commuteLongitude: formText(formData.get("commuteLongitude")),
    preferredCommuteKm: formText(formData.get("preferredCommuteKm")),
  };
}

export function validateOnboardingValues(input: OnboardingFormValues) {
  const errors: Partial<Record<keyof OnboardingFormValues, string>> = {};
  const intent = onboardingIntent(input.intent);
  const minimum = budgetValue(input.budgetMin);
  const maximum = budgetValue(input.budgetMax);

  if (!intent) {
    errors.intent = "Choose what you want to do first.";
  }
  if (!input.communityId || input.communityId.length > 128) {
    errors.communityId = "Choose a city and locality.";
  }
  if (minimum === null) {
    errors.budgetMin = "Enter a valid minimum monthly budget.";
  }
  if (maximum === null) {
    errors.budgetMax = "Enter a valid maximum monthly budget.";
  } else if (minimum !== null && maximum < minimum) {
    errors.budgetMax = "Maximum budget must be at least the minimum.";
  }
  if (!validDate(input.moveInDate)) {
    errors.moveInDate = "Choose a valid move-in date.";
  }

  const hasLatitude = Boolean(input.commuteLatitude);
  const hasLongitude = Boolean(input.commuteLongitude);
  const destinationLength = input.commuteDestination.length;
  const commute =
    !hasLatitude && !hasLongitude && destinationLength > 0
      ? validateCommuteLabelOnly(input)
      : validateCommutePreference({
          destination: input.commuteDestination,
          latitude: input.commuteLatitude,
          longitude: input.commuteLongitude,
          preferredRangeKm: input.preferredCommuteKm,
        });
  if (!commute.success) {
    errors.commuteDestination = commute.message;
  }

  if (
    Object.keys(errors).length ||
    !commute.success ||
    !intent ||
    minimum === null ||
    maximum === null
  ) {
    return { success: false as const, errors };
  }

  return {
    success: true as const,
    data: {
      intent,
      communityId: input.communityId,
      budgetMin: minimum,
      budgetMax: maximum,
      moveInDate: input.moveInDate,
      commute: commute.data,
    },
  };
}

function validateCommuteLabelOnly(input: OnboardingFormValues) {
  if (
    input.commuteDestination.length < 2 ||
    input.commuteDestination.length > 120
  ) {
    return {
      success: false as const,
      message: "Name the destination using 2 to 120 characters.",
    };
  }

  const range = input.preferredCommuteKm
    ? Number(input.preferredCommuteKm)
    : null;
  if (
    range !== null &&
    (!Number.isInteger(range) || range < 1 || range > 100)
  ) {
    return {
      success: false as const,
      message: "Preferred commute must be between 1 and 100 km.",
    };
  }

  return {
    success: true as const,
    data: {
      destination: input.commuteDestination,
      latitude: null,
      longitude: null,
      preferredRangeKm: range,
    },
  };
}

export function onboardingDestination(
  input: {
    intent: OnboardingIntent;
    budgetMin: number;
    budgetMax: number;
    moveInDate: string;
    commute: {
      latitude: number | null;
      longitude: number | null;
      preferredRangeKm: number | null;
    };
  },
  location: OnboardingLocation,
) {
  const params = new URLSearchParams();

  if (input.intent === "LIST_PROPERTY") {
    params.set("city", location.citySlug);
    params.set("locality", location.id);
    return "/list-property?" + params.toString();
  }
  if (input.intent === "POST_REQUIREMENT") {
    params.set("city", location.citySlug);
    params.set("locality", location.id);
    return "/post-requirement?" + params.toString();
  }

  params.set(
    "locality",
    input.intent === "FIND_ROOM" ? location.id : location.localityId,
  );
  params.set("min", String(input.budgetMin));
  params.set("max", String(input.budgetMax));
  params.set("moveInBy", input.moveInDate);
  params.set("sort", "recommended");

  if (input.intent === "FIND_ROOM") {
    params.set("city", location.citySlug);
    if (
      input.commute.latitude !== null &&
      input.commute.longitude !== null &&
      input.commute.preferredRangeKm !== null
    ) {
      params.set("distance", String(input.commute.preferredRangeKm));
    }
    return "/rooms?" + params.toString();
  }

  if (input.commute.preferredRangeKm !== null) {
    params.set("commute", String(input.commute.preferredRangeKm));
  }
  return "/flatmates?" + params.toString();
}

export function onboardingEntryPath(nextPath: string) {
  const safeNext = nextPath.startsWith("/onboarding") ? "/profile" : nextPath;
  return "/onboarding?next=" + encodeURIComponent(safeNext);
}
