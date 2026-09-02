export type NotificationType =
  | "PRIVATE_MESSAGE"
  | "COMMUNITY_MENTION"
  | "COMMUNITY_REPLY"
  | "POST_ACTIVITY";

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
