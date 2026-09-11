"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  SearchTeamActionState,
  SearchTeamInviteStatus,
  SearchTeamListingStatus,
  SearchTeamVoteChoice,
} from "@/types/search-team";

async function authenticatedTeamContext() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name: metadata && typeof metadata.full_name === "string" ? metadata.full_name : null,
  });
  return { supabase, user };
}

function validUuid(value: string) {
  const id = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function validPostId(value: string) {
  const id = value.trim();
  return id && id.length <= 128 ? id : null;
}

function refreshTeam(teamId?: string) {
  revalidatePath("/teams");
  if (teamId) revalidatePath(`/teams/${teamId}`);
}

function writeFailure(error: { code?: string; message?: string } | null, fallback: string) {
  console.error("[teams] Write failed", { code: error?.code, message: error?.message });
  return error?.code === "42501" || error?.code === "PGRST116"
    ? "You no longer have permission to make that team change."
    : fallback;
}

export async function createSearchTeamAction(input: { name: string }): Promise<SearchTeamActionState> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > 80) {
    return { success: false, message: "Use a team name between 2 and 80 characters." };
  }
  const context = await authenticatedTeamContext();
  if (!context) return { success: false, message: "Please log in to create a search team." };
  const teamId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error: teamError } = await context.supabase.from("SearchTeam").insert({
    id: teamId,
    name,
    ownerId: context.user.id,
    createdAt: now,
    updatedAt: now,
  });
  if (teamError) return { success: false, message: writeFailure(teamError, "We could not create your team.") };
  const { error: memberError } = await context.supabase.from("SearchTeamMember").insert({
    teamId,
    userId: context.user.id,
    role: "OWNER",
    joinedAt: now,
  });
  if (memberError) {
    await context.supabase.from("SearchTeam").delete().eq("id", teamId).eq("ownerId", context.user.id);
    return { success: false, message: writeFailure(memberError, "We could not finish creating your team.") };
  }
  refreshTeam(teamId);
  return { success: true, message: "Your private search team is ready.", teamId };
}

export async function inviteSearchTeamMemberAction(input: {
  teamId: string;
  email: string;
}): Promise<SearchTeamActionState> {
  const teamId = validUuid(input.teamId);
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!teamId || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return { success: false, message: "Enter a valid Roomzi account email." };
  }
  const context = await authenticatedTeamContext();
  if (!context) return { success: false, message: "Please log in to invite a teammate." };
  const recipient = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!recipient || recipient.id === context.user.id) {
    return { success: false, message: "Choose another existing Roomzi member." };
  }
  const now = new Date();
  const existing = await prisma.searchTeamInvite.findUnique({
    where: { teamId_recipientId: { teamId, recipientId: recipient.id } },
    select: { id: true },
  });
  const values = {
    invitedById: context.user.id,
    status: "PENDING" as const,
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString(),
    acceptedAt: null,
    updatedAt: now.toISOString(),
  };
  const request = existing
    ? context.supabase.from("SearchTeamInvite").update(values).eq("id", existing.id)
    : context.supabase.from("SearchTeamInvite").insert({
        id: crypto.randomUUID(),
        teamId,
        recipientId: recipient.id,
        ...values,
        createdAt: now.toISOString(),
      });
  const { error } = await request;
  if (error) return { success: false, message: writeFailure(error, "We could not send that invitation.") };
  refreshTeam(teamId);
  return { success: true, message: "Invitation sent. It expires in seven days." };
}

export async function respondSearchTeamInviteAction(input: {
  inviteId: string;
  response: "ACCEPT" | "DECLINE";
}): Promise<SearchTeamActionState> {
  const inviteId = validUuid(input.inviteId);
  if (!inviteId || !["ACCEPT", "DECLINE"].includes(input.response)) {
    return { success: false, message: "This invitation response is invalid." };
  }
  const context = await authenticatedTeamContext();
  if (!context) return { success: false, message: "Please log in to respond." };
  const invite = await prisma.searchTeamInvite.findFirst({
    where: { id: inviteId, recipientId: context.user.id, status: "PENDING", expiresAt: { gt: new Date() } },
    select: { id: true, teamId: true },
  });
  if (!invite) return { success: false, message: "This invitation is unavailable or expired." };
  const status: SearchTeamInviteStatus = input.response === "ACCEPT" ? "ACCEPTED" : "DECLINED";
  const { data, error } = await context.supabase
    .from("SearchTeamInvite")
    .update({ status, acceptedAt: status === "ACCEPTED" ? new Date().toISOString() : null, updatedAt: new Date().toISOString() })
    .eq("id", invite.id)
    .eq("recipientId", context.user.id)
    .select("teamId")
    .maybeSingle();
  if (error || !data) return { success: false, message: writeFailure(error, "We could not update that invitation.") };
  if (status === "ACCEPTED") {
    const { error: joinError } = await context.supabase.from("SearchTeamMember").insert({
      teamId: invite.teamId,
      userId: context.user.id,
      role: "MEMBER",
      joinedAt: new Date().toISOString(),
    });
    if (joinError && joinError.code !== "23505") {
      return { success: false, message: writeFailure(joinError, "The invitation was accepted, but joining needs another try.") };
    }
  }
  refreshTeam(invite.teamId);
  return { success: true, message: status === "ACCEPTED" ? "You joined the search team." : "Invitation declined.", teamId: invite.teamId };
}

