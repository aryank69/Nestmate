import type {
  CommunityChatMessage,
  CommunityChatMessageRow,
} from "@/types/community-chat";

export const MAX_COMMUNITY_MESSAGE_LENGTH = 2000;
export const COMMUNITY_CHAT_BOTTOM_THRESHOLD = 96;

export function cleanCommunityMessageBody(value: string) {
  return value.trim().slice(0, MAX_COMMUNITY_MESSAGE_LENGTH);
}

export function normalizeCommunityChatMessage(
  row: CommunityChatMessageRow,
): CommunityChatMessage {
  return {
    id: row.message_id,
    communityId: row.community_id,
    sender: {
      id: row.sender_id,
      name: row.sender_name,
      profession: row.sender_profession,
    },
    body: row.message_body,
    replyTo:
      row.reply_to_id && row.reply_sender_name && row.reply_body
        ? {
            id: row.reply_to_id,
            senderName: row.reply_sender_name,
            body: row.reply_body,
          }
        : null,
    createdAt: row.created_at,
  };
}

export function normalizeCommunityChatMessages(
  rows: CommunityChatMessageRow[] | null,
) {
  return (rows ?? [])
    .map(normalizeCommunityChatMessage)
    .sort(compareCommunityMessages);
}

export function mergeCommunityChatMessage(
  messages: CommunityChatMessage[],
  incoming: CommunityChatMessage,
) {
  if (messages.some((message) => message.id === incoming.id)) {
    return messages;
  }

  return [...messages, incoming].sort(compareCommunityMessages);
}

function compareCommunityMessages(
  first: CommunityChatMessage,
  second: CommunityChatMessage,
) {
  const timeDifference =
    new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
  return timeDifference || first.id.localeCompare(second.id);
}

export function nextCommunityUnreadCount({
  current,
  isChatActive,
  currentUserId,
  senderId,
}: {
  current: number;
  isChatActive: boolean;
  currentUserId: string;
  senderId: string;
}) {
  if (isChatActive || senderId === currentUserId) return current;
  return current + 1;
}

export function isCommunityChatNearBottom({
  scrollHeight,
  scrollTop,
  clientHeight,
  threshold = COMMUNITY_CHAT_BOTTOM_THRESHOLD,
}: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
  threshold?: number;
}) {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

function communityMessageDayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function shouldShowCommunityDateSeparator(
  currentCreatedAt: string,
  previousCreatedAt?: string,
) {
  return (
    !previousCreatedAt ||
    communityMessageDayKey(currentCreatedAt) !==
      communityMessageDayKey(previousCreatedAt)
  );
}

export function formatCommunityMessageDate(
  value: string,
  now: Date = new Date(),
) {
  const date = new Date(value);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (communityMessageDayKey(date) === communityMessageDayKey(now)) {
    return "Today";
  }

  if (communityMessageDayKey(date) === communityMessageDayKey(yesterday)) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === now.getFullYear()
      ? {}
      : { year: "numeric" }),
  }).format(date);
}

export function formatCommunityMessageTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  return new Intl.DateTimeFormat("en-IN", {
    ...(isToday
      ? { hour: "numeric", minute: "2-digit" }
      : {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        }),
  }).format(date);
}
