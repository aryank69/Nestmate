import "server-only";

import { activityTargetKey } from "@/lib/activity";
import { loadActivityData } from "@/lib/activity-data";
import { prisma } from "@/lib/prisma";
import {
  addDays,
  addHours,
  isDateWithinWindow,
  isReminderVisible,
  REMINDER_FOLLOW_UP_HOURS,
  REMINDER_MOVE_IN_DAYS,
  REMINDER_SHORTLIST_IDLE_DAYS,
  REMINDER_UPCOMING_VISIT_DAYS,
  reminderKey,
  sortReminderCandidates,
} from "@/lib/reminders";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActivityItem } from "@/types/activity";
import type {
  ReminderCandidate,
  ReminderData,
  ReminderItem,
} from "@/types/reminder";

const MAX_REMINDER_SOURCE_AGE_DAYS = 30;

function reminderFromShortlist(item: ActivityItem): ReminderCandidate {
  const targetLabel = item.targetType === "LISTING" ? "listing" : "flatmate";
  return {
    reminderKey: reminderKey("SHORTLIST_IDLE", item.targetType, item.targetId),
    kind: "SHORTLIST_IDLE",
    targetType: item.targetType,
    targetId: item.targetId,
    title: `Revisit ${item.title}`,
    description: `This shortlisted ${targetLabel} has had no recent activity.`,
    href: item.href,
    dueAt: addDays(
      new Date(item.occurredAt),
      REMINDER_SHORTLIST_IDLE_DAYS,
    ).toISOString(),
    sourceUpdatedAt: item.occurredAt,
  };
}

