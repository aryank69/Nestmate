import type {
  CommunityLocationOption,
  CommunityPostCategory,
  CommunityPostFormField,
  CommunityPostFormValues,
} from "@/types/community";

export function communityPath(
  location: Pick<CommunityLocationOption, "citySlug" | "localitySlug">,
) {
  return `/community/${encodeURIComponent(location.citySlug)}/${encodeURIComponent(location.localitySlug)}`;
}

export const POST_TYPE_TO_DATABASE = {
  "Need a Room": "NEED_ROOM",
  "Room Available": "ROOM_AVAILABLE",
  "Need Flatmate": "NEED_FLATMATE",
  "PG Available": "PG_AVAILABLE",
} as const;

export const DATABASE_TO_POST_TYPE = {
  NEED_ROOM: "Need a Room",
  ROOM_AVAILABLE: "Room Available",
  NEED_FLATMATE: "Need Flatmate",
  PG_AVAILABLE: "PG Available",
} as const;

const genderToDatabase = {
  "Any gender": "ANY",
  "Women only": "WOMEN",
  "Men only": "MEN",
} as const;

export const DATABASE_TO_GENDER = {
  ANY: "Any gender",
  WOMEN: "Women only",
  MEN: "Men only",
} as const;

export const FURNISHING_OPTIONS = [
  "Furnished",
  "Semi-furnished",
  "Unfurnished",
] as const;

export const PREFERRED_OCCUPANT_OPTIONS = [
  "Any",
  "Working professional",
  "Student",
  "Family",
] as const;

export const PARKING_OPTIONS = [
  "No parking",
  "Two-wheeler",
  "Car",
  "Car and two-wheeler",
] as const;

export const ATTACHED_BATHROOM_OPTIONS = ["Yes", "No"] as const;

export const ROOM_OCCUPANCY_OPTIONS = [
  "Single occupancy",
  "Double sharing",
  "Triple sharing",
] as const;

export const LOCATION_PRECISION_OPTIONS = ["Approximate", "Exact"] as const;

export const REQUIREMENT_OCCUPATION_OPTIONS = [
  "Student",
  "Working professional",
  "Self-employed",
  "Freelancer",
  "Other",
] as const;

export const REQUIREMENT_DIET_OPTIONS = [
  "Vegetarian",
  "Non-vegetarian",
  "Eggetarian",
  "Vegan",
] as const;

export const REQUIREMENT_HABIT_OPTIONS = [
  "Never",
  "Occasionally",
  "Regularly",
] as const;

export const REQUIREMENT_SMOKING_OPTIONS = [
  "Non-smoker",
  "Occasionally",
  "Regularly",
] as const;

export const REQUIREMENT_SLEEP_OPTIONS = [
  "Early bird",
  "Flexible",
  "Night owl",
] as const;

export const REQUIREMENT_CLEANLINESS_OPTIONS = [
  "Relaxed",
  "Moderately tidy",
  "Very tidy",
] as const;

export const REQUIREMENT_PET_OPTIONS = [
  "Have a pet",
  "Pet friendly",
  "Prefer no pets",
] as const;

const REQUIREMENT_TAG_FIELDS = [
  ["Status: ", "occupationStatus"],
  ["Food: ", "diet"],
  ["Smoking: ", "smoking"],
  ["Drinking: ", "drinking"],
  ["Schedule: ", "sleepSchedule"],
  ["Cleanliness: ", "cleanliness"],
  ["Pets: ", "pets"],
] as const;

export function parseRequirementTags(tags: string[]) {
  const values = Object.fromEntries(
    REQUIREMENT_TAG_FIELDS.map(([prefix, field]) => [
      field,
      tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length) ?? "",
    ]),
  ) as Record<(typeof REQUIREMENT_TAG_FIELDS)[number][1], string>;
  const commuteTag = tags.find((tag) => /^Commute: up to \d+ km$/.test(tag));
  const reservedPrefixes = REQUIREMENT_TAG_FIELDS.map(([prefix]) => prefix);

  return {
    ...values,
    preferredCommuteKm: commuteTag?.match(/\d+/)?.[0] ?? "",
    customTags: tags.filter(
      (tag) =>
        !reservedPrefixes.some((prefix) => tag.startsWith(prefix)) &&
        tag !== commuteTag,
    ),
  };
}

