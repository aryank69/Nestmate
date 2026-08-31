import type {
  ChatConversation,
  ChatConversationRow,
  ChatMessage,
  ChatMessageRow,
  ChatUser,
  ChatUserRow,
} from "@/types/chat";

export const MAX_MESSAGE_LENGTH = 2000;

export function chatInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function normalizeConversationRows(
  rows: ChatConversationRow[] | null,
): ChatConversation[] {
  return (rows ?? []).map((row) => ({
    id: row.conversation_id,
    otherUser: {
      authUserId: row.other_auth_user_id,
      name: row.other_name,
      profession: row.other_profession,
    },
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    unreadCount: Math.max(0, Number(row.unread_count) || 0),
  }));
}

export function normalizeChatUsers(rows: ChatUserRow[] | null): ChatUser[] {
  return (rows ?? []).map((row) => ({
    authUserId: row.auth_user_id,
    name: row.display_name,
    profession: row.profession,
  }));
}

export function normalizeMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    body: row.body,
    createdAt: row.createdAt,
  };
}

export function mergeMessage(
  messages: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  if (messages.some((message) => message.id === incoming.id)) {
    return messages;
  }

  return [...messages, incoming].sort((first, second) => {
    const timeDifference =
      new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();

    return timeDifference || first.id.localeCompare(second.id);
  });
}

export function cleanMessageBody(value: string) {
  return value.trim().slice(0, MAX_MESSAGE_LENGTH);
}

export function formatChatListTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  return new Intl.DateTimeFormat("en-IN", {
    ...(isToday
      ? { hour: "numeric", minute: "2-digit" }
      : { day: "numeric", month: "short" }),
  }).format(date);
}

export function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