export async function loadReminderData(
  viewerAuthUserId: string,
  viewerId: string,
  now = new Date(),
): Promise<ReminderData> {
  const activity = await loadActivityData(viewerAuthUserId, viewerId, {
    stage: null,
    targetType: null,
  });
  const activeItems = activity.items.filter(
    ({ stage }) => stage !== "FINALIZED" && stage !== "NOT_INTERESTED",
  );
  const visibleTargetKeys = new Set(activeItems.map(activityTargetKey));
  const listingIds = activeItems
    .filter(({ targetType }) => targetType === "LISTING")
    .map(({ targetId }) => targetId);
  const flatmateIds = activeItems
    .filter(({ targetType }) => targetType === "FLATMATE")
    .map(({ targetId }) => targetId);
  const visitWindowEnd = addDays(now, REMINDER_UPCOMING_VISIT_DAYS);
  const followUpBefore = addHours(now, -REMINDER_FOLLOW_UP_HOURS);
  const sourceAgeStart = addDays(now, -MAX_REMINDER_SOURCE_AGE_DAYS);

  const [visits, conversations, listingDates, flatmateDates] =
    await Promise.all([
      prisma.visitRequest.findMany({
        where: {
          status: "ACCEPTED",
          scheduledAt: { gte: now, lte: visitWindowEnd },
          OR: [{ requesterId: viewerId }, { ownerId: viewerId }],
          requester: {
            blocksCreated: { none: { blockedId: viewerId } },
            blocksReceived: { none: { blockerId: viewerId } },
            moderationState: { isNot: { status: "SUSPENDED" } },
          },
          owner: {
            blocksCreated: { none: { blockedId: viewerId } },
            blocksReceived: { none: { blockerId: viewerId } },
            moderationState: { isNot: { status: "SUSPENDED" } },
          },
          post: {
            status: "ACTIVE",
            moderationStatus: "VISIBLE",
            availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
            publishedAt: { not: null },
            author: {
              moderationState: { isNot: { status: "SUSPENDED" } },
            },
          },
        },
        select: {
          id: true,
          requesterId: true,
          ownerId: true,
          scheduledAt: true,
          updatedAt: true,
          requester: { select: { name: true } },
          owner: { select: { name: true } },
          post: { select: { title: true } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 100,
      }),
      prisma.conversation.findMany({
        where: {
          lastMessageAt: { gte: sourceAgeStart, lte: followUpBefore },
          OR: [
            {
              participantOneId: viewerId,
              participantTwo: {
                blocksCreated: { none: { blockedId: viewerId } },
                blocksReceived: { none: { blockerId: viewerId } },
                moderationState: { isNot: { status: "SUSPENDED" } },
              },
            },
            {
              participantTwoId: viewerId,
              participantOne: {
                blocksCreated: { none: { blockedId: viewerId } },
                blocksReceived: { none: { blockerId: viewerId } },
                moderationState: { isNot: { status: "SUSPENDED" } },
              },
            },
          ],
        },
        select: {
          id: true,
          participantOneId: true,
          participantTwoId: true,
          participantOne: { select: { name: true } },
          participantTwo: { select: { name: true } },
          messages: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { senderId: true, createdAt: true },
            take: 1,
          },
        },
        orderBy: { lastMessageAt: "desc" },
        take: 100,
      }),
      listingIds.length
        ? prisma.post.findMany({
            where: {
              id: { in: listingIds },
              status: "ACTIVE",
              moderationStatus: "VISIBLE",
              availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
              publishedAt: { not: null },
            },
            select: { id: true, title: true, moveInDate: true, updatedAt: true },
          })
        : Promise.resolve([]),
      flatmateIds.length
        ? prisma.userPreferences.findMany({
            where: { userId: { in: flatmateIds } },
            select: {
              userId: true,
              preferredMoveInDate: true,
              updatedAt: true,
              user: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
    ]);

  const candidates: ReminderCandidate[] = [];
  const shortlistIdleBefore = addDays(now, -REMINDER_SHORTLIST_IDLE_DAYS);
  for (const item of activeItems) {
    if (
      item.stage === "SHORTLISTED" &&
      new Date(item.occurredAt).getTime() <= shortlistIdleBefore.getTime()
    ) {
      candidates.push(reminderFromShortlist(item));
    }
  }

  for (const visit of visits) {
    if (!visit.scheduledAt) continue;
    const counterpartName =
      visit.requesterId === viewerId
        ? visit.owner.name
        : visit.requester.name;
    candidates.push({
      reminderKey: reminderKey("UPCOMING_VISIT", "VISIT", visit.id),
      kind: "UPCOMING_VISIT",
      targetType: "VISIT",
      targetId: visit.id,
      title: `Visit with ${counterpartName}`,
      description: `Upcoming visit for ${visit.post.title}.`,
      href: `/visits?visit=${encodeURIComponent(visit.id)}`,
      dueAt: visit.scheduledAt.toISOString(),
      sourceUpdatedAt: visit.updatedAt.toISOString(),
    });
  }

  for (const conversation of conversations) {
    const latestMessage = conversation.messages[0];
    if (!latestMessage || latestMessage.senderId === viewerId) continue;
    const targetId =
      conversation.participantOneId === viewerId
        ? conversation.participantTwoId
        : conversation.participantOneId;
    if (!visibleTargetKeys.has(`FLATMATE:${targetId}`)) continue;
    const targetName =
      conversation.participantOneId === viewerId
        ? conversation.participantTwo.name
        : conversation.participantOne.name;
    candidates.push({
      reminderKey: reminderKey(
        "CHAT_FOLLOW_UP",
        "CONVERSATION",
        conversation.id,
      ),
      kind: "CHAT_FOLLOW_UP",
      targetType: "CONVERSATION",
      targetId: conversation.id,
      title: `Follow up with ${targetName}`,
      description: "Their last message is waiting for your reply.",
      href: `/chat?conversation=${encodeURIComponent(conversation.id)}`,
      dueAt: addHours(
        latestMessage.createdAt,
        REMINDER_FOLLOW_UP_HOURS,
      ).toISOString(),
      sourceUpdatedAt: latestMessage.createdAt.toISOString(),
    });
  }

  for (const listing of listingDates) {
    if (
      !isDateWithinWindow(listing.moveInDate, now, REMINDER_MOVE_IN_DAYS) ||
      !visibleTargetKeys.has(`LISTING:${listing.id}`)
    ) {
      continue;
    }
    candidates.push({
      reminderKey: reminderKey(
        "MOVE_IN_APPROACHING",
        "LISTING",
        listing.id,
      ),
      kind: "MOVE_IN_APPROACHING",
      targetType: "LISTING",
      targetId: listing.id,
      title: `Move-in approaching for ${listing.title}`,
      description: "Review this option before its move-in date.",
      href: `/community/post/${encodeURIComponent(listing.id)}`,
      dueAt: listing.moveInDate!.toISOString(),
      sourceUpdatedAt: listing.updatedAt.toISOString(),
    });
  }

  for (const preference of flatmateDates) {
    if (
      !isDateWithinWindow(
        preference.preferredMoveInDate,
        now,
        REMINDER_MOVE_IN_DAYS,
      ) ||
      !visibleTargetKeys.has(`FLATMATE:${preference.userId}`)
    ) {
      continue;
    }
    candidates.push({
      reminderKey: reminderKey(
        "MOVE_IN_APPROACHING",
        "FLATMATE",
        preference.userId,
      ),
      kind: "MOVE_IN_APPROACHING",
      targetType: "FLATMATE",
      targetId: preference.userId,
      title: `Move-in approaching for ${preference.user.name}`,
      description: "Review this flatmate option before the preferred move-in date.",
      href: `/flatmates/${encodeURIComponent(preference.userId)}`,
      dueAt: preference.preferredMoveInDate!.toISOString(),
      sourceUpdatedAt: preference.updatedAt.toISOString(),
    });
  }

  const sortedCandidates = sortReminderCandidates(candidates).slice(0, 100);
  if (!sortedCandidates.length) {
    await prisma.reminder.updateMany({
      where: { userId: viewerId, inactiveAt: null },
      data: { inactiveAt: now },
    });
    return { reminders: [], activeCount: 0, error: activity.error };
  }

  const keys = sortedCandidates.map(({ reminderKey }) => reminderKey);
  await prisma.reminder.updateMany({
    where: {
      userId: viewerId,
      inactiveAt: null,
      reminderKey: { notIn: keys },
    },
    data: { inactiveAt: now },
  });
  const existing = await prisma.reminder.findMany({
    where: { userId: viewerId, reminderKey: { in: keys } },
  });
  const existingByKey = new Map(
    existing.map((reminder) => [reminder.reminderKey, reminder]),
  );
  const syncOperations = sortedCandidates.map((candidate) => {
    const stored = existingByKey.get(candidate.reminderKey);
    const sourceChanged =
      !stored ||
      new Date(candidate.sourceUpdatedAt).getTime() >
        stored.sourceUpdatedAt.getTime();
    return prisma.reminder.upsert({
      where: {
        userId_reminderKey: {
          userId: viewerId,
          reminderKey: candidate.reminderKey,
        },
      },
      create: {
        ...candidate,
        userId: viewerId,
        dueAt: new Date(candidate.dueAt),
        sourceUpdatedAt: new Date(candidate.sourceUpdatedAt),
        inactiveAt: null,
      },
      update: {
        kind: candidate.kind,
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        title: candidate.title,
        description: candidate.description,
        href: candidate.href,
        dueAt: new Date(candidate.dueAt),
        sourceUpdatedAt: new Date(candidate.sourceUpdatedAt),
        inactiveAt: null,
        ...(sourceChanged ? { dismissedAt: null, snoozedUntil: null } : {}),
      },
    });
  });
  await prisma.$transaction(syncOperations);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("Reminder")
    .select(
      "id,reminderKey,kind,targetType,targetId,title,description,href,dueAt,sourceUpdatedAt,snoozedUntil,dismissedAt,createdAt",
    )
    .in("reminderKey", keys)
    .is("inactiveAt", null)
    .order("dueAt", { ascending: true });
  if (error) {
    console.error("[reminders:load] RLS read failed", {
      code: error.code,
      message: error.message,
    });
    return {
      reminders: [],
      activeCount: 0,
      error: "We could not load your reminders. Please try again.",
    };
  }

  const reminders = ((data ?? []) as ReminderItem[]).filter((reminder) =>
    isReminderVisible(reminder, now),
  );
  return {
    reminders,
    activeCount: reminders.length,
    error: activity.error,
  };
}
