import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  calculateProfileCompleteness,
  calculateUserTrustScore,
} from "@/lib/trust-score";
import { verificationSummary } from "@/lib/verification";
import type { ResponsivenessIndicator } from "@/types/responsiveness";
import type {
  ListingFeedbackAggregate,
  TrustScore,
} from "@/types/trust";

type TrustUserSeed = {
  id: string;
  responsiveness: ResponsivenessIndicator;
};

type FeedbackAggregateRow = {
  postId: string;
  responseCount: number | bigint;
  propertyAccuracy: number | string;
  cleanliness: number | string;
  communicationQuality: number | string;
  safetyComfort: number | string;
  overallExperience: number | string;
};

export async function loadUserTrustScores(
  seeds: TrustUserSeed[],
): Promise<Map<string, TrustScore>> {
  if (!seeds.length) return new Map();
  const userIds = [...new Set(seeds.map(({ id }) => id))];
  const [users, attendance, outcomes, reports, moderationActions, moderationStates] =
    await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          name: true,
          email: true,
          dateOfBirth: true,
          profession: true,
          companyOrCollege: true,
          bio: true,
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
              preferredLocalities: { select: { localityId: true } },
            },
          },
        },
      }),
      prisma.visitAttendance.findMany({
        where: { userId: { in: userIds }, confirmation: { not: null } },
        select: { userId: true, visitId: true, confirmation: true },
      }),
      prisma.visitOutcome.findMany({
        where: { userId: { in: userIds }, outcome: { not: "NO_SHOW" } },
        select: { userId: true, visitId: true },
      }),
      prisma.report.groupBy({
        by: ["reportedUserId"],
        where: { reportedUserId: { in: userIds } },
        _count: { _all: true },
      }),
      prisma.moderationAuditLog.findMany({
        where: { subjectUserId: { in: userIds } },
        select: { subjectUserId: true, action: true, queueType: true },
      }),
      prisma.userModerationState.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, status: true, restrictedUntil: true },
      }),
    ]);

  const seedById = new Map(seeds.map((seed) => [seed.id, seed]));
  const attendanceByUser = new Map<string, typeof attendance>();
  for (const row of attendance) {
    attendanceByUser.set(row.userId, [
      ...(attendanceByUser.get(row.userId) ?? []),
      row,
    ]);
  }
  const outcomeByUser = new Map<string, typeof outcomes>();
  for (const row of outcomes) {
    outcomeByUser.set(row.userId, [
      ...(outcomeByUser.get(row.userId) ?? []),
      row,
    ]);
  }
  const reportCountByUser = new Map(
    reports.map((row) => [row.reportedUserId, row._count._all]),
  );
  const moderationByUser = new Map<string, typeof moderationActions>();
  for (const row of moderationActions) {
    moderationByUser.set(row.subjectUserId, [
      ...(moderationByUser.get(row.subjectUserId) ?? []),
      row,
    ]);
  }
  const moderationStateByUser = new Map(
    moderationStates.map((row) => [row.userId, row]),
  );
  const now = new Date();

  return new Map(users.flatMap((user) => {
    const seed = seedById.get(user.id);
    if (!seed) return [];
    const preferences = user.preferences;
    const userAttendance = attendanceByUser.get(user.id) ?? [];
    const completedVisitIds = new Set([
      ...userAttendance
        .filter(({ confirmation }) => confirmation === "HAPPENED")
        .map(({ visitId }) => visitId),
      ...(outcomeByUser.get(user.id) ?? []).map(({ visitId }) => visitId),
    ]);
    const lifestylePreferenceCount = preferences
      ? [
          preferences.diet,
          preferences.smoking,
          preferences.drinking,
          preferences.sleepSchedule,
          preferences.cleanliness,
          preferences.pets,
          preferences.occupationStatus,
        ].filter(Boolean).length
      : 0;
    const moderationState = moderationStateByUser.get(user.id);
    const userModerationActions = moderationByUser.get(user.id) ?? [];
    const dismissedReportCount = userModerationActions.filter(
      ({ action, queueType }) => action === "DISMISS" && queueType === "REPORT",
    ).length;
    const activeRestriction = Boolean(
      moderationState &&
      moderationState.status === "RESTRICTED" &&
      (!moderationState.restrictedUntil || moderationState.restrictedUntil > now),
    );

    return [[
      user.id,
      calculateUserTrustScore({
        verificationKinds: verificationSummary(user.verificationChecks, now)
          .badges.map(({ kind }) => kind),
        profileCompleteness: calculateProfileCompleteness({
          name: user.name,
          email: user.email,
          dateOfBirth: user.dateOfBirth,
          profession: user.profession,
          companyOrCollege: user.companyOrCollege,
          bio: user.bio,
          hasBudget: Boolean(
            preferences &&
            (preferences.budgetMin !== null || preferences.budgetMax !== null),
          ),
          hasMoveInDate: Boolean(preferences?.preferredMoveInDate),
          preferredLocalityCount: preferences?.preferredLocalities.length ?? 0,
          lifestylePreferenceCount,
        }),
        completedVisits: completedVisitIds.size,
        attendanceConfirmed: userAttendance.length,
        attendanceHappened: userAttendance.filter(
          ({ confirmation }) => confirmation === "HAPPENED",
        ).length,
        responsiveness: seed.responsiveness,
        reportCount: Math.max(
          0,
          (reportCountByUser.get(user.id) ?? 0) - dismissedReportCount,
        ),
        moderationActions: userModerationActions.map(
          ({ action }) => action,
        ),
        isRestricted: activeRestriction,
      }),
    ] as const];
  }));
}

export async function loadListingFeedbackAggregates(
  postIds: string[],
): Promise<Map<string, ListingFeedbackAggregate>> {
  const uniquePostIds = [...new Set(postIds)].slice(0, 200);
  if (!uniquePostIds.length) return new Map();
  const rows = await prisma.$queryRaw<FeedbackAggregateRow[]>(Prisma.sql`
    SELECT
      aggregate."postId",
      aggregate."responseCount",
      aggregate."propertyAccuracy",
      aggregate."cleanliness",
      aggregate."communicationQuality",
      aggregate."safetyComfort",
      aggregate."overallExperience"
    FROM nestmate_private.visit_feedback_listing_aggregate AS aggregate
    WHERE aggregate."postId" IN (${Prisma.join(uniquePostIds)})
  `);
  return new Map(rows.map((row) => [
    row.postId,
    {
      responseCount: Number(row.responseCount),
      propertyAccuracy: Number(row.propertyAccuracy),
      cleanliness: Number(row.cleanliness),
      communicationQuality: Number(row.communicationQuality),
      safetyComfort: Number(row.safetyComfort),
      overallExperience: Number(row.overallExperience),
    },
  ]));
}