export async function leaveSearchTeamAction(input: { teamId: string }): Promise<SearchTeamActionState> {
  const teamId = validUuid(input.teamId);
  const context = await authenticatedTeamContext();
  if (!teamId || !context) return { success: false, message: "Please log in to leave this team." };
  const { data, error } = await context.supabase
    .from("SearchTeamMember").delete().eq("teamId", teamId).eq("userId", context.user.id).eq("role", "MEMBER").select("teamId").maybeSingle();
  if (error || !data) return { success: false, message: writeFailure(error, "Team owners must delete the team instead of leaving it.") };
  refreshTeam(teamId);
  return { success: true, message: "You left the search team." };
}

export async function removeSearchTeamMemberAction(input: { teamId: string; userId: string }): Promise<SearchTeamActionState> {
  const teamId = validUuid(input.teamId);
  const userId = validPostId(input.userId);
  const context = await authenticatedTeamContext();
  if (!teamId || !userId || !context) return { success: false, message: "That member cannot be removed." };
  const { data, error } = await context.supabase
    .from("SearchTeamMember").delete().eq("teamId", teamId).eq("userId", userId).eq("role", "MEMBER").select("teamId").maybeSingle();
  if (error || !data) return { success: false, message: writeFailure(error, "Only the team owner can remove another member.") };
  refreshTeam(teamId);
  return { success: true, message: "Member removed from the team." };
}

export async function shareSavedListingWithTeamAction(input: { teamId: string; postId: string }): Promise<SearchTeamActionState> {
  const teamId = validUuid(input.teamId);
  const postId = validPostId(input.postId);
  const context = await authenticatedTeamContext();
  if (!teamId || !postId || !context) return { success: false, message: "Choose a valid saved listing." };
  const now = new Date().toISOString();
  const { error } = await context.supabase.from("SearchTeamListing").insert({
    teamId, postId, addedById: context.user.id, status: "CONSIDERING", createdAt: now, updatedAt: now,
  });
  if (error) return { success: false, message: error.code === "23505" ? "That listing is already in the team workspace." : writeFailure(error, "We could not share that saved listing.") };
  refreshTeam(teamId);
  return { success: true, message: "Saved listing shared with the team." };
}

export async function updateTeamListingStatusAction(input: { teamId: string; postId: string; status: SearchTeamListingStatus }): Promise<SearchTeamActionState> {
  const teamId = validUuid(input.teamId);
  const postId = validPostId(input.postId);
  if (!teamId || !postId || !["CONSIDERING", "SHORTLISTED"].includes(input.status)) return { success: false, message: "Choose a valid shortlist status." };
  const context = await authenticatedTeamContext();
  if (!context) return { success: false, message: "Please log in to update the shortlist." };
  const { data, error } = await context.supabase.from("SearchTeamListing").update({ status: input.status, updatedAt: new Date().toISOString() }).eq("teamId", teamId).eq("postId", postId).select("postId").maybeSingle();
  if (error || !data) return { success: false, message: writeFailure(error, "We could not update the team shortlist.") };
  refreshTeam(teamId);
  return { success: true, message: input.status === "SHORTLISTED" ? "Added to the team shortlist." : "Moved back to considering." };
}

export async function voteOnTeamListingAction(input: { teamId: string; postId: string; choice: SearchTeamVoteChoice }): Promise<SearchTeamActionState> {
  const teamId = validUuid(input.teamId);
  const postId = validPostId(input.postId);
  if (!teamId || !postId || !["YES", "MAYBE", "NO"].includes(input.choice)) return { success: false, message: "Choose a valid vote." };
  const context = await authenticatedTeamContext();
  if (!context) return { success: false, message: "Please log in to vote." };
  const now = new Date().toISOString();
  const { error } = await context.supabase.from("SearchTeamVote").upsert({
    teamId, postId, userId: context.user.id, choice: input.choice, createdAt: now, updatedAt: now,
  }, { onConflict: "teamId,postId,userId" });
  if (error) return { success: false, message: writeFailure(error, "We could not save your vote.") };
  refreshTeam(teamId);
  return { success: true, message: "Your team vote was saved." };
}

export async function addTeamListingCommentAction(input: { teamId: string; postId: string; body: string }): Promise<SearchTeamActionState> {
  const teamId = validUuid(input.teamId);
  const postId = validPostId(input.postId);
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!teamId || !postId || !body || body.length > 1000) return { success: false, message: "Write a comment between 1 and 1000 characters." };
  const context = await authenticatedTeamContext();
  if (!context) return { success: false, message: "Please log in to comment." };
  const now = new Date().toISOString();
  const { error } = await context.supabase.from("SearchTeamComment").insert({
    id: crypto.randomUUID(), teamId, postId, authorId: context.user.id, body, createdAt: now, updatedAt: now,
  });
  if (error) return { success: false, message: writeFailure(error, "We could not add your comment.") };
  refreshTeam(teamId);
  return { success: true, message: "Comment added for your team." };
}

export async function shareVisitWithTeamAction(input: { teamId: string; visitId: string }): Promise<SearchTeamActionState> {
  const teamId = validUuid(input.teamId);
  const visitId = validUuid(input.visitId);
  const context = await authenticatedTeamContext();
  if (!teamId || !visitId || !context) return { success: false, message: "Choose a valid visit." };
  const visit = await prisma.visitRequest.findFirst({
    where: { id: visitId, requesterId: context.user.id, status: { in: ["PENDING", "PROPOSED", "ACCEPTED"] } },
    select: { postId: true },
  });
  if (!visit) return { success: false, message: "Only your active visit can be shared." };
  const { error } = await context.supabase.from("SearchTeamVisit").insert({
    teamId, visitId, postId: visit.postId, sharedById: context.user.id, createdAt: new Date().toISOString(),
  });
  if (error) return { success: false, message: error.code === "23505" ? "That visit is already shared with the team." : writeFailure(error, "We could not share that visit.") };
  refreshTeam(teamId);
  return { success: true, message: "A privacy-safe visit summary was shared." };
}
