import "server-only";

import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canReopenFinalizedMatch } from "@/lib/finalized-match";
import type {
  DocumentAcknowledgementStatus,
  FinalizedDocumentSpaceView,
  FinalizedMilestoneKind,
  FinalizedMilestoneStatus,
  FinalizedMatchStatus,
  MatchClosureReason,
  SharedDocumentCategory,
  SharedDocumentsPageData,
} from "@/types/shared-documents";

type SpaceRow = {
  id: string;
  targetType: "LISTING" | "FLATMATE";
  postId: string | null;
  targetUserId: string | null;
  participantOneId: string;
  participantTwoId: string;
  status: FinalizedMatchStatus;
  statusBeforeClose: FinalizedMatchStatus | null;
  closureReason: MatchClosureReason | null;
  completedAt: string | null;
  closedAt: string | null;
  closedById: string | null;
  updatedAt: string;
};

type StatusChangeRow = {
  id: string;
  spaceId: string;
  actorId: string | null;
  fromStatus: FinalizedMatchStatus;
  toStatus: FinalizedMatchStatus;
  reason: MatchClosureReason | null;
  createdAt: string;
};

type DocumentRow = {
  id: string;
  spaceId: string;
  uploaderId: string;
  seriesId: string;
  versionNumber: number;
  isCurrent: boolean;
  replacesDocumentId: string | null;
  category: SharedDocumentCategory;
  objectPath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  revokedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
  acknowledgements: {
    userId: string;
    status: DocumentAcknowledgementStatus;
    updatedAt: string;
  }[];
};

type AcknowledgementRow = {
  documentId: string;
  userId: string;
  status: DocumentAcknowledgementStatus;
  updatedAt: string;
};

type MilestoneRow = {
  id: string;
  spaceId: string;
  userId: string;
  kind: FinalizedMilestoneKind;
  status: FinalizedMilestoneStatus;
  completedAt: string | null;
  updatedAt: string;
};

