import "server-only";

import { prisma } from "@/lib/prisma";
import type { RequirementProfileDefaults } from "@/types/community";

const dietLabels = {
  VEGETARIAN: "Vegetarian",
  NON_VEGETARIAN: "Non-vegetarian",
  EGGETARIAN: "Eggetarian",
  VEGAN: "Vegan",
} as const;

const smokingLabels = {
  NEVER: "Non-smoker",
  OCCASIONALLY: "Occasionally",
  REGULARLY: "Regularly",
} as const;

const habitLabels = {
  NEVER: "Never",
  OCCASIONALLY: "Occasionally",
  REGULARLY: "Regularly",
} as const;

const sleepLabels = {
  EARLY_BIRD: "Early bird",
  BALANCED: "Flexible",
  NIGHT_OWL: "Night owl",
} as const;

const cleanlinessLabels = {
  RELAXED: "Relaxed",
  MODERATE: "Moderately tidy",
  VERY_TIDY: "Very tidy",
} as const;

const petLabels = {
  HAS_PETS: "Have a pet",
  PET_FRIENDLY: "Pet friendly",
  PREFERS_NO_PETS: "Prefer no pets",
} as const;

const occupationLabels = {
  STUDENT: "Student",
  WORKING_PROFESSIONAL: "Working professional",
  SELF_EMPLOYED: "Self-employed",
  FREELANCER: "Freelancer",
  OTHER: "Other",
} as const;

function label<T extends string>(map: Record<T, string>, value: T | null) {
  return value ? map[value] : "";
}

export async function loadRequirementProfileDefaults(
  authUserId: string,
): Promise<RequirementProfileDefaults> {
  const user = await prisma.user.findUnique({
    where: { authUserId },
    select: {
      preferences: {
        select: {
          budgetMin: true,
          budgetMax: true,
          preferredMoveInDate: true,
          diet: true,
          smoking: true,
          drinking: true,
          sleepSchedule: true,
          cleanliness: true,
          pets: true,
          occupationStatus: true,
          preferredCommuteKm: true,
          preferredLocalities: {
            orderBy: { priority: "asc" },
            take: 1,
            select: { localityId: true },
          },
        },
      },
    },
  });
  const preferences = user?.preferences;

  return {
    amount: String(preferences?.budgetMax ?? preferences?.budgetMin ?? ""),
    moveInDate:
      preferences?.preferredMoveInDate?.toISOString().slice(0, 10) ?? "",
    occupationStatus: preferences
      ? label(occupationLabels, preferences.occupationStatus)
      : "",
    diet: preferences ? label(dietLabels, preferences.diet) : "",
    smoking: preferences ? label(smokingLabels, preferences.smoking) : "",
    drinking: preferences ? label(habitLabels, preferences.drinking) : "",
    sleepSchedule: preferences
      ? label(sleepLabels, preferences.sleepSchedule)
      : "",
    cleanliness: preferences
      ? label(cleanlinessLabels, preferences.cleanliness)
      : "",
    pets: preferences ? label(petLabels, preferences.pets) : "",
    preferredCommuteKm: String(preferences?.preferredCommuteKm ?? ""),
    preferredLocalityId:
      preferences?.preferredLocalities[0]?.localityId ?? null,
  };
}
