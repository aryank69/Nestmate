export type NotificationType =
  | "PRIVATE_MESSAGE"
  | "COMMUNITY_MENTION"
  | "COMMUNITY_REPLY"
  | "POST_ACTIVITY"
  | "MODERATION_WARNING"
  | "SUPPORT_CASE_UPDATE"
  | "HOUSEHOLD_BILL"
  | "HOUSEHOLD_BUDGET";

export type NestMateNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string;
  resourceId: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string;
  resourceId: string;
  readAt: string | null;
  createdAt: string;
};
