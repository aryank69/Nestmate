import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { communityInitials } from "@/lib/community";
import { calculateCompatibility } from "@/lib/compatibility";
import { prisma } from "@/lib/prisma";
import { loadResponsivenessByUserIds } from "@/lib/responsiveness-data";
import { loadUserTrustScores } from "@/lib/trust-score-data";
import { verificationSummary } from "@/lib/verification";
import {
  calculatePeopleRecommendation,
  rankPeopleRecommendations,
} from "@/lib/recommendations";
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

export const DEFAULT_PEOPLE_FILTERS: PeopleFilters = {
  query: "",
  localityId: "",
  budgetMin: null,
  budgetMax: null,
  moveInBy: "",
  diet: null,
  smoking: null,
  drinking: null,
  sleepSchedule: null,
  cleanliness: null,
  pets: null,
  occupationStatus: null,
  minimumCompatibility: null,
  preferredCommuteKm: null,
  sort: "recommended",
};

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
  preferredCommuteKm: number | null;
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
  if (filters.preferredCommuteKm !== null) {
    and.push({
      preferredCommuteKm: {
        not: null,
        lte: filters.preferredCommuteKm,
      },
    });
  }

  return and.length ? { AND: and } : {};
}

export async function loadPeopleDiscovery(
  viewerAuthUserId: string,
  filters: PeopleFilters,
  targetUserId?: string | string[],
): Promise<PeopleDiscoveryProfile[]> {
  const viewer = await prisma.user.findUnique({
    where: { authUserId: viewerAuthUserId },
    select: {
      id: true,
      shortlistsCreated: {
        select: { targetUserId: true },
      },
      interestsTracked: {
        where: { targetType: "FLATMATE" },
        select: { targetUserId: true, stage: true },
      },
      documentSpacesAsParticipantOne: {
        where: { status: "CLOSED", targetType: "FLATMATE" },
        select: { participantTwoId: true },
      },
      documentSpacesAsParticipantTwo: {
        where: { status: "CLOSED", targetType: "FLATMATE" },
        select: { participantOneId: true },
      },
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
            select: { locality: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!viewer) return [];

  const targetUserIds = Array.isArray(targetUserId)
    ? [...new Set(targetUserId)].slice(0, 60)
    : targetUserId
      ? [targetUserId]
      : [];
  const shortlistedIds = new Set(
    viewer.shortlistsCreated.map(({ targetUserId }) => targetUserId),
  );
  const activityStageByUserId = new Map(
    viewer.interestsTracked.flatMap(({ targetUserId, stage }) =>
      targetUserId ? [[targetUserId, stage] as const] : [],
    ),
  );
  const closedFlatmateIds = [
    ...viewer.documentSpacesAsParticipantOne.map(({ participantTwoId }) => participantTwoId),
    ...viewer.documentSpacesAsParticipantTwo.map(({ participantOneId }) => participantOneId),
  ];

  const candidates = await prisma.user.findMany({
    where: {
      id: targetUserIds.length
        ? { in: targetUserIds, notIn: closedFlatmateIds, not: viewer.id }
        : { notIn: closedFlatmateIds, not: viewer.id },
      AND: [
        { blocksCreated: { none: { blockedId: viewer.id } } },
        { blocksReceived: { none: { blockerId: viewer.id } } },
        { moderationState: { isNot: { status: "SUSPENDED" } } },
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
      updatedAt: true,
      verificationChecks: {
        where: { status: "VERIFIED" },
        select: {
          kind: true,
          status: true,
          verifiedAt: true,
          expiresAt: true,
        },
      },
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
            select: { locality: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: targetUserIds.length ? targetUserIds.length : 200,
  });

  const viewerCompatibility = viewer.preferences
    ? toCompatibilityProfile(viewer.preferences)
    : null;
  const responsivenessByUserId = await loadResponsivenessByUserIds(
    candidates.map(({ id, createdAt, updatedAt }) => ({
      id,
      createdAt,
      updatedAt,
    })),
  );
  const candidateIds = candidates.map(({ id }) => id);
  const trustByUserId = await loadUserTrustScores(
    candidates.map(({ id }) => ({
      id,
      responsiveness: responsivenessByUserId.get(id)!,
    })),
  );
  const privateOutcomeRows = candidateIds.length
    ? await prisma.visitOutcome.findMany({
        where: {
          userId: viewer.id,
          outcome: { not: "NO_SHOW" },
          visit: {
            OR: [
              { requesterId: viewer.id, ownerId: { in: candidateIds } },
              { ownerId: viewer.id, requesterId: { in: candidateIds } },
            ],
          },
        },
        select: {
          outcome: true,
          visit: { select: { requesterId: true, ownerId: true } },
        },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  const privateOutcomeByCandidate = new Map<
    string,
    (typeof privateOutcomeRows)[number]["outcome"]
  >();
  for (const row of privateOutcomeRows) {
    const candidateId =
      row.visit.requesterId === viewer.id
        ? row.visit.ownerId
        : row.visit.requesterId;
    if (!privateOutcomeByCandidate.has(candidateId)) {
      privateOutcomeByCandidate.set(candidateId, row.outcome);
    }
  }

  const profiles = candidates.flatMap((candidate) => {
    if (!candidate.preferences) return [];
    const candidateCompatibility = toCompatibilityProfile(candidate.preferences);
    const compatibility = viewerCompatibility
      ? calculateCompatibility(viewerCompatibility, candidateCompatibility)
      : null;
    const trust = trustByUserId.get(candidate.id)!;
    const recommendation = calculatePeopleRecommendation({
      compatibility,
      viewerMoveInDate:
        viewer.preferences?.preferredMoveInDate?.toISOString().slice(0, 10) ??
        null,
      candidateMoveInDate:
        candidate.preferences.preferredMoveInDate
          ?.toISOString()
          .slice(0, 10) ?? null,
      viewerCommuteKm: viewer.preferences?.preferredCommuteKm ?? null,
      candidateCommuteKm: candidate.preferences.preferredCommuteKm,
      responsiveness: responsivenessByUserId.get(candidate.id)!,
      trust,
      visitOutcome: privateOutcomeByCandidate.get(candidate.id) ?? null,
    });

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
      occupationStatus: candidateCompatibility.occupationStatus,
      compatibility,
      preferredCommuteLabel: candidate.preferences.preferredCommuteKm
        ? `Prefers up to ${candidate.preferences.preferredCommuteKm} km`
        : null,
      responsiveness: responsivenessByUserId.get(candidate.id)!,
      verification: verificationSummary(candidate.verificationChecks),
      trust,
      recommendation,
      isShortlisted: shortlistedIds.has(candidate.id),
      activityStage:
        activityStageByUserId.get(candidate.id) ??
        (shortlistedIds.has(candidate.id) ? "SHORTLISTED" : null),
      createdAt: candidate.createdAt,
      budgetSort:
        candidate.preferences.budgetMin ??
        candidate.preferences.budgetMax ??
        Number.POSITIVE_INFINITY,
    }];
  });

  if (filters.sort === "recommended") {
    return rankPeopleRecommendations(profiles, true).slice(0, 60);
  }

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

export async function loadPeopleProfile(
  viewerAuthUserId: string,
  targetUserId: string,
) {
  const profiles = await loadPeopleDiscovery(
    viewerAuthUserId,
    DEFAULT_PEOPLE_FILTERS,
    targetUserId,
  );
  return profiles[0] ?? null;
}
