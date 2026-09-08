import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { DATABASE_TO_POST_TYPE, formatCommunityAmount } from "@/lib/community";
import { prisma } from "@/lib/prisma";
import type {
  SearchTeamHubData,
  SearchTeamListingView,
  SearchTeamWorkspaceData,
  SearchTeamVoteChoice,
} from "@/types/search-team";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

const visibleListingWhere = (userId: string): Prisma.PostWhereInput => ({
  type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] },
  status: "ACTIVE",
  moderationStatus: "VISIBLE",
  availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
  publishedAt: { not: null },
  author: {
    blocksCreated: { none: { blockedId: userId } },
    blocksReceived: { none: { blockerId: userId } },
    moderationState: { isNot: { status: "SUSPENDED" } },
  },
});

export async function loadSearchTeamHub(userId: string): Promise<SearchTeamHubData> {
  try {
    const [memberships, invites] = await Promise.all([
      prisma.searchTeamMember.findMany({
        where: { userId },
        select: {
          role: true,
          team: {
            select: {
              id: true,
              name: true,
              updatedAt: true,
              _count: { select: { members: true, listings: true } },
            },
          },
        },
        orderBy: { joinedAt: "desc" },
        take: 50,
      }),
      prisma.searchTeamInvite.findMany({
        where: { recipientId: userId, status: "PENDING", expiresAt: { gt: new Date() } },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          team: { select: { id: true, name: true } },
          invitedBy: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
    ]);
    return {
      teams: memberships.map(({ role, team }) => ({
        id: team.id,
        name: team.name,
        role,
        memberCount: team._count.members,
        listingCount: team._count.listings,
        updatedAt: formatDate(team.updatedAt),
      })),
      invites: invites.map((invite) => ({
        id: invite.id,
        teamId: invite.team.id,
        teamName: invite.team.name,
        invitedByName: invite.invitedBy.name,
        status: invite.status,
        expiresAt: formatDate(invite.expiresAt),
      })),
      error: "",
    };
  } catch (error) {
    console.error("[teams:hub] Load failed", error);
    return { teams: [], invites: [], error: "We could not load your search teams." };
  }
}

export async function loadSearchTeamWorkspace(
  userId: string,
  teamId: string,
): Promise<SearchTeamWorkspaceData | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(teamId)) {
    return null;
  }
  const membership = await prisma.searchTeamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true },
  });
  if (!membership) return null;

  try {
    const team = await prisma.searchTeam.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        members: {
          select: { role: true, user: { select: { id: true, name: true } } },
          orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        },
        invites: {
          where: { status: "PENDING", expiresAt: { gt: new Date() } },
          select: {
            id: true,
            status: true,
            expiresAt: true,
            invitedBy: { select: { name: true } },
            recipient: { select: { name: true } },
          },
          orderBy: { updatedAt: "desc" },
        },
        listings: {
          where: { post: visibleListingWhere(userId) },
          select: {
            status: true,
            addedBy: { select: { name: true } },
            post: {
              select: {
                id: true,
                type: true,
                title: true,
                monthlyAmountMin: true,
                monthlyAmountMax: true,
                moveInDate: true,
                community: { select: { locality: { select: { name: true, city: { select: { name: true } } } } } },
              },
            },
            votes: { select: { userId: true, choice: true } },
            comments: {
              select: { id: true, authorId: true, body: true, createdAt: true, author: { select: { name: true } } },
              orderBy: { createdAt: "asc" },
              take: 50,
            },
            visits: {
              where: { visit: { status: { in: ["PENDING", "PROPOSED", "ACCEPTED"] } } },
              select: {
                visit: { select: { id: true, status: true, scheduledAt: true } },
                sharedBy: { select: { name: true } },
              },
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
          take: 100,
        },
      },
    });
    if (!team) return null;
    const sharedPostIds = team.listings.map(({ post }) => post.id);
    const [saved, visits] = await Promise.all([
      prisma.savedPost.findMany({
        where: {
          userId,
          postId: { notIn: sharedPostIds },
          post: visibleListingWhere(userId),
        },
        select: {
          post: { select: { id: true, title: true, community: { select: { locality: { select: { name: true } } } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      sharedPostIds.length
        ? prisma.visitRequest.findMany({
            where: { requesterId: userId, postId: { in: sharedPostIds }, status: { in: ["PENDING", "PROPOSED", "ACCEPTED"] }, searchTeamVisits: { none: { teamId } } },
            select: { id: true, postId: true, status: true, scheduledAt: true, post: { select: { title: true } } },
            orderBy: { updatedAt: "desc" },
            take: 100,
          })
        : [],
    ]);

    const listings: SearchTeamListingView[] = team.listings.map((listing) => {
      const post = listing.post;
      const category = DATABASE_TO_POST_TYPE[post.type] as "Room Available" | "PG Available";
      const voteCounts: Record<SearchTeamVoteChoice, number> = { YES: 0, MAYBE: 0, NO: 0 };
      for (const vote of listing.votes) voteCounts[vote.choice] += 1;
      return {
        id: post.id,
        title: post.title,
        category,
        locality: post.community.locality.name,
        city: post.community.locality.city.name,
        priceLabel: formatCommunityAmount(category, post.monthlyAmountMin, post.monthlyAmountMax),
        moveInLabel: post.moveInDate ? formatDate(post.moveInDate) : "Flexible",
        status: listing.status,
        detailHref: `/community/post/${encodeURIComponent(post.id)}`,
        addedByName: listing.addedBy.name,
        votes: voteCounts,
        myVote: listing.votes.find(({ userId: voterId }) => voterId === userId)?.choice ?? null,
        comments: listing.comments.map((comment) => ({
          id: comment.id,
          authorId: comment.authorId,
          authorName: comment.author.name,
          body: comment.body,
          createdAt: formatDateTime(comment.createdAt),
          isMine: comment.authorId === userId,
        })),
        visits: listing.visits.map(({ visit, sharedBy }) => ({
          id: visit.id,
          status: visit.status as "PENDING" | "PROPOSED" | "ACCEPTED",
          scheduledAt: visit.scheduledAt?.toISOString() ?? null,
          sharedByName: sharedBy.name,
        })),
      };
    });

    return {
      id: team.id,
      name: team.name,
      role: membership.role,
      members: team.members.map(({ role, user }) => ({ id: user.id, name: user.name, role })),
      invites: team.invites.map((invite) => ({
        id: invite.id,
        teamId: team.id,
        teamName: team.name,
        invitedByName: invite.invitedBy.name,
        recipientName: invite.recipient.name,
        status: invite.status,
        expiresAt: formatDate(invite.expiresAt),
      })),
      listings,
      shareOptions: saved.map(({ post }) => ({ id: post.id, title: post.title, locality: post.community.locality.name })),
      visitOptions: visits.map((visit) => ({
        id: visit.id,
        postId: visit.postId,
        label: `${visit.post.title} · ${visit.status.toLowerCase()}${visit.scheduledAt ? ` · ${formatDateTime(visit.scheduledAt)}` : ""}`,
      })),
      error: "",
    };
  } catch (error) {
    console.error("[teams:workspace] Load failed", error);
    return {
      id: teamId,
      name: "Search team",
      role: membership.role,
      members: [],
      invites: [],
      listings: [],
      shareOptions: [],
      visitOptions: [],
      error: "We could not load this team workspace.",
    };
  }
}
