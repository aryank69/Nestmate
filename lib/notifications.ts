import type {
  NestMateNotification,
  NotificationRow,
  NotificationType,
} from "@/types/notification";

export const notificationTypeLabels: Record<NotificationType, string> = {
  PRIVATE_MESSAGE: "Private message",
  COMMUNITY_MENTION: "Community mention",
  COMMUNITY_REPLY: "Community reply",
  POST_ACTIVITY: "Post activity",
};

export function normalizeNotification(
  row: NotificationRow,
): NestMateNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    resourceId: row.resourceId,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export function mergeNotification(
  notifications: NestMateNotification[],
  incoming: NestMateNotification,
) {
  const withoutIncoming = notifications.filter(
    (notification) => notification.id !== incoming.id,
  );

  return [incoming, ...withoutIncoming].sort((first, second) => {
    const timeDifference =
      new Date(second.createdAt).getTime() -
      new Date(first.createdAt).getTime();
    return timeDifference || second.id.localeCompare(first.id);
  });
}

export function formatNotificationTime(value: string, now = new Date()) {
  const date = new Date(value);
  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - date.getTime()) / 1000),
  );

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

export function unreadNotificationCount(
  notifications: NestMateNotification[],
) {
  return notifications.filter((notification) => !notification.readAt).length;
}
