import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { communityInitials } from "@/lib/community";
import { calculateCompatibility } from "@/lib/compatibility";
import { prisma } from "@/lib/prisma";
import type { CompatibilityProfile } from "@/types/compatibility";
import type { PeopleDiscoveryProfile, PeopleFilters } from "@/types/discovery";

const dietLabels = {
  VEGETARIAN: "Vegetarian",
  NON_VEGETARIAN: "Non-vegetarian",
  EGGETARIAN: "Eggetarian",
  VEGAN: "Vegan",
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

type PreferenceRecord = {
  budgetMin: number | null;
  budgetMax: number | null;
  preferredMoveInDate: Date | null;
  diet: keyof typeof dietLabels | null;
  smoking: keyof typeof habitLabels | null;
  drinking: keyof typeof habitLabels | null;
  sleepSchedule: keyof typeof sleepLabels | null;
  cleanliness: keyof typeof cleanlinessLabels | null;
  pets: keyof typeof petLabels | null;
  occupationStatus: keyof typeof occupationLabels | null;
  preferredLocalities: Array<{ locality: { name: string } }>;
};

function preferenceLabel<T extends string>(map: Record<T, string>, value: T | null) {
  return value ? map[value] : null;
}

function toCompatibilityProfile(preferences: PreferenceRecord): CompatibilityProfile {
  return {
    budget:
      preferences.budgetMin !== null || preferences.budgetMax !== null
        ? { minimum: preferences.budgetMin, maximum: preferences.budgetMax }
        : null,
    preferredLocalities: preferences.preferredLocalities.map(
      ({ locality }) => locality.name,
    ),
    diet: preferenceLabel(dietLabels, preferences.diet),
    smoking:
      preferences.smoking === "NEVER"
        ? "Non-smoker"
        : preferenceLabel(habitLabels, preferences.smoking),
    drinking: preferenceLabel(habitLabels, preferences.drinking),
    sleepSchedule: preferenceLabel(sleepLabels, preferences.sleepSchedule),
    cleanliness: preferenceLabel(cleanlinessLabels, preferences.cleanliness),
    pets: preferenceLabel(petLabels, preferences.pets),
    occupationStatus: preferenceLabel(
      occupationLabels,
      preferences.occupationStatus,
    ),
  };
}

function ageFromDateOfBirth(value: Date | null) {
  if (!value) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - value.getUTCFullYear();
  if (
    today.getUTCMonth() < value.getUTCMonth() ||
    (today.getUTCMonth() === value.getUTCMonth() &&
      today.getUTCDate() < value.getUTCDate())
  ) {
    age -= 1;
  }
  return age > 0 ? age : null;
}

function formatRupees(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function budgetLabel(minimum: number | null, maximum: number | null) {
  if (minimum !== null && maximum !== null) {
    return minimum === maximum
      ? formatRupees(minimum)
      : `${formatRupees(minimum)}–${formatRupees(maximum)}`;
  }
  if (minimum !== null) return `${formatRupees(minimum)}+`;
  if (maximum !== null) return `Up to ${formatRupees(maximum)}`;
  return "Budget flexible";
}

function moveInLabel(value: Date | null) {
  if (!value) return "Move-in flexible";
  return `Moving ${new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value)}`;
}

function preferenceWhere(filters: PeopleFilters): Prisma.UserPreferencesWhereInput {
  const and: Prisma.UserPreferencesWhereInput[] = [];

  if (filters.localityId) {
    and.push({ preferredLocalities: { some: { localityId: filters.localityId } } });
  }
  if (filters.budgetMin !== null || filters.budgetMax !== null) {
    and.push({ OR: [{ budgetMin: { not: null } }, { budgetMax: { not: null } }] });
  }
  if (filters.budgetMin !== null) {
    and.push({ OR: [{ budgetMax: null }, { budgetMax: { gte: filters.budgetMin } }] });
  }
  if (filters.budgetMax !== null) {
    and.push({ OR: [{ budgetMin: null }, { budgetMin: { lte: filters.budgetMax } }] });
  }
  if (filters.moveInBy) {
    and.push({
      OR: [
        { preferredMoveInDate: null },
        { preferredMoveInDate: { lte: new Date(`${filters.moveInBy}T00:00:00.000Z`) } },
      ],
    });
  }
  if (filters.diet) and.push({ diet: filters.diet });
  if (filters.smoking) and.push({ smoking: filters.smoking });
  if (filters.drinking) and.push({ drinking: filters.drinking });
  if (filters.sleepSchedule) and.push({ sleepSchedule: filters.sleepSchedule });
  if (filters.cleanliness) and.push({ cleanliness: filters.cleanliness });
  if (filters.pets) and.push({ pets: filters.pets });
  if (filters.occupationStatus) {
    and.push({ occupationStatus: filters.occupationStatus });
  }

  return and.length ? { AND: and } : {};
}

export async function loadPeopleDiscovery(
  viewerAuthUserId: string,
  filters: PeopleFilters,
): Promise<PeopleDiscoveryProfile[]> {
  const viewer = await prisma.user.findUnique({
    where: { authUserId: viewerAuthUserId },
    select: {
      id: true,
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
          preferredLocalities: {
            orderBy: { priority: "asc" },
            select: { locality: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!viewer) return [];

  const candidates = await prisma.user.findMany({
    where: {
      id: { not: viewer.id },
      AND: [
        { blocksCreated: { none: { blockedId: viewer.id } } },
        { blocksReceived: { none: { blockerId: viewer.id } } },
        ...(filters.query
          ? [{
              OR: [
                { name: { contains: filters.query, mode: "insensitive" as const } },
                { profession: { contains: filters.query, mode: "insensitive" as const } },
                { companyOrCollege: { contains: filters.query, mode: "insensitive" as const } },
              ],
            }]
          : []),
      ],
      preferences: { is: preferenceWhere(filters) },
    },
    select: {
      id: true,
      authUserId: true,
      name: true,
      dateOfBirth: true,
      profession: true,
      companyOrCollege: true,
      bio: true,
      createdAt: true,
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
          preferredLocalities: {
            orderBy: { priority: "asc" },
            select: { locality: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });

  const viewerCompatibility = viewer.preferences
    ? toCompatibilityProfile(viewer.preferences)
    : null;

  const profiles = candidates.flatMap((candidate) => {
    if (!candidate.preferences) return [];
    const candidateCompatibility = toCompatibilityProfile(candidate.preferences);
    const compatibility = viewerCompatibility
      ? calculateCompatibility(viewerCompatibility, candidateCompatibility)
      : null;

    if (
      filters.minimumCompatibility !== null &&
      (compatibility?.score == null ||
        compatibility.score < filters.minimumCompatibility)
    ) {
      return [];
    }

    const lifestyleTags = [
      candidateCompatibility.diet,
      candidateCompatibility.smoking,
      candidateCompatibility.drinking
        ? `${candidateCompatibility.drinking} drinking`
        : null,
      candidateCompatibility.sleepSchedule,
      candidateCompatibility.cleanliness,
      candidateCompatibility.pets,
      candidateCompatibility.occupationStatus,
    ].filter((value): value is string => Boolean(value));

    return [{
      id: candidate.id,
      authUserId: candidate.authUserId,
      name: candidate.name,
      initials: communityInitials(candidate.name),
      age: ageFromDateOfBirth(candidate.dateOfBirth),
      profession:
        candidate.profession ||
        candidateCompatibility.occupationStatus ||
        "NestMate member",
      organization: candidate.companyOrCollege ?? "",
      bio: candidate.bio ?? "Looking for a compatible home and flatmate.",
      budgetLabel: budgetLabel(
        candidate.preferences.budgetMin,
        candidate.preferences.budgetMax,
      ),
      moveInLabel: moveInLabel(candidate.preferences.preferredMoveInDate),
      preferredLocalities: candidateCompatibility.preferredLocalities,
      lifestyleTags,
      compatibility,
      createdAt: candidate.createdAt,
      budgetSort:
        candidate.preferences.budgetMin ??
        candidate.preferences.budgetMax ??
        Number.POSITIVE_INFINITY,
    }];
  });

  profiles.sort((a, b) => {
    if (filters.sort === "lowest-budget") {
      return a.budgetSort - b.budgetSort || b.createdAt.getTime() - a.createdAt.getTime();
    }
    if (filters.sort === "newest") {
      return b.createdAt.getTime() - a.createdAt.getTime();
    }
    return (
      (b.compatibility?.score ?? -1) - (a.compatibility?.score ?? -1) ||
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  });

  return profiles.slice(0, 60);
}
