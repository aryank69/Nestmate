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

export const HOUSING_OPTIONS: Record<
  CommunityPostCategory,
  { housingTypes: string[]; housingFeatures: string[] }
> = {
  "Need a Room": {
    housingTypes: ["Private room", "Shared room", "Either works"],
    housingFeatures: [
      "Furnished",
      "Semi-furnished",
      "Unfurnished",
      "No preference",
    ],
  },
  "Room Available": {
    housingTypes: ["1BHK", "2BHK", "3BHK", "4BHK or larger"],
    housingFeatures: ["Private room", "Shared room", "Master bedroom"],
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
  roomType: "PRIVATE_ROOM" | "SHARED_ROOM" | null;
  furnishingStatus:
    | "FURNISHED"
    | "SEMI_FURNISHED"
    | "UNFURNISHED"
    | null;
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
    errors.moveInDate = "Choose a valid move-in date.";
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
    roomType =
      input.housingType === "Private room"
        ? "PRIVATE_ROOM"
        : input.housingType === "Shared room"
          ? "SHARED_ROOM"
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
      input.housingFeature === "Shared room" ? "SHARED_ROOM" : "PRIVATE_ROOM";
  }

  const contextualTags = [
    input.genderPreference === "Any gender" ? "" : input.genderPreference,
    input.housingType,
    input.housingFeature === "No preference" ? "" : input.housingFeature,
  ];

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
      bedrooms,
      availableSpots,
      mealsIncluded,
      amenities: [],
      tags: uniqueTags([...contextualTags, ...customTags]).slice(0, 8),
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
