"use client";

import { trackProductAnalyticsAction } from "@/app/analytics/actions";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  CheckCheck,
  CircleAlert,
  LoaderCircle,
  MessageCircle,
  MessagesSquare,
  Plus,
  Search,
  Send,
  UserRound,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SafetyActions } from "@/components/trust-safety/safety-actions";
import {
  chatInitials,
  cleanMessageBody,
  formatChatListTime,
  formatMessageTime,
  MAX_MESSAGE_LENGTH,
  mergeMessage,
  normalizeChatUsers,
  normalizeConversationRows,
  normalizeMessage,
} from "@/lib/chat";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getSafetyRestrictionMessage,
  isSafetyRestrictionError,
} from "@/lib/spam-safeguards";
import { cn } from "@/lib/utils";
import type {
  ChatConversation,
  ChatConversationRow,
  ChatIdentity,
  ChatMessage,
  ChatMessageRow,
  ChatUser,
  ChatUserRow,
} from "@/types/chat";

type RealtimeState = "connecting" | "live" | "offline";

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground ring-4 ring-secondary/30",
        className,
      )}
    >
      {chatInitials(name)}
    </span>
  );
}

export function ChatPage({
  currentUser,
  initialConversations,
  initialUsers,
  initialConversationId,
  initialUserAuthId,
  initialPostId,
}: {
  currentUser: ChatIdentity;
  initialConversations: ChatConversation[];
  initialUsers: ChatUser[];
  initialConversationId: string | null;
  initialUserAuthId: string | null;
  initialPostId: string | null;
}) {
  const validInitialConversationId =
    initialConversationId &&
    initialConversations.some(
      (conversation) => conversation.id === initialConversationId,
    )
      ? initialConversationId
      : null;
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [conversations, setConversations] = useState<ChatConversation[]>(
    initialConversations,
  );
  const [availableUsers, setAvailableUsers] =
    useState<ChatUser[]>(initialUsers);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(validInitialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(
    Boolean(validInitialConversationId),
  );
  const [isSending, setIsSending] = useState(false);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [realtimeState, setRealtimeState] =
    useState<RealtimeState>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const initialNavigationHandledRef = useRef(
    Boolean(validInitialConversationId),
  );

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );

  const refreshConversations = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_conversations");

    if (error) {
      setErrorMessage("We could not load your conversations.");
      return [];
    }

    const normalized = normalizeConversationRows(
      data as ChatConversationRow[] | null,
    );
    setConversations(normalized);
    return normalized;
  }, [supabase]);

  const loadChatUsers = useCallback(async () => {
    const { data, error } = await supabase.rpc("list_chat_users");

    if (error) {
      setErrorMessage("We could not load Roomzi members.");
      return;
    }

    setAvailableUsers(normalizeChatUsers(data as ChatUserRow[] | null));
  }, [supabase]);

  const markConversationRead = useCallback(
    async (conversationId: string) => {
      const { error } = await supabase.rpc("mark_conversation_read", {
        target_conversation_id: conversationId,
      });

      if (!error) {
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation,
          ),
        );
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    const conversationId = selectedConversationId;
    let isCurrent = true;

    async function loadMessages() {
      const { data, error } = await supabase
        .from("Message")
        .select("id,conversationId,senderId,body,createdAt")
        .eq("conversationId", conversationId)
        .order("createdAt", { ascending: true })
        .order("id", { ascending: true })
        .limit(200);

      if (!isCurrent) return;

      if (error) {
        setErrorMessage("We could not load this message history.");
        setMessages([]);
      } else {
        setMessages(((data ?? []) as ChatMessageRow[]).map(normalizeMessage));
        await markConversationRead(conversationId);
      }

      setIsLoadingMessages(false);
    }

    void loadMessages();

    return () => {
      isCurrent = false;
    };
  }, [markConversationRead, selectedConversationId, supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`private-messages-${currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Message" },
        (payload) => {
          const incoming = normalizeMessage(payload.new as ChatMessageRow);
          void refreshConversations();

          if (incoming.conversationId === selectedConversationId) {
            setMessages((current) => mergeMessage(current, incoming));

            if (incoming.senderId !== currentUser.id) {
              void markConversationRead(incoming.conversationId);
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeState("live");
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setRealtimeState("offline");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    currentUser.id,
    markConversationRead,
    refreshConversations,
    selectedConversationId,
    supabase,
  ]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectConversation = useCallback((conversationId: string) => {
    setMessages([]);
    setIsLoadingMessages(true);
    setSelectedConversationId(conversationId);
    setIsDirectoryOpen(false);
    setErrorMessage(null);
  }, []);

  const startConversation = useCallback(
    async (
      user: ChatUser,
      sourcePostId?: string | null,
      source: "chat" | "listing" | "profile" = sourcePostId
        ? "listing"
        : "chat",
    ) => {
      setIsStartingConversation(true);
      setErrorMessage(null);

      const { data, error } = await supabase.rpc("start_direct_conversation", {
        other_auth_user_id: user.authUserId,
        source_post_id: sourcePostId ?? null,
      });

      if (error || typeof data !== "string") {
        setErrorMessage("We could not start this conversation.");
        setIsStartingConversation(false);
        return;
      }

      await refreshConversations();
      setMessages([]);
      setIsLoadingMessages(true);
      setSelectedConversationId(data);
      setIsDirectoryOpen(false);
      setIsStartingConversation(false);
      void trackProductAnalyticsAction({
        name: "MESSAGE_STARTED",
        properties: {
          source,
          hasListingContext: Boolean(sourcePostId),
        },
      });
    },
    [refreshConversations, supabase],
  );

  useEffect(() => {
    if (initialNavigationHandledRef.current) return;

    if (initialUserAuthId) {
      const targetUser = availableUsers.find(
        (user) => user.authUserId === initialUserAuthId,
      );
      if (targetUser) {
        initialNavigationHandledRef.current = true;
        const navigationTimer = window.setTimeout(
          () =>
            void startConversation(
              targetUser,
              initialPostId,
              initialPostId ? "listing" : "profile",
            ),
          0,
        );
        return () => window.clearTimeout(navigationTimer);
      }
    }
  }, [
    availableUsers,
    initialPostId,
    initialUserAuthId,
    startConversation,
  ]);

  const sendMessage = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const body = cleanMessageBody(messageDraft);

    if (!selectedConversationId || !body || isSending) return;

    setIsSending(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("Message")
      .insert({
        conversationId: selectedConversationId,
        senderId: currentUser.id,
        body,
      })
      .select("id,conversationId,senderId,body,createdAt")
      .single();

    if (error || !data) {
      setErrorMessage(
        isSafetyRestrictionError(error)
          ? getSafetyRestrictionMessage("direct-message")
          : "Your message was not sent. Please try again.",
      );
      setIsSending(false);
      return;
    }

    setMessages((current) =>
      mergeMessage(current, normalizeMessage(data as ChatMessageRow)),
    );
    setMessageDraft("");
    setIsSending(false);
    void refreshConversations();
  };

  const handleComposerKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const filteredUsers = availableUsers.filter((user) => {
    const query = userSearch.trim().toLocaleLowerCase("en-IN");
    return (
      !query ||
      user.name.toLocaleLowerCase("en-IN").includes(query) ||
      user.profession?.toLocaleLowerCase("en-IN").includes(query)
    );
  });

  const handleBlockedUser = (blockedUserId: string) => {
    setAvailableUsers((current) =>
      current.filter((user) => user.id !== blockedUserId),
    );
    setConversations((current) =>
      current.filter(
        (conversation) => conversation.otherUser.id !== blockedUserId,
      ),
    );

    if (selectedConversation?.otherUser.id === blockedUserId) {
      setMessages([]);
      setSelectedConversationId(null);
      setMessageDraft("");
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <MessagesSquare aria-hidden="true" className="size-4" />
            Private messages
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            Your conversations
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            One-to-one conversations with authenticated Roomzi members.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span
            className={cn(
              "size-2 rounded-full",
              realtimeState === "live"
                ? "bg-primary"
                : realtimeState === "connecting"
                  ? "animate-pulse bg-accent-foreground"
                  : "bg-muted-foreground",
            )}
          />
          <Wifi aria-hidden="true" className="size-3.5" />
          {realtimeState === "live"
            ? "Realtime connected"
            : realtimeState === "connecting"
              ? "Connecting..."
              : "Realtime reconnecting"}
        </div>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive"
        >
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {errorMessage}
        </div>
      ) : null}

      <div className="surface-card grid min-h-[38rem] overflow-hidden p-0 lg:h-[calc(100svh-12rem)] lg:min-h-[40rem] lg:grid-cols-[21rem_1fr]">
        <aside
          aria-label="Conversations"
          className={cn(
            "min-h-[38rem] flex-col border-border/70 lg:flex lg:min-h-0 lg:border-r",
            selectedConversationId ? "hidden" : "flex",
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/70 p-4">
            <div>
              <h2 className="font-semibold">Messages</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {conversations.length} private {conversations.length === 1 ? "conversation" : "conversations"}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setIsDirectoryOpen((open) => !open);
                void loadChatUsers();
              }}
            >
              <Plus aria-hidden="true" className="size-4" />
              New
            </Button>
          </div>

          {isDirectoryOpen ? (
            <div className="border-b border-border/70 bg-muted/30 p-3">
              <label htmlFor="chat-user-search" className="sr-only">
                Search Roomzi members
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  id="chat-user-search"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Search people"
                  className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
                />
              </div>
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {filteredUsers.map((user) => (
                  <button
                    key={user.authUserId}
                    type="button"
                    disabled={isStartingConversation}
                    onClick={() => void startConversation(user)}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-background disabled:opacity-60"
                  >
                    <Avatar name={user.name} className="size-9 text-xs" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {user.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {user.profession || "Roomzi member"}
                      </span>
                    </span>
                  </button>
                ))}
                {!filteredUsers.length ? (
                  <p className="px-2 py-4 text-center text-xs leading-5 text-muted-foreground">
                    No other authenticated members found yet.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {conversations.length ? (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => selectConversation(conversation.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/20",
                    selectedConversationId === conversation.id && "bg-muted",
                  )}
                >
                  <Avatar
                    name={conversation.otherUser.name}
                    className="size-11 text-sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">
                        {conversation.otherUser.name}
                      </span>
                      <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                        {formatChatListTime(conversation.lastMessageAt)}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-xs",
                          conversation.unreadCount
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {conversation.lastMessage || "Start the conversation"}
                      </span>
                      {conversation.unreadCount ? (
                        <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] font-bold text-primary-foreground">
                          {conversation.unreadCount > 99
                            ? "99+"
                            : conversation.unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <MessageCircle aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold">No messages yet</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Choose New to start a private conversation with another
                  Roomzi member.
                </p>
              </div>
            )}
          </div>
        </aside>

        <section
          aria-label="Selected conversation"
          className={cn(
            "min-h-[38rem] min-w-0 flex-col lg:flex lg:min-h-0",
            selectedConversationId ? "flex" : "hidden",
          )}
        >
          {selectedConversation ? (
            <>
              <header className="flex items-center gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Back to conversations"
                  onClick={() => {
                    setMessages([]);
                    setSelectedConversationId(null);
                  }}
                >
                  <ArrowLeft aria-hidden="true" className="size-5" />
                </Button>
                <Avatar
                  name={selectedConversation.otherUser.name}
                  className="size-10 text-sm"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">
                    {selectedConversation.otherUser.name}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {selectedConversation.otherUser.profession ||
                      "Roomzi member"}
                  </p>
                </div>
                <span className="hidden items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-[0.6875rem] font-semibold text-secondary-foreground sm:inline-flex">
                  <CheckCheck aria-hidden="true" className="size-3.5" />
                  Private chat
                </span>
                <SafetyActions
                  target={{
                    type: "USER",
                    id: selectedConversation.otherUser.id,
                    label: "user",
                  }}
                  user={{
                    id: selectedConversation.otherUser.id,
                    name: selectedConversation.otherUser.name,
                  }}
                  onBlocked={handleBlockedUser}
                />
              </header>

              <div
                role="log"
                aria-live="polite"
                aria-label={`Messages with ${selectedConversation.otherUser.name}`}
                className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 py-5 sm:px-6"
              >
                {isLoadingMessages ? (
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                    Loading messages...
                  </div>
                ) : messages.length ? (
                  <div className="space-y-3">
                    {messages.map((message) => {
                      const isOwnMessage = message.senderId === currentUser.id;

                      return (
                        <div
                          key={message.id}
                          className={cn(
                            "flex",
                            isOwnMessage ? "justify-end" : "justify-start",
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[70%]",
                              isOwnMessage
                                ? "rounded-br-md bg-primary text-primary-foreground shadow-sm shadow-primary/10"
                                : "rounded-bl-md border border-border/70 bg-card text-foreground shadow-xs",
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words text-sm leading-6">
                              {message.body}
                            </p>
                            <p
                              title={new Date(message.createdAt).toLocaleString(
                                "en-IN",
                              )}
                              className={cn(
                                "mt-1 text-right text-[0.625rem]",
                                isOwnMessage
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground",
                              )}
                            >
                              {formatMessageTime(message.createdAt)}
                            </p>
                            {!isOwnMessage ? (
                              <div className="mt-1 flex justify-end">
                                <SafetyActions
                                  target={{
                                    type: "DIRECT_MESSAGE",
                                    id: message.id,
                                    label: "message",
                                  }}
                                  user={{
                                    id: selectedConversation.otherUser.id,
                                    name: selectedConversation.otherUser.name,
                                  }}
                                  onBlocked={handleBlockedUser}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messageEndRef} />
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                      <MessagesSquare aria-hidden="true" className="size-6" />
                    </span>
                    <h3 className="mt-4 font-semibold">Say hello</h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                      This is a private conversation between you and{" "}
                      {selectedConversation.otherUser.name}.
                    </p>
                  </div>
                )}
              </div>

              <form
                onSubmit={(event) => void sendMessage(event)}
                className="border-t border-border/70 bg-card p-3 sm:p-4"
              >
                <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2 shadow-xs focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/15">
                  <label htmlFor="message-composer" className="sr-only">
                    Message {selectedConversation.otherUser.name}
                  </label>
                  <textarea
                    id="message-composer"
                    rows={1}
                    maxLength={MAX_MESSAGE_LENGTH}
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Write a message..."
                    className="max-h-36 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!messageDraft.trim() || isSending}
                    aria-label="Send message"
                    className="shrink-0 rounded-xl"
                  >
                    {isSending ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    ) : (
                      <Send aria-hidden="true" className="size-4" />
                    )}
                  </Button>
                </div>
                <p className="mt-2 px-1 text-[0.6875rem] text-muted-foreground">
                  Enter to send · Shift + Enter for a new line
                </p>
              </form>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <UserRound aria-hidden="true" className="size-7" />
              </span>
              <h2 className="mt-5 text-xl font-semibold">Choose a conversation</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                Select someone from your messages or start a new private chat.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
