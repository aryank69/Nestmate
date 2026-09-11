import "server-only";

import { getSafeNextPath } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { OnboardingDefaults } from "@/types/onboarding";

export async function loadOnboardingDefaults(
  authUserId: string,
): Promise<OnboardingDefaults> {
  const user = await prisma.user.findUnique({
    where: { authUserId },
    select: {
      preferences: {
        select: {
          budgetMin: true,
          budgetMax: true,
          preferredMoveInDate: true,
          commuteDestination: true,
          commuteLatitude: true,
          commuteLongitude: true,
          preferredCommuteKm: true,
          onboardingIntent: true,
          onboardingCompletedAt: true,
          onboardingSkippedAt: true,
          preferredLocalities: {
            orderBy: { priority: "asc" },
            take: 1,
            select: {
              locality: {
                select: {
                  community: { select: { id: true, isActive: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const preferences = user?.preferences;
  const preferredCommunity =
    preferences?.preferredLocalities[0]?.locality.community;

  return {
    intent: preferences?.onboardingIntent ?? null,
    communityId: preferredCommunity?.isActive
      ? preferredCommunity.id
      : "",
    budgetMin: String(preferences?.budgetMin ?? ""),
    budgetMax: String(preferences?.budgetMax ?? ""),
    moveInDate:
      preferences?.preferredMoveInDate?.toISOString().slice(0, 10) ?? "",
    commuteDestination: preferences?.commuteDestination ?? "",
    commuteLatitude: String(preferences?.commuteLatitude ?? ""),
    commuteLongitude: String(preferences?.commuteLongitude ?? ""),
    preferredCommuteKm: String(preferences?.preferredCommuteKm ?? ""),
    isFinished: Boolean(
      preferences?.onboardingCompletedAt || preferences?.onboardingSkippedAt,
    ),
  };
}

export async function postAuthPath(
  authUserId: string,
  requestedPath: string,
) {
  const nextPath = getSafeNextPath(requestedPath);
  const preferences = await prisma.userPreferences.findFirst({
    where: { user: { authUserId } },
    select: {
      onboardingCompletedAt: true,
      onboardingSkippedAt: true,
    },
  });

  if (
    preferences?.onboardingCompletedAt ||
    preferences?.onboardingSkippedAt
  ) {
    return nextPath;
  }

  const safeNext = nextPath.startsWith("/onboarding") ? "/profile" : nextPath;
  return "/onboarding?next=" + encodeURIComponent(safeNext);
}
