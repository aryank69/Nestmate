import type {
  CommunityChatMessage,
  CommunityChatMessageRow,
} from "@/types/community-chat";

export const MAX_COMMUNITY_MESSAGE_LENGTH = 2000;

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
