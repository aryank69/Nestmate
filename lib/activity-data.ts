import "server-only";

import {
  activityTargetKey,
  calculateProgressMetrics,
  emptyActivityCounts,
  mergeActivitySignals,
  visitStage,
} from "@/lib/activity";
import {
  DATABASE_TO_POST_TYPE,
  formatCommunityAmount,
} from "@/lib/community";
import { loadPeopleDiscovery, DEFAULT_PEOPLE_FILTERS } from "@/lib/people-data";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ActivityData,
  ActivityFilters,
  ActivitySignal,
  InterestStage,
  ProgressVisitSignal,
} from "@/types/activity";

type ManualActivityRow = {
  targetType: "LISTING" | "FLATMATE";
  postId: string | null;
  targetUserId: string | null;
  stage: InterestStage;
  updatedAt: string;
};

type ClosedMatchRow = {
  targetType: "LISTING" | "FLATMATE";
  postId: string | null;
  targetUserId: string | null;
};

function asIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function loadActivityData(
  viewerAuthUserId: string,
  viewerId: string,
  filters: ActivityFilters,
): Promise<ActivityData> {
  const supabase = await createSupabaseServerClient();
  const [manualResult, savedResult, shortlistResult, closedResult, conversations, visits] =
    await Promise.all([
      supabase
        .from("InterestActivity")
        .select("targetType,postId,targetUserId,stage,updatedAt")
        .eq("userId", viewerId)
        .order("updatedAt", { ascending: false })
        .limit(200),
      supabase
        .from("SavedPost")
        .select("postId,createdAt")
        .eq("userId", viewerId)
        .order("createdAt", { ascending: false })
        .limit(200),
      supabase
        .from("ShortlistedProfile")
        .select("targetUserId,createdAt")
        .eq("userId", viewerId)
        .order("createdAt", { ascending: false })
        .limit(200),
      supabase
        .from("FinalizedDocumentSpace")
        .select("targetType,postId,targetUserId")
        .eq("status", "CLOSED")
        .or(`participantOneId.eq.${viewerId},participantTwoId.eq.${viewerId}`)
        .limit(200),
      prisma.conversation.findMany({
        where: {
          OR: [
            { participantOneId: viewerId },
            { participantTwoId: viewerId },
          ],
          messages: { some: {} },
        },
        select: {
          participantOneId: true,
          participantTwoId: true,
          lastMessageAt: true,
          updatedAt: true,
        },
        orderBy: { lastMessageAt: "desc" },
        take: 200,
      }),
      prisma.visitRequest.findMany({
        where: {
          requesterId: viewerId,
          owner: {
            blocksCreated: { none: { blockedId: viewerId } },
            blocksReceived: { none: { blockerId: viewerId } },
            moderationState: { isNot: { status: "SUSPENDED" } },
          },
        },
        select: {
          postId: true,
          status: true,
          requestedAt: true,
          proposedAt: true,
          scheduledAt: true,
          updatedAt: true,
          outcomes: {
            where: { userId: viewerId },
            select: { outcome: true, updatedAt: true },
            take: 1,
          },
          attendances: {
            where: { userId: viewerId },
            select: { confirmation: true, confirmedAt: true },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
    ]);

  const closedTargetKeys = new Set(
    ((closedResult.data ?? []) as ClosedMatchRow[]).flatMap((row) => {
      const targetId = row.targetType === "LISTING" ? row.postId : row.targetUserId;
      return targetId ? [`${row.targetType}:${targetId}`] : [];
    }),
  );

  const signals: ActivitySignal[] = [];
  for (const row of (manualResult.data ?? []) as ManualActivityRow[]) {
    const targetId = row.targetType === "LISTING" ? row.postId : row.targetUserId;
    if (!targetId) continue;
    signals.push({
      targetType: row.targetType,
      targetId,
      stage: row.stage,
      source: "MANUAL",
      occurredAt: row.updatedAt,
    });
  }
  for (const row of savedResult.data ?? []) {
    signals.push({
      targetType: "LISTING",
      targetId: row.postId,
      stage: "SHORTLISTED",
      source: "SAVED",
      occurredAt: row.createdAt,
    });
  }
  for (const row of shortlistResult.data ?? []) {
    signals.push({
      targetType: "FLATMATE",
      targetId: row.targetUserId,
      stage: "SHORTLISTED",
      source: "SAVED",
      occurredAt: row.createdAt,
    });
  }
  for (const conversation of conversations) {
    const targetId =
      conversation.participantOneId === viewerId
        ? conversation.participantTwoId
        : conversation.participantOneId;
    signals.push({
      targetType: "FLATMATE",
      targetId,
      stage: "CONTACTED",
      source: "CHAT",
      occurredAt: asIso(conversation.lastMessageAt ?? conversation.updatedAt),
    });
  }
  for (const visit of visits) {
    const outcome = visit.outcomes[0];
    const attendance = visit.attendances[0];
    signals.push({
      targetType: "LISTING",
      targetId: visit.postId,
      stage: visitStage({ status: visit.status, outcome: outcome?.outcome }),
      source: "VISIT",
      occurredAt: asIso(
        attendance?.confirmedAt ??
          outcome?.updatedAt ??
          visit.scheduledAt ??
          visit.proposedAt ??
          visit.updatedAt ??
          visit.requestedAt,
      ),
    });
  }

  const activeSignals = signals.filter(
    (signal) => !closedTargetKeys.has(activityTargetKey(signal)),
  );
  const merged = mergeActivitySignals(activeSignals).slice(0, 200);
  const listingIds = merged
    .filter(({ targetType }) => targetType === "LISTING")
    .map(({ targetId }) => targetId)
    .slice(0, 100);
  const flatmateIds = merged
    .filter(({ targetType }) => targetType === "FLATMATE")
    .map(({ targetId }) => targetId)
    .slice(0, 60);
  const finalizedListingIds = merged
    .filter(
      ({ targetType, stage }) =>
        targetType === "LISTING" && stage === "FINALIZED",
    )
    .map(({ targetId }) => targetId);

  const [listings, profiles, checklists] = await Promise.all([
    listingIds.length
      ? prisma.post.findMany({
          where: {
            id: { in: listingIds },
            type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] },
            status: "ACTIVE",
            moderationStatus: "VISIBLE",
            OR: [
              { availabilityStatus: { in: ["AVAILABLE", "RESERVED"] } },
              { id: { in: finalizedListingIds } },
            ],
            publishedAt: { not: null },
            authorId: { not: viewerId },
            author: {
              blocksCreated: { none: { blockedId: viewerId } },
              blocksReceived: { none: { blockerId: viewerId } },
              moderationState: { isNot: { status: "SUSPENDED" } },
            },
          },
          select: {
            id: true,
            type: true,
            title: true,
            monthlyAmountMin: true,
            monthlyAmountMax: true,
            moveInDate: true,
            author: { select: { name: true } },
            community: {
              select: {
                locality: {
                  select: {
                    name: true,
                    city: { select: { name: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    flatmateIds.length
      ? loadPeopleDiscovery(
          viewerAuthUserId,
          DEFAULT_PEOPLE_FILTERS,
          flatmateIds,
        )
      : Promise.resolve([]),
    prisma.moveInChecklist.findMany({
      where: {
        userId: viewerId,
        OR: [
          { activity: { is: { userId: viewerId, stage: "FINALIZED" } } },
          {
            visit: {
              is: {
                OR: [
                  { requesterId: viewerId },
                  { ownerId: viewerId },
                ],
                outcomes: {
                  some: { userId: viewerId, outcome: "FINALIZED" },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        targetType: true,
        postId: true,
        targetUserId: true,
      },
      take: 200,
    }),
  ]);

  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const checklistByTarget = new Map(
    checklists.flatMap((checklist) => {
      const targetId =
        checklist.targetType === "LISTING"
          ? checklist.postId
          : checklist.targetUserId;
      return targetId
        ? [[`${checklist.targetType}:${targetId}`, checklist.id] as const]
        : [];
    }),
  );
  const resolveSignal = (signal: ActivitySignal) => {
    if (signal.targetType === "LISTING") {
      const listing = listingById.get(signal.targetId);
      if (!listing) return [];
      const category = DATABASE_TO_POST_TYPE[listing.type];
      return [{
        ...signal,
        title: listing.title,
        subtitle: `${category} · ${listing.community.locality.name}, ${listing.community.locality.city.name}`,
        detail: `${formatCommunityAmount(category, listing.monthlyAmountMin, listing.monthlyAmountMax)} · ${listing.moveInDate ? `Available ${listing.moveInDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : "Flexible availability"} · Posted by ${listing.author.name}`,
        href: `/community/post/${encodeURIComponent(listing.id)}`,
        moveInChecklistId:
          checklistByTarget.get(`LISTING:${listing.id}`) ?? null,
      }];
    }

    const profile = profileById.get(signal.targetId);
    if (!profile) return [];
    return [{
      ...signal,
      title: profile.name,
      subtitle: `${profile.profession}${profile.organization ? ` · ${profile.organization}` : ""}`,
      detail: `${profile.budgetLabel} · ${profile.moveInLabel}${profile.preferredLocalities.length ? ` · ${profile.preferredLocalities.slice(0, 2).join(", ")}` : ""}`,
      href: `/flatmates/${encodeURIComponent(profile.id)}`,
      moveInChecklistId:
        checklistByTarget.get(`FLATMATE:${profile.id}`) ?? null,
    }];
  };
  const items = merged.flatMap(resolveSignal);
  const visibleTargetKeys = new Set(items.map(activityTargetKey));
  const seenTimelineEvents = new Set<string>();
  const timeline = [...activeSignals]
    .sort(
      (first, second) =>
        new Date(second.occurredAt).getTime() -
        new Date(first.occurredAt).getTime(),
    )
    .filter((signal) => visibleTargetKeys.has(activityTargetKey(signal)))
    .filter((signal) => {
      const key = `${activityTargetKey(signal)}:${signal.source}:${signal.stage}`;
      if (seenTimelineEvents.has(key)) return false;
      seenTimelineEvents.add(key);
      return true;
    })
    .flatMap(resolveSignal)
    .slice(0, 8);
  const progressVisits: ProgressVisitSignal[] = visits
    .filter((visit) => listingById.has(visit.postId))
    .map((visit) => ({
      targetId: visit.postId,
      status: visit.status,
      scheduledAt: visit.scheduledAt?.toISOString() ?? null,
      hasOutcome: Boolean(visit.outcomes[0]),
      attendanceConfirmation: visit.attendances[0]?.confirmation ?? null,
    }));
  const progress = calculateProgressMetrics(items, progressVisits);

  const counts = emptyActivityCounts();
  for (const item of items) counts[item.stage] += 1;
  const filteredItems = items.filter(
    (item) =>
      (!filters.stage || item.stage === filters.stage) &&
      (!filters.targetType || item.targetType === filters.targetType),
  );
  const errors = [
    manualResult.error,
    savedResult.error,
    shortlistResult.error,
    closedResult.error,
  ]
    .filter(Boolean)
    .map((entry) => entry!.message);

  return {
    items: filteredItems,
    timeline,
    progress,
    counts,
    error: errors.length
      ? "Some activity signals could not be loaded. Your visible results are still private."
      : "",
  };
}
