import "server-only";

import { prisma } from "@/lib/prisma";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ModerationDashboardData,
  ModerationQueueItem,
  ModeratorRole,
} from "@/types/moderation";

export type ModeratorContextResult =
  | { status: "unauthenticated" }
  | { status: "unauthorized" }
  | {
      status: "authorized";
      role: ModeratorRole;
      user: { id: string; name: string };
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    };

export async function getModeratorContext(): Promise<ModeratorContextResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { status: "unauthenticated" };

  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });
  const { data: membership, error: membershipError } = await supabase
    .from("ModeratorMembership")
    .select("role")
    .eq("userId", user.id)
    .maybeSingle();

  if (membershipError || !membership) return { status: "unauthorized" };
  return {
    status: "authorized",
    role: membership.role as ModeratorRole,
    user: { id: user.id, name: user.name },
    supabase,
  };
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function privateDetailLines(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, detail]) =>
      ["string", "number", "boolean"].includes(typeof detail),
    )
    .slice(0, 8)
    .map(([key, detail]) => `${humanize(key)}: ${String(detail)}`);
}

export async function loadModerationDashboard(
  context: Extract<ModeratorContextResult, { status: "authorized" }>,
): Promise<ModerationDashboardData> {
  const [
    reports,
    flags,
    verificationChecks,
    reviews,
    supportCases,
    restrictions,
    audit,
  ] =
    await Promise.all([
      prisma.report.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          reporterId: true,
          reportedUserId: true,
          targetType: true,
          targetId: true,
          reason: true,
          details: true,
          createdAt: true,
          reporter: { select: { name: true } },
        },
      }),
      prisma.safetyFlag.findMany({
        where: { status: "OPEN" },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: 100,
        select: {
          id: true,
          actorId: true,
          targetType: true,
          targetId: true,
          category: true,
          severity: true,
          privateDetails: true,
          createdAt: true,
        },
      }),
      prisma.verificationCheck.findMany({
        where: { status: { in: ["PENDING", "REJECTED", "EXPIRED"] } },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
          id: true,
          kind: true,
          status: true,
          method: true,
          userId: true,
          postId: true,
          updatedAt: true,
        },
      }),
      prisma.moderationReview.findMany({
        orderBy: { updatedAt: "desc" },
        take: 500,
        select: { queueType: true, queueId: true },
      }),
      prisma.supportCase.findMany({
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
          id: true,
          category: true,
          subject: true,
          description: true,
          reference: true,
          status: true,
          lastResponseAt: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
          messages: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              senderRole: true,
              body: true,
              createdAt: true,
              sender: { select: { name: true } },
            },
          },
          internalNotes: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              body: true,
              createdAt: true,
              moderator: { select: { name: true } },
            },
          },
        },
      }),
      prisma.userModerationState.findMany({
        where: {
          OR: [
            { status: "SUSPENDED" },
            { status: "RESTRICTED", restrictedUntil: { gt: new Date() } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
          userId: true,
          status: true,
          restrictedUntil: true,
          privateReason: true,
          updatedAt: true,
          user: { select: { name: true, email: true } },
          updatedBy: { select: { name: true } },
        },
      }),
      prisma.moderationAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          reason: true,
          createdAt: true,
          moderator: { select: { name: true } },
          subjectUser: { select: { name: true } },
        },
      }),
    ]);

  const reviewed = new Set(
    reviews.map((review) => `${review.queueType}:${review.queueId}`),
  );
  const openReports = reports.filter(
    (report) => !reviewed.has(`REPORT:${report.id}`),
  );
  const openFlags = flags.filter(
    (flag) => !reviewed.has(`SAFETY_FLAG:${flag.id}`),
  );
  const openVerification = verificationChecks.filter(
    (check) => !reviewed.has(`VERIFICATION_CHECK:${check.id}`),
  );

  const subjectUserIds = new Set<string>([
    ...openReports.map((report) => report.reportedUserId),
    ...openFlags.map((flag) => flag.actorId),
  ]);
  const postIds = new Set<string>();
  const directMessageIds = new Set<string>();
  const communityMessageIds = new Set<string>();

  for (const item of [...openReports, ...openFlags]) {
    if (item.targetType === "POST") postIds.add(item.targetId);
    if (item.targetType === "DIRECT_MESSAGE") directMessageIds.add(item.targetId);
    if (item.targetType === "COMMUNITY_MESSAGE") {
      communityMessageIds.add(item.targetId);
    }
  }
  for (const check of openVerification) {
    if (check.userId) subjectUserIds.add(check.userId);
    if (check.postId) postIds.add(check.postId);
  }

  const [users, posts, directMessages, communityMessages] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...subjectUserIds] } },
      select: { id: true, name: true, email: true },
    }),
    prisma.post.findMany({
      where: { id: { in: [...postIds] } },
      select: {
        id: true,
        title: true,
        description: true,
        authorId: true,
        moderationStatus: true,
      },
    }),
    prisma.message.findMany({
      where: { id: { in: [...directMessageIds] } },
      select: { id: true, body: true, senderId: true, moderationStatus: true },
    }),
    prisma.communityMessage.findMany({
      where: { id: { in: [...communityMessageIds] } },
      select: { id: true, body: true, senderId: true, moderationStatus: true },
    }),
  ]);

  for (const post of posts) subjectUserIds.add(post.authorId);
  const missingUserIds = [...subjectUserIds].filter(
    (id) => !users.some((user) => user.id === id),
  );
  if (missingUserIds.length) {
    users.push(
      ...(await prisma.user.findMany({
        where: { id: { in: missingUserIds } },
        select: { id: true, name: true, email: true },
      })),
    );
  }

  const userById = new Map(users.map((user) => [user.id, user]));
  const postById = new Map(posts.map((post) => [post.id, post]));
  const directById = new Map(directMessages.map((message) => [message.id, message]));
  const communityById = new Map(
    communityMessages.map((message) => [message.id, message]),
  );

  const targetFor = (targetType: string, targetId: string) => {
    if (targetType === "POST") {
      const post = postById.get(targetId);
      return {
        type: targetType,
        id: targetId,
        label: post?.title ?? "Unavailable post",
        excerpt: post?.description.slice(0, 220) ?? null,
        href:
          post?.moderationStatus === "VISIBLE"
            ? `/community/post/${encodeURIComponent(targetId)}`
            : null,
        canHide: Boolean(post && post.moderationStatus === "VISIBLE"),
        hidden: post?.moderationStatus === "HIDDEN",
      };
    }
    if (targetType === "DIRECT_MESSAGE") {
      const message = directById.get(targetId);
      return {
        type: targetType,
        id: targetId,
        label: "Private message",
        excerpt: message?.body.slice(0, 220) ?? null,
        href: message?.moderationStatus === "VISIBLE" ? "/chat" : null,
        canHide: Boolean(message && message.moderationStatus === "VISIBLE"),
        hidden: message?.moderationStatus === "HIDDEN",
      };
    }
    if (targetType === "COMMUNITY_MESSAGE") {
      const message = communityById.get(targetId);
      return {
        type: targetType,
        id: targetId,
        label: "Locality chat message",
        excerpt: message?.body.slice(0, 220) ?? null,
        href: message?.moderationStatus === "VISIBLE" ? "/community" : null,
        canHide: Boolean(message && message.moderationStatus === "VISIBLE"),
        hidden: message?.moderationStatus === "HIDDEN",
      };
    }
    const user = userById.get(targetId);
    return {
      type: "USER",
      id: targetId,
      label: user?.name ?? "Unavailable user",
      excerpt: user?.email ?? null,
      href: user ? `/flatmates/${encodeURIComponent(targetId)}` : null,
      canHide: false,
      hidden: false,
    };
  };

  const queue: ModerationQueueItem[] = [
    ...openReports.map((report) => {
      const subject = userById.get(report.reportedUserId);
      return {
        queueType: "REPORT" as const,
        id: report.id,
        createdAt: report.createdAt.toISOString(),
        sourceLabel: "User report",
        severity: report.reason === "SAFETY_CONCERN" || report.reason === "SCAM"
          ? ("HIGH" as const)
          : ("MEDIUM" as const),
        headline: humanize(report.reason),
        reason: report.details ?? "No additional details were supplied.",
        reporterName: report.reporter.name,
        subject: {
          id: report.reportedUserId,
          name: subject?.name ?? "Unavailable user",
          email: subject?.email ?? null,
        },
        target: targetFor(report.targetType, report.targetId),
        internalDetails: [],
      };
    }),
    ...openFlags.map((flag) => {
      const subject = userById.get(flag.actorId);
      return {
        queueType: "SAFETY_FLAG" as const,
        id: flag.id,
        createdAt: flag.createdAt.toISOString(),
        sourceLabel: "Automated signal",
        severity: flag.severity,
        headline: humanize(flag.category),
        reason: "Rules-based activity requires human review.",
        reporterName: null,
        subject: {
          id: flag.actorId,
          name: subject?.name ?? "Unavailable user",
          email: subject?.email ?? null,
        },
        target: targetFor(flag.targetType, flag.targetId),
        internalDetails: privateDetailLines(flag.privateDetails),
      };
    }),
    ...openVerification.map((check) => {
      const post = check.postId ? postById.get(check.postId) : null;
      const subjectId = check.userId ?? post?.authorId ?? "";
      const subject = userById.get(subjectId);
      const target = check.postId
        ? targetFor("POST", check.postId)
        : targetFor("USER", subjectId);
      return {
        queueType: "VERIFICATION_CHECK" as const,
        id: check.id,
        createdAt: check.updatedAt.toISOString(),
        sourceLabel: "Verification issue",
        severity: check.status === "REJECTED" ? ("HIGH" as const) : ("LOW" as const),
        headline: `${humanize(check.kind)} · ${humanize(check.status)}`,
        reason: `Verification method: ${humanize(check.method)}`,
        reporterName: null,
        subject: {
          id: subjectId,
          name: subject?.name ?? "Unavailable user",
          email: subject?.email ?? null,
        },
        target,
        internalDetails: [],
      };
    }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 150);

  return {
    role: context.role,
    queue,
    supportCases: supportCases.map((supportCase) => ({
      id: supportCase.id,
      category: supportCase.category,
      subject: supportCase.subject,
      description: supportCase.description,
      reference: supportCase.reference,
      status: supportCase.status,
      lastResponseAt: supportCase.lastResponseAt?.toISOString() ?? null,
      createdAt: supportCase.createdAt.toISOString(),
      updatedAt: supportCase.updatedAt.toISOString(),
      user: supportCase.user,
      messages: supportCase.messages.map((message) => ({
        id: message.id,
        senderRole: message.senderRole,
        senderName: message.sender.name,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
      internalNotes: supportCase.internalNotes.map((note) => ({
        id: note.id,
        body: note.body,
        moderatorName: note.moderator.name,
        createdAt: note.createdAt.toISOString(),
      })),
    })),
    restrictions: restrictions.map((state) => ({
      userId: state.userId,
      userName: state.user.name,
      email: state.user.email,
      status: state.status,
      restrictedUntil: state.restrictedUntil?.toISOString() ?? null,
      privateReason: state.privateReason,
      updatedBy: state.updatedBy.name,
      updatedAt: state.updatedAt.toISOString(),
    })),
    audit: audit.map((entry) => ({
      id: entry.id,
      action: entry.action,
      moderatorName: entry.moderator.name,
      subjectName: entry.subjectUser.name,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}
