export type SearchTeamRole = "OWNER" | "MEMBER";
export type SearchTeamInviteStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
export type SearchTeamListingStatus = "CONSIDERING" | "SHORTLISTED";
export type SearchTeamVoteChoice = "YES" | "MAYBE" | "NO";

export type SearchTeamSummary = {
  id: string;
  name: string;
  role: SearchTeamRole;
  memberCount: number;
  listingCount: number;
  updatedAt: string;
};

export type SearchTeamInviteView = {
  id: string;
  teamId: string;
  teamName: string;
  invitedByName: string;
  recipientName?: string;
  status: SearchTeamInviteStatus;
  expiresAt: string;
};

export type SearchTeamMemberView = {
  id: string;
  name: string;
  role: SearchTeamRole;
};

export type SearchTeamCommentView = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
};

export type SearchTeamVisitView = {
  id: string;
  status: "PENDING" | "PROPOSED" | "ACCEPTED";
  scheduledAt: string | null;
  sharedByName: string;
};

export type SearchTeamListingView = {
  id: string;
  title: string;
  category: "Room Available" | "PG Available";
  locality: string;
  city: string;
  priceLabel: string;
  moveInLabel: string;
  status: SearchTeamListingStatus;
  detailHref: string;
  addedByName: string;
  votes: Record<SearchTeamVoteChoice, number>;
  myVote: SearchTeamVoteChoice | null;
  comments: SearchTeamCommentView[];
  visits: SearchTeamVisitView[];
};

export type SearchTeamShareOption = {
  id: string;
  title: string;
  locality: string;
};

export type SearchTeamVisitOption = {
  id: string;
  postId: string;
  label: string;
};

export type SearchTeamHubData = {
  teams: SearchTeamSummary[];
  invites: SearchTeamInviteView[];
  error: string;
};

export type SearchTeamWorkspaceData = {
  id: string;
  name: string;
  role: SearchTeamRole;
  members: SearchTeamMemberView[];
  invites: SearchTeamInviteView[];
  listings: SearchTeamListingView[];
  shareOptions: SearchTeamShareOption[];
  visitOptions: SearchTeamVisitOption[];
  error: string;
};

export type SearchTeamActionState = {
  success: boolean;
  message: string;
  teamId?: string;
};