export async function loadSharedDocuments(
  authUserId: string,
): Promise<SharedDocumentsPageData | null> {
  const viewer = await prisma.user.findFirst({
    where: {
      authUserId,
      moderationState: { isNot: { status: "SUSPENDED" } },
    },
    select: { id: true },
  });
  if (!viewer) return null;

  const supabase = await createSupabaseServerClient();
  const { data: rawSpaces, error: spacesError } = await supabase
    .from("FinalizedDocumentSpace")
    .select(
      "id,targetType,postId,targetUserId,participantOneId,participantTwoId,status,statusBeforeClose,closureReason,completedAt,closedAt,closedById,updatedAt",
    )
    .or(`participantOneId.eq.${viewer.id},participantTwoId.eq.${viewer.id}`)
    .order("updatedAt", { ascending: false })
    .limit(50);

  if (spacesError) {
    console.error("[documents:list] Spaces unavailable", {
      code: spacesError.code,
      message: spacesError.message,
    });
    return { viewerId: viewer.id, spaces: [] };
  }

  const spaceRows = (rawSpaces ?? []) as SpaceRow[];
  if (!spaceRows.length) return { viewerId: viewer.id, spaces: [] };

  const counterpartIds = spaceRows.map((space) =>
    space.participantOneId === viewer.id
      ? space.participantTwoId
      : space.participantOneId,
  );
  const postIds = spaceRows.flatMap((space) =>
    space.postId ? [space.postId] : [],
  );
  const [
    { data: rawDocuments, error: documentsError },
    { data: rawMilestones, error: milestonesError },
    { data: rawStatusChanges, error: statusChangesError },
    counterparts,
    posts,
    visits,
  ] =
    await Promise.all([
      supabase
        .from("SharedDocument")
        .select(
          "id,spaceId,uploaderId,seriesId,versionNumber,isCurrent,replacesDocumentId,category,objectPath,originalName,mimeType,sizeBytes,revokedAt,supersededAt,createdAt",
        )
        .in("spaceId", spaceRows.map(({ id }) => id))
        .order("createdAt", { ascending: false })
        .limit(500),
      supabase
        .from("FinalizedMatchMilestone")
        .select("id,spaceId,userId,kind,status,completedAt,updatedAt")
        .in("spaceId", spaceRows.map(({ id }) => id))
        .order("updatedAt", { ascending: false })
        .limit(1000),
      supabase
        .from("FinalizedMatchStatusChange")
        .select("id,spaceId,actorId,fromStatus,toStatus,reason,createdAt")
        .in("spaceId", spaceRows.map(({ id }) => id))
        .order("createdAt", { ascending: false })
        .limit(500),
      prisma.user.findMany({
        where: { id: { in: counterpartIds } },
        select: { id: true, name: true },
      }),
      prisma.post.findMany({
        where: { id: { in: postIds } },
        select: {
          id: true,
          title: true,
          community: {
            select: {
              locality: {
                select: { name: true, city: { select: { name: true } } },
              },
            },
          },
        },
      }),
      prisma.visitRequest.findMany({
        where: {
          postId: { in: postIds },
          OR: [{ requesterId: viewer.id }, { ownerId: viewer.id }],
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          postId: true,
          requesterId: true,
          ownerId: true,
          status: true,
          scheduledAt: true,
          createdAt: true,
        },
      }),
    ]);

  if (documentsError) {
    console.error("[documents:list] Documents unavailable", {
      code: documentsError.code,
      message: documentsError.message,
    });
  }
  if (milestonesError) {
    console.error("[documents:list] Milestones unavailable", {
      code: milestonesError.code,
      message: milestonesError.message,
    });
  }
  if (statusChangesError) {
    console.error("[documents:list] Match history unavailable", {
      code: statusChangesError.code,
      message: statusChangesError.message,
    });
  }

  const bareDocuments = (rawDocuments ?? []) as Omit<DocumentRow, "acknowledgements">[];
  let acknowledgementRows: AcknowledgementRow[] = [];
  if (bareDocuments.length) {
    const { data: rawAcknowledgements, error: acknowledgementsError } = await supabase
      .from("SharedDocumentAcknowledgement")
      .select("documentId,userId,status,updatedAt")
      .in("documentId", bareDocuments.map(({ id }) => id))
      .limit(1000);
    if (acknowledgementsError) {
      console.error("[documents:list] Acknowledgements unavailable", {
        code: acknowledgementsError.code,
        message: acknowledgementsError.message,
      });
    } else {
      acknowledgementRows = (rawAcknowledgements ?? []) as AcknowledgementRow[];
    }
  }
  const acknowledgementsByDocument = new Map<string, AcknowledgementRow[]>();
  for (const acknowledgement of acknowledgementRows) {
    const current = acknowledgementsByDocument.get(acknowledgement.documentId) ?? [];
    current.push(acknowledgement);
    acknowledgementsByDocument.set(acknowledgement.documentId, current);
  }
  const documents: DocumentRow[] = bareDocuments.map((document) => ({
    ...document,
    acknowledgements: acknowledgementsByDocument.get(document.id) ?? [],
  }));
  const documentsBySpace = new Map<string, DocumentRow[]>();
  for (const document of documents) {
    const current = documentsBySpace.get(document.spaceId) ?? [];
    current.push(document);
    documentsBySpace.set(document.spaceId, current);
  }
  const milestonesBySpace = new Map<string, MilestoneRow[]>();
  for (const milestone of (rawMilestones ?? []) as MilestoneRow[]) {
    const current = milestonesBySpace.get(milestone.spaceId) ?? [];
    current.push(milestone);
    milestonesBySpace.set(milestone.spaceId, current);
  }
  const statusChangesBySpace = new Map<string, StatusChangeRow[]>();
  for (const change of (rawStatusChanges ?? []) as StatusChangeRow[]) {
    const current = statusChangesBySpace.get(change.spaceId) ?? [];
    current.push(change);
    statusChangesBySpace.set(change.spaceId, current);
  }
  const counterpartById = new Map(counterparts.map((user) => [user.id, user]));
  const postById = new Map(posts.map((post) => [post.id, post]));

  const spaces = spaceRows.map<FinalizedDocumentSpaceView | null>((space) => {
    const counterpartId =
      space.participantOneId === viewer.id
        ? space.participantTwoId
        : space.participantOneId;
    const counterpart = counterpartById.get(counterpartId);
    if (!counterpart) return null;

    const common = {
      id: space.id,
      targetType: space.targetType,
      counterpartName: counterpart.name,
      status: space.status,
      statusBeforeClose: space.statusBeforeClose,
      closureReason: space.closureReason,
      completedAt: space.completedAt,
      closedAt: space.closedAt,
      canReopen: canReopenFinalizedMatch({
        status: space.status,
        closureReason: space.closureReason,
        closedAt: space.closedAt,
        closedById: space.closedById,
        viewerId: viewer.id,
      }),
      documents: documentsBySpace.get(space.id) ?? [],
      milestones: milestonesBySpace.get(space.id) ?? [],
      statusChanges: (statusChangesBySpace.get(space.id) ?? []).map((change) => ({
        id: change.id,
        fromStatus: change.fromStatus,
        toStatus: change.toStatus,
        reason: change.reason,
        actorName:
          change.actorId === viewer.id
            ? "You"
            : change.actorId === counterpartId
              ? counterpart.name
              : "NestMate",
        createdAt: change.createdAt,
      })),
    };

    if (space.targetType === "LISTING") {
      const post = space.postId ? postById.get(space.postId) : null;
      if (!post) return null;
      return {
        ...common,
        title: post.title,
        subtitle: `${post.community.locality.name}, ${post.community.locality.city.name}`,
        visits: visits
          .filter(
            (visit) =>
              visit.postId === space.postId &&
              [visit.requesterId, visit.ownerId].includes(space.participantOneId) &&
              [visit.requesterId, visit.ownerId].includes(space.participantTwoId),
          )
          .map((visit) => ({
            id: visit.id,
            status: visit.status,
            scheduledAt: visit.scheduledAt?.toISOString() ?? null,
            createdAt: visit.createdAt.toISOString(),
          })),
      };
    }

    return {
      ...common,
      title: `Move-in with ${counterpart.name}`,
      subtitle: "Finalized flatmate match",
      visits: [],
    };
  }).filter((space): space is FinalizedDocumentSpaceView => Boolean(space));

  return { viewerId: viewer.id, spaces };
}
