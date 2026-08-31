export type CommunityChatIdentity = {
  id: string;
  name: string;
};

export type CommunityChatMessage = {
  id: string;
  communityId: string;
  sender: {
    id: string;
    name: string;
    profession: string | null;
  };
  body: string;
  createdAt: string;
};

export type CommunityChatMessageRow = {
  message_id: string;
  community_id: string;
  sender_id: string;
  sender_name: string;
  sender_profession: string | null;
  message_body: string;
  created_at: string;
};

export type CommunityChatRealtimeRow = {
  id: string;
  communityId: string;
  senderId: string;
  body: string;
  createdAt: string;
};