export const HOUSING_OPTIONS: Record<
  CommunityPostCategory,
  { housingTypes: string[]; housingFeatures: string[] }
> = {
  "Need a Room": {
    housingTypes: [
      "Private room",
      "Shared room",
      "Entire flat",
      "PG / co-living",
      "Either works",
    ],
    housingFeatures: [
      "Furnished",
      "Semi-furnished",
      "Unfurnished",
      "No preference",
    ],
  },
  "Room Available": {
    housingTypes: ["1BHK", "2BHK", "3BHK", "4BHK or larger"],
    housingFeatures: [
      "Private room",
      "Shared room",
      "Entire place",
      "Master bedroom",
    ],
  },
  "Need Flatmate": {
    housingTypes: ["1BHK", "2BHK", "3BHK", "4BHK or larger"],
    housingFeatures: ["Private room", "Shared room", "Master bedroom"],
  },
  "PG Available": {
    housingTypes: [
      "Single occupancy",
      "Twin sharing",
      "Triple sharing",
      "Multiple options",
    ],
    housingFeatures: ["Included", "Not included", "Optional meal plan"],
  },
};

type ValidatedPostValues = {
  type: (typeof POST_TYPE_TO_DATABASE)[CommunityPostCategory];
  status: "ACTIVE";
  title: string;
  description: string;
  monthlyAmountMin: number | null;
  monthlyAmountMax: number | null;
  currency: "INR";
  moveInDate: string;
  genderPreference: (typeof genderToDatabase)[keyof typeof genderToDatabase];
  propertyType: "APARTMENT" | "PG" | null;
  roomType: "PRIVATE_ROOM" | "SHARED_ROOM" | "ENTIRE_PLACE" | null;
  furnishingStatus:
    | "FURNISHED"
    | "SEMI_FURNISHED"
    | "UNFURNISHED"
    | null;
  securityDeposit: number | null;
  maintenanceAmount: number | null;
  preferredOccupant:
    | "ANY"
    | "WORKING_PROFESSIONAL"
    | "STUDENT"
    | "FAMILY"
    | null;
  attachedBathroom: boolean | null;
  parkingType: "NONE" | "TWO_WHEELER" | "CAR" | "BOTH" | null;
  latitude: number | null;
  longitude: number | null;
  locationPrecision: "EXACT" | "APPROXIMATE" | null;
  bedrooms: number | null;
  availableSpots: number | null;
  mealsIncluded: boolean | null;
  amenities: string[];
  tags: string[];
};

export type CommunityPostValidationResult =
  | { success: true; data: ValidatedPostValues }
  | {
      success: false;
      errors: Partial<Record<CommunityPostFormField, string>>;
    };

