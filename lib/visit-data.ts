import "server-only";

import { prisma } from "@/lib/prisma";
import {
  generateVisitSlots,
  rankVisitSlotSuggestions,
  VISIT_AVAILABILITY_DAYS,
} from "@/lib/visit-availability";
import { isPastVisit } from "@/lib/visits";
import {
  visitAttendanceConfirmationEligibility,
  visitCheckInEligibility,
} from "@/lib/visit-attendance";
import { canSubmitVisitFeedback } from "@/lib/visit-feedback";
import { canSubmitListingRealityFeedback } from "@/lib/listing-reality";
import type { VisitRequestView } from "@/types/visit";

export async function loadVisitRequests(
  authUserId: string,
  postId?: string,
): Promise<VisitRequestView[]> {
  const currentUser = await prisma.user.findUnique({
    where: { authUserId },
    select: { id: true },
  });
  if (!currentUser) return [];

  const now = new Date();
  const visits = await prisma.visitRequest.findMany({
    where: {
      ...(postId ? { postId } : {}),
      OR: [
        { requesterId: currentUser.id },
        { ownerId: currentUser.id },
      ],
      requester: {
        blocksCreated: { none: { blockedId: currentUser.id } },
        blocksReceived: { none: { blockerId: currentUser.id } },
      },
      owner: {
        blocksCreated: { none: { blockedId: currentUser.id } },
        blocksReceived: { none: { blockerId: currentUser.id } },
      },
    },
    select: {
      id: true,
      postId: true,
      requesterId: true,
      ownerId: true,
      status: true,
      calendarRevision: true,
      changes: {
        select: {
          revision: true, actorRole: true, previousStatus: true, status: true,
          previousTime: true, scheduledAt: true, createdAt: true,
        },
        orderBy: { revision: "desc" },
      },
      requestedAt: true,
      proposedAt: true,
      scheduledAt: true,
      note: true,
      createdAt: true,
      outcomes: {
        where: { userId: currentUser.id },
        select: { outcome: true, privateNote: true, updatedAt: true },
        take: 1,
      },
      moveInChecklists: {
        where: { userId: currentUser.id },
        select: { id: true },
        take: 1,
      },
      feedback: {
        where: { userId: currentUser.id },
        select: {
          propertyAccuracy: true,
          cleanliness: true,
          communicationQuality: true,
          safetyComfort: true,
          overallExperience: true,
          privateNote: true,
          updatedAt: true,
        },
        take: 1,
      },
      attendances: {
        select: {
          userId: true,
          checkedInAt: true,
          confirmation: true,
          confirmedAt: true,
        },
      },
      slotPreference: {
        select: {
          preferredWeekdays: true,
          preferredStartMinute: true,
          preferredEndMinute: true,
        },
      },
      requester: { select: { name: true } },
      owner: { select: { name: true } },
      post: {
        select: {
          title: true,
          status: true,
          moderationStatus: true,
          availabilityStatus: true,
          publishedAt: true,
          community: {
            select: { locality: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    take: postId ? 100 : 200,
  });

  // Fetch only the signed-in reviewer's row. Owners must never receive a
  // visitor's raw ratings or private note through this server-side query.
  const myRealityFeedbackRows = visits.length
    ? await prisma.listingRealityFeedback.findMany({
        where: {
          reviewerId: currentUser.id,
          visitId: { in: visits.map(({ id }) => id) },
        },
        select: {
          visitId: true,
          photosAccuracy: true,
          costAccuracy: true,
          amenitiesAccuracy: true,
          conditionAccuracy: true,
          locationAccuracy: true,
          descriptionAccuracy: true,
          privateNote: true,
          updatedAt: true,
        },
      })
    : [];
  const myRealityFeedbackByVisitId = new Map(
    myRealityFeedbackRows.map((feedback) => [feedback.visitId, feedback]),
  );

  const ownerIds = [...new Set(visits.map((visit) => visit.ownerId))];
  const horizon = new Date(
    now.getTime() + (VISIT_AVAILABILITY_DAYS + 1) * 24 * 60 * 60_000,
  );
  const [rules, blocks, occupied] = ownerIds.length
    ? await Promise.all([
        prisma.visitAvailabilityRule.findMany({
          where: { ownerId: { in: ownerIds } },
          select: { ownerId: true, weekday: true, startMinute: true, endMinute: true },
        }),
        prisma.visitAvailabilityBlock.findMany({
          where: {
            ownerId: { in: ownerIds },
            startsAt: { lt: horizon },
            endsAt: { gt: now },
          },
          select: { ownerId: true, startsAt: true, endsAt: true },
        }),
        prisma.visitRequest.findMany({
          where: {
            ownerId: { in: ownerIds },
            status: "ACCEPTED",
            scheduledAt: { gte: now, lt: horizon },
          },
          select: { id: true, ownerId: true, scheduledAt: true },
        }),
      ])
    : [[], [], []];

  return visits.map((visit) => {
    const role = visit.ownerId === currentUser.id ? "OWNER" : "REQUESTER";
    const myRealityFeedback = myRealityFeedbackByVisitId.get(visit.id) ?? null;
    const requesterAttendance = visit.attendances.find(
      (entry) => entry.userId === visit.requesterId,
    )?.confirmation;
    const ownerAttendance = visit.attendances.find(
      (entry) => entry.userId === visit.ownerId,
    )?.confirmation;
    const availableSlots =
      visit.post.status === "ACTIVE" &&
      visit.post.moderationStatus === "VISIBLE" &&
      visit.post.publishedAt &&
      ["AVAILABLE", "RESERVED"].includes(visit.post.availabilityStatus)
        ? generateVisitSlots({
            rules: rules.filter((rule) => rule.ownerId === visit.ownerId),
            blocks: blocks.filter((block) => block.ownerId === visit.ownerId),
            occupiedStarts: occupied.flatMap((accepted) =>
              accepted.ownerId === visit.ownerId &&
              accepted.id !== visit.id &&
              accepted.scheduledAt
                ? [accepted.scheduledAt]
                : [],
            ),
            now,
          }).map((slot) => slot.toISOString())
        : [];
    const normalized = {
      id: visit.id,
      postId: visit.postId,
      postTitle: visit.post.title,
      locality: visit.post.community.locality.name,
      counterpartName:
        role === "OWNER" ? visit.requester.name : visit.owner.name,
      role,
      status: visit.status,
      calendarRevision: visit.calendarRevision,
      changes: visit.changes.map((change) => ({
        ...change,
        previousTime: change.previousTime?.toISOString() ?? null,
        scheduledAt: change.scheduledAt?.toISOString() ?? null,
        createdAt: change.createdAt.toISOString(),
      })),
      requestedAt: visit.requestedAt.toISOString(),
      proposedAt: visit.proposedAt?.toISOString() ?? null,
      scheduledAt: visit.scheduledAt?.toISOString() ?? null,
      note: visit.note,
      createdAt: visit.createdAt.toISOString(),
      myOutcome: visit.outcomes[0]
        ? {
            outcome: visit.outcomes[0].outcome,
            privateNote: visit.outcomes[0].privateNote,
            updatedAt: visit.outcomes[0].updatedAt.toISOString(),
          }
        : null,
      moveInChecklistId: visit.moveInChecklists[0]?.id ?? null,
      myFeedback: visit.feedback[0]
        ? {
            ...visit.feedback[0],
            updatedAt: visit.feedback[0].updatedAt.toISOString(),
          }
        : null,
      myAttendance: (() => {
        const attendance = visit.attendances.find(
          (entry) => entry.userId === currentUser.id,
        );
        return attendance
          ? {
              checkedInAt: attendance.checkedInAt?.toISOString() ?? null,
              confirmation: attendance.confirmation,
              confirmedAt: attendance.confirmedAt?.toISOString() ?? null,
            }
          : null;
      })(),
      sharedAttendance: (() => {
        const mine = visit.attendances.find(
          (entry) => entry.userId === currentUser.id,
        );
        const counterpart = visit.attendances.find(
          (entry) => entry.userId !== currentUser.id,
        );
        return mine?.confirmation && counterpart?.confirmation
          ? {
              bothConfirmed: true as const,
              counterpartConfirmation: counterpart.confirmation,
            }
          : null;
      })(),
      checkInEligibility: visitCheckInEligibility(
        {
          status: visit.status,
          scheduledAt: visit.scheduledAt,
          post: visit.post,
        },
        now,
      ),
      attendanceEligibility: visitAttendanceConfirmationEligibility(
        { status: visit.status, scheduledAt: visit.scheduledAt },
        now,
      ),
      feedbackEligibility: canSubmitVisitFeedback(
        {
          status: visit.status,
          scheduledAt: visit.scheduledAt,
          attendanceConfirmation: visit.attendances.find(
            (entry) => entry.userId === currentUser.id,
          )?.confirmation,
          outcome: visit.outcomes[0]?.outcome,
          hasExistingFeedback: Boolean(visit.feedback[0]),
        },
        now,
      ),
      myRealityFeedback: myRealityFeedback
        ? {
            photosAccuracy: myRealityFeedback.photosAccuracy,
            costAccuracy: myRealityFeedback.costAccuracy,
            amenitiesAccuracy: myRealityFeedback.amenitiesAccuracy,
            conditionAccuracy: myRealityFeedback.conditionAccuracy,
            locationAccuracy: myRealityFeedback.locationAccuracy,
            descriptionAccuracy: myRealityFeedback.descriptionAccuracy,
            privateNote: myRealityFeedback.privateNote,
            updatedAt: myRealityFeedback.updatedAt.toISOString(),
          }
        : null,
      realityFeedbackEligibility: canSubmitListingRealityFeedback(
        {
          role,
          status: visit.status,
          scheduledAt: visit.scheduledAt,
          requesterAttendance,
          ownerAttendance,
          hasExistingFeedback: Boolean(myRealityFeedback),
        },
        now,
      ),
      availableSlots,
      suggestedSlots: rankVisitSlotSuggestions({
        slots: availableSlots,
        preference: visit.slotPreference,
        now,
      }),
    } satisfies Omit<VisitRequestView, "isPast">;

    return { ...normalized, isPast: isPastVisit(normalized) };
  });
}
