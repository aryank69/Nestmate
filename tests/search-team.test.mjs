import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../prisma/migrations/20260908140000_search_team_mode/migration.sql", import.meta.url), "utf8");
const senderIndexMigration = readFileSync(new URL("../prisma/migrations/20260908141000_search_team_invite_sender_index/migration.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/teams/actions.ts", import.meta.url), "utf8");
const data = readFileSync(new URL("../lib/search-team-data.ts", import.meta.url), "utf8");
const comparison = readFileSync(new URL("../lib/search-team-comparison-data.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/teams/search-team-workspace.tsx", import.meta.url), "utf8");
const teamsPage = readFileSync(new URL("../components/teams/search-teams-page.tsx", import.meta.url), "utf8");

test("Team Mode models membership, invites, listings, votes, comments, and visit sharing", () => {
  for (const model of ["SearchTeam", "SearchTeamMember", "SearchTeamInvite", "SearchTeamListing", "SearchTeamVote", "SearchTeamComment", "SearchTeamVisit"]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
    assert.match(migration, new RegExp(`CREATE TABLE public\\."${model}"`));
    assert.match(migration, new RegExp(`ALTER TABLE public\\."${model}" ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(schema, /@@id\(\[teamId, postId, userId\]\)/);
  assert.match(schema, /@@unique\(\[teamId, recipientId\]\)/);
  assert.match(senderIndexMigration, /SearchTeamInvite_invitedById_updatedAt_idx/);
});

test("membership and invitation policies are identity-bound", () => {
  assert.match(migration, /is_search_team_member\("id"\)/);
  assert.match(migration, /"ownerId" = \(SELECT nestmate_private\.current_nestmate_user_id\(\)\)/);
  assert.match(migration, /"recipientId" = \(SELECT nestmate_private\.current_nestmate_user_id\(\)\)/);
  assert.match(migration, /invite\."status"::TEXT = 'ACCEPTED'/);
  assert.match(migration, /invite\."expiresAt" > CURRENT_TIMESTAMP/);
  assert.match(migration, /"role"::TEXT = 'MEMBER'/);
  assert.doesNotMatch(migration, /GRANT[^;]+TO anon/);
});

test("shared listing collaboration rechecks visibility, blocks, and saved ownership", () => {
  assert.match(migration, /listing\."availabilityStatus"::TEXT <> 'CLOSED'/);
  assert.match(migration, /listing\."moderationStatus"::TEXT = 'VISIBLE'/);
  assert.match(migration, /public\."UserBlock"/);
  assert.match(migration, /public\."UserModerationState"/);
  assert.match(migration, /public\."SavedPost" AS saved/);
  assert.match(migration, /"addedById" = \(SELECT nestmate_private\.current_nestmate_user_id\(\)\)/);
  assert.match(migration, /Members can cast their own votes/);
  assert.match(migration, /Members can add their own comments/);
  assert.match(actions, /\.eq\("reviewerId"|from\("SearchTeamVote"\)\.upsert/);
});

test("visit coordination exposes only an explicit privacy-safe summary", () => {
  assert.match(migration, /visit\."requesterId" = "SearchTeamVisit"\."sharedById"/);
  assert.match(migration, /visit\."status"::TEXT IN \('PENDING', 'PROPOSED', 'ACCEPTED'\)/);
  assert.match(data, /visit: \{ select: \{ id: true, status: true, scheduledAt: true \} \}/);
  assert.doesNotMatch(data, /visit[^\n]*note|counterpart|destinationLatitude|destinationLongitude/i);
  assert.match(workspace, /Notes and counterpart details stay private/);
});

test("server loaders enforce membership and per-viewer listing privacy", () => {
  assert.match(data, /teamId_userId: \{ teamId, userId \}/);
  assert.match(data, /blocksCreated: \{ none: \{ blockedId: userId \} \}/);
  assert.match(data, /blocksReceived: \{ none: \{ blockerId: userId \} \}/);
  assert.match(comparison, /teamId_userId: \{ teamId: input\.teamId, userId: input\.userId \}/);
  assert.match(comparison, /blocksCreated:[\s\S]*blocksReceived:/);
  assert.doesNotMatch(data, /dateOfBirth|budgetMin|preferredCommuteKm|destinationLabel|bio:/);
});

test("workspace provides share, vote, shortlist, comments, compare, and visits", () => {
  for (const label of ["Share a saved listing", "Shortlist", "Team comments", "Compare", "Coordinate visits", "Invite member"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /selected\.length >= 4/);
  assert.match(workspace, /addTeamListingCommentAction/);
  assert.match(workspace, /voteOnTeamListingAction/);
});

test("the create-team control submits its form", () => {
  assert.match(teamsPage, /<Button type="submit" className="mt-4 w-full"/);
});
