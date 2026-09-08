import "server-only";

import { prisma } from "@/lib/prisma";
import { moveInChecklistProgress } from "@/lib/move-in-checklist";
import type { MoveInChecklistView } from "@/types/move-in";

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function loadMoveInChecklist(
  authUserId: string,
  checklistId: string,
): Promise<MoveInChecklistView | null> {
  if (!validUuid(checklistId)) return null;
  const user = await prisma.user.findFirst({
    where: {
      authUserId,
      moderationState: { isNot: { status: "SUSPENDED" } },
    },
    select: { id: true },
  });
  if (!user) return null;

  const checklist = await prisma.moveInChecklist.findFirst({
    where: { id: checklistId, userId: user.id },
    select: {
      id: true,
      userId: true,
      targetType: true,
      postId: true,
      targetUserId: true,
      activity: {
        select: {
          userId: true,
          stage: true,
          targetType: true,
          postId: true,
          targetUserId: true,
        },
      },
      visit: {
        select: {
          requesterId: true,
          ownerId: true,
          postId: true,
          requester: { select: { name: true } },
          owner: { select: { name: true } },
          outcomes: {
            where: { userId: user.id, outcome: "FINALIZED" },
            select: { id: true },
            take: 1,
          },
        },
      },
      post: {
        select: {
          id: true,
          title: true,
          status: true,
          moderationStatus: true,
          publishedAt: true,
          authorId: true,
          author: { select: { name: true } },
          community: {
            select: {
              locality: {
                select: { name: true, city: { select: { name: true } } },
              },
            },
          },
        },
      },
      targetUser: {
        select: {
          id: true,
          name: true,
          profession: true,
          companyOrCollege: true,
          preferences: { select: { id: true } },
        },
      },
      items: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          kind: true,
          label: true,
          privateDetail: true,
          isCompleted: true,
          completedAt: true,
        },
      },
    },
  });
  if (!checklist) return null;

  const finalizedActivity = Boolean(
    checklist.activity &&
      checklist.activity.userId === user.id &&
      checklist.activity.stage === "FINALIZED" &&
      checklist.activity.targetType === checklist.targetType &&
      checklist.activity.postId === checklist.postId &&
      checklist.activity.targetUserId === checklist.targetUserId,
  );
  const finalizedVisit = Boolean(
    checklist.visit &&
      checklist.targetType === "LISTING" &&
      checklist.visit.postId === checklist.postId &&
      [checklist.visit.requesterId, checklist.visit.ownerId].includes(user.id) &&
      checklist.visit.outcomes.length,
  );
  if (!finalizedActivity && !finalizedVisit) return null;

  let counterpartId: string | null = null;
  let title = "Move-in checklist";
  let subtitle = "Finalized NestMate match";
  let counterpartName = "NestMate member";

  if (checklist.targetType === "LISTING") {
    const post = checklist.post;
    if (
      !post ||
      post.status !== "ACTIVE" ||
      post.moderationStatus !== "VISIBLE" ||
      !post.publishedAt
    ) {
      return null;
    }
    counterpartId =
      post.authorId === user.id
        ? checklist.visit?.requesterId ?? null
        : post.authorId;
    title = post.title;
    subtitle = `${post.community.locality.name}, ${post.community.locality.city.name}`;
    counterpartName =
      post.authorId === user.id
        ? checklist.visit?.requester.name ?? "Incoming resident"
        : checklist.visit?.owner.name ?? post.author.name;
  } else {
    const target = checklist.targetUser;
    if (!target?.preferences || target.id === user.id) return null;
    counterpartId = target.id;
    title = target.name;
    subtitle = [target.profession, target.companyOrCollege]
      .filter(Boolean)
      .join(" · ") || "Finalized flatmate";
    counterpartName = target.name;
  }
  if (!counterpartId) return null;

  const [block, counterpartModeration] = await Promise.all([
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blockedId: counterpartId },
          { blockerId: counterpartId, blockedId: user.id },
        ],
      },
      select: { blockerId: true },
    }),
    prisma.userModerationState.findUnique({
      where: { userId: counterpartId },
      select: { status: true },
    }),
  ]);
  if (block || counterpartModeration?.status === "SUSPENDED") return null;

  const documentSpace = await prisma.finalizedDocumentSpace.findFirst({
    where: {
      targetType: checklist.targetType,
      postId: checklist.postId,
      targetUserId: checklist.targetUserId,
      OR: [
        { participantOneId: user.id, participantTwoId: counterpartId },
        { participantOneId: counterpartId, participantTwoId: user.id },
      ],
    },
    select: { status: true },
  });

  const items = checklist.items.map((item) => ({
    ...item,
    privateDetail: item.privateDetail ?? "",
    completedAt: item.completedAt?.toISOString() ?? null,
  }));
  const progress = moveInChecklistProgress(items);
  return {
    id: checklist.id,
    targetType: checklist.targetType,
    title,
    subtitle,
    counterpartName,
    isReadOnly: documentSpace?.status === "CLOSED",
    completedCount: progress.completedCount,
    totalCount: progress.totalCount,
    items,
  };
}
