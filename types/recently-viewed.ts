export type RecentViewTargetType = "POST" | "USER";

export type RecentViewInput = {
  targetType: RecentViewTargetType;
  targetId: string;
};

export type RecentViewActionState = {
  success: boolean;
  message: string;
};

export type RecentViewRow = {
  id: string;
  postId: string | null;
  viewedUserId: string | null;
  viewedAt: string;
};

export type RecentViewTarget = {
  targetId: string;
  kind: RecentViewTargetType;
  title: string;
  eyebrow: string;
  description: string;
  details: string[];
  href: string;
};

export type RecentViewItem = RecentViewTarget & {
  historyId: string;
  viewedAt: string;
  viewedAtLabel: string;
};
