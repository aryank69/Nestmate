"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CircleAlert,
  LoaderCircle,
  MessageCircle,
  Send,
  UsersRound,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  cleanCommunityMessageBody,
  formatCommunityMessageTime,
  MAX_COMMUNITY_MESSAGE_LENGTH,
  mergeCommunityChatMessage,
  nextCommunityUnreadCount,
  normalizeCommunityChatMessage,
  normalizeCommunityChatMessages,
} from "@/lib/community-chat";
import { chatInitials } from "@/lib/chat";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  CommunityChatIdentity,
  CommunityChatMessage,
  CommunityChatMessageRow,
  CommunityChatRealtimeRow,
} from "@/types/community-chat";

type RealtimeState = "connecting" | "live" | "offline";

export function CommunityChat({
  communityId,
  locality,
  currentUser,
  isActive,
  unreadCount,
  onUnreadChange,
}: {
  communityId: string;
  locality: string;
  currentUser: CommunityChatIdentity;
  isActive: boolean;
  unreadCount: number;
  onUnreadChange: (count: number) => void;
}) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [messages, setMessages] = useState<CommunityChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [realtimeState, setRealtimeState] =
    useState<RealtimeState>("connecting");
  const isActiveRef = useRef(isActive);
  const unreadCountRef = useRef(unreadCount);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  const markRead = useCallback(async () => {
    const { error } = await supabase.rpc("mark_community_chat_read", {
      target_community_id: communityId,
    });

    if (!error) onUnreadChange(0);
  }, [communityId, onUnreadChange, supabase]);

  const hydrateMessage = useCallback(
    async (messageId: string) => {
      const { data, error } = await supabase.rpc(
        "get_community_chat_messages",
        {
          target_community_id: communityId,
          target_message_id: messageId,
        },
      );

      if (error || !data?.length) return null;
      return normalizeCommunityChatMessage(
        data[0] as CommunityChatMessageRow,
      );
    },
    [communityId, supabase],
  );

  useEffect(() => {
    let isCurrent = true;

    async function loadMessages() {
      const { data, error } = await supabase.rpc(
        "get_community_chat_messages",
        {
          target_community_id: communityId,
          target_message_id: null,
        },
      );

      if (!isCurrent) return;
      if (error) {
        setErrorMessage("We could not load this locality chat.");
      } else {
        setMessages(
          normalizeCommunityChatMessages(
            data as CommunityChatMessageRow[] | null,
          ),
        );
      }
      setIsLoading(false);
    }

    void loadMessages();

    const channel = supabase
      .channel(`locality-chat-${communityId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "CommunityMessage",
          filter: `communityId=eq.${communityId}`,
        },
        (payload) => {
          const incoming = payload.new as CommunityChatRealtimeRow;
          void hydrateMessage(incoming.id).then((message) => {
            if (!message || !isCurrent) return;
            setMessages((current) =>
              mergeCommunityChatMessage(current, message),
            );

            if (incoming.senderId !== currentUser.id) {
              const nextUnread = nextCommunityUnreadCount({
                current: unreadCountRef.current,
                isChatActive: isActiveRef.current,
                currentUserId: currentUser.id,
                senderId: incoming.senderId,
              });
              onUnreadChange(nextUnread);
              if (isActiveRef.current) void markRead();
            }
          });
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
      isCurrent = false;
      void supabase.removeChannel(channel);
    };
  }, [
    communityId,
    currentUser.id,
    hydrateMessage,
    markRead,
    onUnreadChange,
    supabase,
  ]);

  useEffect(() => {
    if (isActive) {
      void markRead();
      messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isActive, markRead]);

  useEffect(() => {
    if (isActive) {
      messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isActive, messages]);

  const sendMessage = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const body = cleanCommunityMessageBody(draft);
    if (!body || isSending) return;

    setIsSending(true);
    setErrorMessage("");
    const { data, error } = await supabase
      .from("CommunityMessage")
      .insert({
        communityId,
        senderId: currentUser.id,
        body,
      })
      .select("id")
      .single();

    if (error || !data) {
      setErrorMessage("Your message was not sent. Please try again.");
      setIsSending(false);
      return;
    }

    const message = await hydrateMessage(data.id as string);
    if (message) {
      setMessages((current) => mergeCommunityChatMessage(current, message));
    }
    setDraft("");
    setIsSending(false);
    void markRead();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <section
      hidden={!isActive}
      aria-label={`${locality} group chat`}
      className="content-shell py-8 sm:py-10"
    >
      <div className="surface-card mx-auto flex min-h-[36rem] max-w-3xl flex-col overflow-hidden p-0 sm:min-h-[42rem]">
        <header className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
          <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <UsersRound aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{locality} group chat</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Visible only to members of this locality community
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
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
            {realtimeState === "live" ? "Live" : "Connecting"}
          </div>
        </header>

        {errorMessage ? (
          <div
            role="alert"
            className="m-4 mb-0 flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive"
          >
            <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
            {errorMessage}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          {isLoading ? (
            <div className="flex h-full min-h-72 items-center justify-center text-sm text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" />
              Loading messages...
            </div>
          ) : messages.length ? (
            <div className="space-y-4">
              {messages.map((message) => {
                const isOwn = message.sender.id === currentUser.id;
                return (
                  <article
                    key={message.id}
                    className={cn(
                      "flex items-end gap-2.5",
                      isOwn && "flex-row-reverse",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[0.6875rem] font-bold text-secondary-foreground"
                    >
                      {chatInitials(message.sender.name)}
                    </span>
                    <div className={cn("max-w-[82%]", isOwn && "text-right")}>
                      <div
                        className={cn(
                          "mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5",
                          isOwn && "justify-end",
                        )}
                      >
                        <span className="text-xs font-semibold">
                          {isOwn ? "You" : message.sender.name}
                        </span>
                        {!isOwn && message.sender.profession ? (
                          <span className="text-[0.6875rem] text-muted-foreground">
                            {message.sender.profession}
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={cn(
                          "rounded-2xl px-4 py-2.5 text-left text-sm leading-6",
                          isOwn
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md border border-border/70 bg-muted/55 text-foreground",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                      </div>
                      <time
                        dateTime={message.createdAt}
                        className="mt-1 block text-[0.6875rem] text-muted-foreground"
                      >
                        {formatCommunityMessageTime(message.createdAt)}
                      </time>
                    </div>
                  </article>
                );
              })}
              <div ref={messageEndRef} />
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MessageCircle aria-hidden="true" className="size-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">Start the conversation</h3>
              <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                Ask a locality question or share a useful housing update with community members.
              </p>
            </div>
          )}
        </div>

        <form
          onSubmit={sendMessage}
          className="border-t border-border/70 bg-card/70 p-3 sm:p-4"
        >
          <label htmlFor="community-message" className="sr-only">
            Message {locality} community
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="community-message"
              rows={1}
              value={draft}
              maxLength={MAX_COMMUNITY_MESSAGE_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${locality} community`}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm leading-5 outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!cleanCommunityMessageBody(draft) || isSending}
              aria-label="Send message"
              className="size-11 shrink-0"
            >
              {isSending ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Send aria-hidden="true" className="size-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-[0.6875rem] text-muted-foreground">
            Press Enter to send · Shift+Enter for a new line
          </p>
        </form>
      </div>
    </section>
  );
}
