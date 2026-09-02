export type ChatUser = {
  id: string;
  authUserId: string;
  name: string;
  profession: string | null;
};

export type ChatConversation = {
  id: string;
  otherUser: ChatUser;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type ChatIdentity = {
  id: string;
  name: string;
};

export type ChatConversationRow = {
  conversation_id: string;
  other_user_id: string;
  other_auth_user_id: string;
  other_name: string;
  other_profession: string | null;
  last_message: string | null;
  last_message_at: string;
  unread_count: number | string;
};

export type ChatUserRow = {
  user_id: string;
  auth_user_id: string;
  display_name: string;
  profession: string | null;
};

export type ChatMessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};