function uniqueTags(tags: string[]) {
  const seen = new Set<string>();

  return tags.filter((tag) => {
    const key = tag.toLocaleLowerCase("en-IN");
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function validateCommunityPost(
  input: CommunityPostFormValues,
): CommunityPostValidationResult {
  const errors: Partial<Record<CommunityPostFormField, string>> = {};
  const category = input.postType as CommunityPostCategory;
  const options = HOUSING_OPTIONS[category];
  const title = input.title.trim();
  const description = input.description.trim();
  const amount = Number(input.amount);
  const customTags = input.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const amenities = uniqueTags(
    (input.amenities ?? "")
      .split(",")
      .map((amenity) => amenity.trim())
      .filter(Boolean),
  );
  const isListing =
    category === "Room Available" || category === "PG Available";
  const isRequirement =
    category === "Need a Room" || category === "Need Flatmate";
  const latitudeInput = input.locationLatitude?.trim() ?? "";
  const longitudeInput = input.locationLongitude?.trim() ?? "";
  const hasAnyCoordinate = Boolean(latitudeInput || longitudeInput);
  let latitude: number | null = null;
  let longitude: number | null = null;
  let locationPrecision: ValidatedPostValues["locationPrecision"] = null;

  const optionalAmount = (
    field: "securityDeposit" | "maintenanceAmount",
    label: string,
  ) => {
    const value = input[field]?.trim() ?? "";
    if (!value) return null;
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 0 || amount > 10_000_000) {
      errors[field] = `Enter a valid ${label}.`;
      return null;
    }
    return amount;
  };

  const securityDeposit = isListing
    ? optionalAmount("securityDeposit", "deposit")
    : null;
  const maintenanceAmount = isListing
    ? optionalAmount("maintenanceAmount", "maintenance amount")
    : null;

  if (!(category in POST_TYPE_TO_DATABASE)) {
    errors.postType = "Choose a valid post type.";
  }
  if (!input.communityId.trim()) {
    errors.communityId = "Choose a locality.";
  }
  if (title.length < 10 || title.length > 140) {
    errors.title = "Title must be between 10 and 140 characters.";
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > 10_000_000) {
    errors.amount = "Enter a valid monthly amount.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.moveInDate)) {
    errors.moveInDate = isListing
      ? "Choose a valid availability date."
      : "Choose a valid move-in date.";
  }
  if (!(input.genderPreference in genderToDatabase)) {
    errors.genderPreference = "Choose a gender preference.";
  }
  if (!options?.housingTypes.includes(input.housingType)) {
    errors.housingType = "Choose a valid housing option.";
  }
  if (!options?.housingFeatures.includes(input.housingFeature)) {
    errors.housingFeature = "Choose a valid housing detail.";
  }
  if (description.length < 30 || description.length > 2000) {
    errors.description = "Description must be between 30 and 2,000 characters.";
  }
  if (
    customTags.length > 5 ||
    customTags.some((tag) => tag.length < 2 || tag.length > 30)
  ) {
    errors.tags = "Add up to 5 tags, each between 2 and 30 characters.";
  }
  if (
    isRequirement &&
    !REQUIREMENT_OCCUPATION_OPTIONS.includes(
      input.occupationStatus as (typeof REQUIREMENT_OCCUPATION_OPTIONS)[number],
    )
  ) {
    errors.occupationStatus = "Choose your work or study status.";
  }
  const optionalRequirementOptions = [
    ["diet", input.diet, REQUIREMENT_DIET_OPTIONS, "food preference"],
    ["smoking", input.smoking, REQUIREMENT_SMOKING_OPTIONS, "smoking preference"],
    ["drinking", input.drinking, REQUIREMENT_HABIT_OPTIONS, "drinking preference"],
    ["sleepSchedule", input.sleepSchedule, REQUIREMENT_SLEEP_OPTIONS, "sleep schedule"],
    ["cleanliness", input.cleanliness, REQUIREMENT_CLEANLINESS_OPTIONS, "cleanliness preference"],
    ["pets", input.pets, REQUIREMENT_PET_OPTIONS, "pet preference"],
  ] as const;
  if (isRequirement) {
    for (const [field, value, options, label] of optionalRequirementOptions) {
      if (value && !(options as readonly string[]).includes(value)) {
        errors[field] = `Choose a valid ${label}.`;
      }
    }
    if (input.preferredCommuteKm) {
      const commuteKm = Number(input.preferredCommuteKm);
      if (!Number.isInteger(commuteKm) || commuteKm < 1 || commuteKm > 100) {
        errors.preferredCommuteKm = "Choose a commute range between 1 and 100 km.";
      }
    }
  }
  if (
    amenities.length > 8 ||
    amenities.some((amenity) => amenity.length < 2 || amenity.length > 40)
  ) {
    errors.amenities =
      "Add up to 8 amenities, each between 2 and 40 characters.";
  }
  if (
    isListing &&
    input.furnishingStatus &&
    !FURNISHING_OPTIONS.includes(
      input.furnishingStatus as (typeof FURNISHING_OPTIONS)[number],
    )
  ) {
    errors.furnishingStatus = "Choose a valid furnishing option.";
  }
  if (
    category === "Room Available" &&
    input.occupancy &&
    !ROOM_OCCUPANCY_OPTIONS.includes(
      input.occupancy as (typeof ROOM_OCCUPANCY_OPTIONS)[number],
    )
  ) {
    errors.occupancy = "Choose a valid occupancy option.";
  }
  if (
    isListing &&
    input.preferredOccupant &&
    !PREFERRED_OCCUPANT_OPTIONS.includes(
      input.preferredOccupant as (typeof PREFERRED_OCCUPANT_OPTIONS)[number],
    )
  ) {
    errors.preferredOccupant = "Choose a valid tenant preference.";
  }
  if (
    isListing &&
    input.attachedBathroom &&
    !ATTACHED_BATHROOM_OPTIONS.includes(
      input.attachedBathroom as (typeof ATTACHED_BATHROOM_OPTIONS)[number],
    )
  ) {
    errors.attachedBathroom = "Choose a valid bathroom option.";
  }
  if (
    isListing &&
    input.parkingType &&
    !PARKING_OPTIONS.includes(
      input.parkingType as (typeof PARKING_OPTIONS)[number],
    )
  ) {
    errors.parkingType = "Choose a valid parking option.";
  }
  if (isListing && hasAnyCoordinate) {
    const parsedLatitude = Number(latitudeInput);
    const parsedLongitude = Number(longitudeInput);

    if (
      !latitudeInput ||
      !Number.isFinite(parsedLatitude) ||
      parsedLatitude < -90 ||
      parsedLatitude > 90
    ) {
      errors.locationLatitude = "Enter a latitude between -90 and 90.";
    }
    if (
      !longitudeInput ||
      !Number.isFinite(parsedLongitude) ||
      parsedLongitude < -180 ||
      parsedLongitude > 180
    ) {
      errors.locationLongitude = "Enter a longitude between -180 and 180.";
    }
    if (
      !LOCATION_PRECISION_OPTIONS.includes(
        input.locationPrecision as (typeof LOCATION_PRECISION_OPTIONS)[number],
      )
    ) {
      errors.locationPrecision = "Choose how precisely to share this location.";
    }

    if (
      !errors.locationLatitude &&
      !errors.locationLongitude &&
      !errors.locationPrecision
    ) {
      locationPrecision =
        input.locationPrecision === "Exact" ? "EXACT" : "APPROXIMATE";
      const decimals = locationPrecision === "APPROXIMATE" ? 2 : 6;
      const factor = 10 ** decimals;
      latitude = Math.round((parsedLatitude + Number.EPSILON) * factor) / factor;
      longitude =
        Math.round((parsedLongitude + Number.EPSILON) * factor) / factor;
    }
  }

  if (Object.keys(errors).length || !options) {
    return { success: false, errors };
  }

  let propertyType: ValidatedPostValues["propertyType"] = null;
  let roomType: ValidatedPostValues["roomType"] = null;
  let furnishingStatus: ValidatedPostValues["furnishingStatus"] = null;
  let bedrooms: number | null = null;
  let availableSpots: number | null = null;
  let mealsIncluded: boolean | null = null;

  if (category === "Need a Room") {
    propertyType =
      input.housingType === "PG / co-living"
        ? "PG"
        : input.housingType === "Entire flat"
          ? "APARTMENT"
          : null;
    roomType =
      input.housingType === "Private room"
        ? "PRIVATE_ROOM"
        : input.housingType === "Shared room"
          ? "SHARED_ROOM"
          : input.housingType === "Entire flat"
            ? "ENTIRE_PLACE"
            : null;
    furnishingStatus =
      input.housingFeature === "Furnished"
        ? "FURNISHED"
        : input.housingFeature === "Semi-furnished"
          ? "SEMI_FURNISHED"
          : input.housingFeature === "Unfurnished"
            ? "UNFURNISHED"
            : null;
  } else if (category === "PG Available") {
    propertyType = "PG";
    roomType =
      input.housingType === "Single occupancy"
        ? "PRIVATE_ROOM"
        : input.housingType === "Multiple options"
          ? null
          : "SHARED_ROOM";
    availableSpots =
      input.housingType === "Single occupancy"
        ? 1
        : input.housingType === "Twin sharing"
          ? 2
          : input.housingType === "Triple sharing"
            ? 3
            : null;
    mealsIncluded =
      input.housingFeature === "Included"
        ? true
        : input.housingFeature === "Not included"
          ? false
          : null;
  } else {
    propertyType = "APARTMENT";
    bedrooms = input.housingType.startsWith("4")
      ? 4
      : Number(input.housingType[0]);
    roomType =
      input.housingFeature === "Shared room"
        ? "SHARED_ROOM"
        : input.housingFeature === "Entire place"
          ? "ENTIRE_PLACE"
          : "PRIVATE_ROOM";
    availableSpots =
      category === "Room Available"
        ? input.occupancy === "Single occupancy"
          ? 1
          : input.occupancy === "Double sharing"
            ? 2
            : input.occupancy === "Triple sharing"
              ? 3
              : null
        : null;
  }

  if (isListing) {
    furnishingStatus =
      input.furnishingStatus === "Furnished"
        ? "FURNISHED"
        : input.furnishingStatus === "Semi-furnished"
          ? "SEMI_FURNISHED"
          : input.furnishingStatus === "Unfurnished"
            ? "UNFURNISHED"
            : null;
  }

  const preferredOccupant: ValidatedPostValues["preferredOccupant"] = isListing
    ? input.preferredOccupant === "Working professional"
      ? "WORKING_PROFESSIONAL"
      : input.preferredOccupant === "Student"
        ? "STUDENT"
        : input.preferredOccupant === "Family"
          ? "FAMILY"
          : input.preferredOccupant === "Any"
            ? "ANY"
            : null
    : null;
  const parkingType: ValidatedPostValues["parkingType"] = isListing
    ? input.parkingType === "Two-wheeler"
      ? "TWO_WHEELER"
      : input.parkingType === "Car"
        ? "CAR"
        : input.parkingType === "Car and two-wheeler"
          ? "BOTH"
          : input.parkingType === "No parking"
            ? "NONE"
            : null
    : null;

  const contextualTags = [
    input.genderPreference === "Any gender" ? "" : input.genderPreference,
    input.housingType,
    input.housingFeature === "No preference" ? "" : input.housingFeature,
  ];
  const requirementTags = isRequirement
    ? [
        `Status: ${input.occupationStatus}`,
        input.diet ? `Food: ${input.diet}` : "",
        input.smoking ? `Smoking: ${input.smoking}` : "",
        input.drinking ? `Drinking: ${input.drinking}` : "",
        input.sleepSchedule ? `Schedule: ${input.sleepSchedule}` : "",
        input.cleanliness ? `Cleanliness: ${input.cleanliness}` : "",
        input.pets ? `Pets: ${input.pets}` : "",
        input.preferredCommuteKm
          ? `Commute: up to ${input.preferredCommuteKm} km`
          : "",
      ]
    : [];

  return {
    success: true,
    data: {
      type: POST_TYPE_TO_DATABASE[category],
      status: "ACTIVE",
      title,
      description,
      monthlyAmountMin: category === "Need a Room" ? null : amount,
      monthlyAmountMax: category === "PG Available" ? null : amount,
      currency: "INR",
      moveInDate: input.moveInDate,
      genderPreference:
        genderToDatabase[
          input.genderPreference as keyof typeof genderToDatabase
        ],
      propertyType,
      roomType,
      furnishingStatus,
      securityDeposit: isListing ? securityDeposit : null,
      maintenanceAmount: isListing ? maintenanceAmount : null,
      preferredOccupant,
      attachedBathroom: isListing
        ? input.attachedBathroom === "Yes"
          ? true
          : input.attachedBathroom === "No"
            ? false
            : null
        : null,
      parkingType,
      latitude: isListing ? latitude : null,
      longitude: isListing ? longitude : null,
      locationPrecision: isListing ? locationPrecision : null,
      bedrooms,
      availableSpots,
      mealsIncluded,
      amenities: isListing ? amenities : [],
      tags: uniqueTags([
        ...contextualTags,
        ...requirementTags,
        ...customTags,
      ]).slice(0, isRequirement ? 16 : 8),
    },
  };
}

export function communityInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function formatListingOccupancy(
  category: CommunityPostCategory,
  availableSpots: number | null,
) {
  if (category === "PG Available") {
    if (availableSpots === 1) return "Single occupancy";
    if (availableSpots === 2) return "Twin sharing";
    if (availableSpots === 3) return "Triple sharing";
    return availableSpots ? `${availableSpots} sharing` : "Multiple options";
  }
  if (category === "Room Available") {
    if (availableSpots === 1) return "Single occupancy";
    if (availableSpots === 2) return "Double sharing";
    if (availableSpots === 3) return "Triple sharing";
  }
  return null;
}

export function formatCommunityAmount(
  category: CommunityPostCategory,
  minimum: number | null,
  maximum: number | null,
) {
  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  if (category === "Need a Room" && maximum !== null) {
    return `Up to ${formatter.format(maximum)}`;
  }
  if (category === "PG Available" && minimum !== null) {
    return `From ${formatter.format(minimum)}`;
  }
  if (minimum !== null && maximum !== null && minimum !== maximum) {
    return `${formatter.format(minimum)}–${formatter.format(maximum)}`;
  }

  const amount = minimum ?? maximum;
  return amount === null ? "Amount not specified" : `${formatter.format(amount)} / month`;
}
