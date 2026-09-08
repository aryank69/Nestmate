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
  ArrowDown,
  CircleAlert,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Reply,
  Send,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SafetyActions } from "@/components/trust-safety/safety-actions";
import {
  cleanCommunityMessageBody,
  formatCommunityMessageDate,
  formatCommunityMessageTime,
  isCommunityChatNearBottom,
  MAX_COMMUNITY_MESSAGE_LENGTH,
  mergeCommunityChatMessage,
  nextCommunityUnreadCount,
  normalizeCommunityChatMessage,
  normalizeCommunityChatMessages,
  shouldShowCommunityDateSeparator,
} from "@/lib/community-chat";
import { chatInitials } from "@/lib/chat";
import {
  getSafetyRestrictionMessage,
  isSafetyRestrictionError,
} from "@/lib/spam-safeguards";
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
  const [replyingTo, setReplyingTo] =
    useState<CommunityChatMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [realtimeState, setRealtimeState] =
    useState<RealtimeState>("connecting");
  const isActiveRef = useRef(isActive);
  const unreadCountRef = useRef(unreadCount);
  const messageViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  const isNearLatestMessage = useCallback(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) return true;

    return isCommunityChatNearBottom({
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
      clientHeight: viewport.clientHeight,
    });
  }, []);

  const scrollToLatestMessage = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const viewport = messageViewportRef.current;
      if (!viewport) return;

      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
      setNewMessageCount(0);
    },
    [],
  );

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

      if (error) {
        console.error("[community-chat:hydrate] Unable to load message", error);
        return null;
      }

      if (!data?.length) return null;
      return normalizeCommunityChatMessage(
        data[0] as CommunityChatMessageRow,
      );
    },
    [communityId, supabase],
  );

  useEffect(() => {
    let isCurrent = true;

    async function loadMessages() {
      setIsLoading(true);
      setLoadError("");
      const { data, error } = await supabase.rpc(
        "get_community_chat_messages",
        {
          target_community_id: communityId,
          target_message_id: null,
        },
      );

      if (!isCurrent) return;
      if (error) {
        console.error("[community-chat:load] Unable to load messages", error);
        setLoadError(
          "We could not load this locality chat. Check your connection and try again.",
        );
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

    return () => {
      isCurrent = false;
    };
  }, [communityId, loadAttempt, supabase]);

  useEffect(() => {
    let isCurrent = true;

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
            if (!isCurrent) return;
            if (!message) {
              setSyncError(
                "A new message could not be displayed. Refresh the chat to catch up.",
              );
              return;
            }

            const shouldFollowLatest =
              isActiveRef.current && isNearLatestMessage();
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

              if (isActiveRef.current && shouldFollowLatest) {
                void markRead();
              } else if (isActiveRef.current) {
                setNewMessageCount((current) => current + 1);
              }
            }

            if (shouldFollowLatest) {
              requestAnimationFrame(() => scrollToLatestMessage());
            }
          });
        },
      )
      .subscribe((status, error) => {
        if (!isCurrent) return;

        if (status === "SUBSCRIBED") {
          setRealtimeState("live");
          setSyncError("");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[community-chat:realtime] Subscription interrupted", {
            status,
            error,
          });
          setRealtimeState("offline");
          setSyncError(
            "Live updates are paused. Messages already loaded are still available while we reconnect.",
          );
        } else if (status === "CLOSED") {
          setRealtimeState("offline");
          setSyncError(
            "Live updates are paused. Messages already loaded are still available while we reconnect.",
          );
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
    isNearLatestMessage,
    markRead,
    onUnreadChange,
    scrollToLatestMessage,
    supabase,
  ]);

  useEffect(() => {
    if (isActive) {
      void markRead();

      if (!isLoading && !loadError) {
        requestAnimationFrame(() => scrollToLatestMessage("auto"));
      }
    }
  }, [isActive, isLoading, loadError, markRead, scrollToLatestMessage]);

  const handleMessageScroll = () => {
    if (newMessageCount > 0 && isNearLatestMessage()) {
      setNewMessageCount(0);
      void markRead();
    }
  };

  const jumpToLatestMessage = () => {
    scrollToLatestMessage();
    void markRead();
  };

  const sendMessage = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const body = cleanCommunityMessageBody(draft);
    if (!body || isSending) return;

    setIsSending(true);
    setSendError("");
    const { data, error } = await supabase
      .from("CommunityMessage")
      .insert({
        communityId,
        senderId: currentUser.id,
        replyToId: replyingTo?.id ?? null,
        body,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[community-chat:send] Unable to send message", error);
      setSendError(
        isSafetyRestrictionError(error)
          ? getSafetyRestrictionMessage("community-message")
          : "Your message was not sent. Check your connection and try again.",
      );
      setIsSending(false);
      return;
    }

    const message = await hydrateMessage(data.id as string);
    if (message) {
      setMessages((current) => mergeCommunityChatMessage(current, message));
      requestAnimationFrame(() => scrollToLatestMessage());
    } else {
      setSendError(
        "Your message was sent, but it could not be displayed yet. Refresh the chat to catch up.",
      );
    }
    setDraft("");
    setReplyingTo(null);
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
      <div className="surface-card mx-auto flex h-[70svh] min-h-[32rem] max-h-[42rem] max-w-3xl flex-col overflow-hidden p-0">
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
            {realtimeState === "live"
              ? "Live"
              : realtimeState === "connecting"
                ? "Connecting"
                : "Updates paused"}
          </div>
        </header>

        {syncError ? (
          <div
            role="alert"
            className="m-4 mb-0 flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive"
          >
            <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
            {syncError}
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <div
            ref={messageViewportRef}
            onScroll={handleMessageScroll}
            aria-busy={isLoading}
            className="h-full overflow-y-auto px-4 py-5 sm:px-5"
          >
            {isLoading ? (
              <div
                role="status"
                aria-live="polite"
                className="min-h-72 space-y-5 pt-3"
              >
                <p className="text-center text-xs font-semibold text-muted-foreground">
                  Loading messages...
                </p>
                {[false, true, false].map((isOwn, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex animate-pulse items-end gap-2.5",
                      isOwn && "flex-row-reverse",
                    )}
                  >
                    <span className="size-8 shrink-0 rounded-full bg-muted" />
                    <div
                      className={cn(
                        "w-[min(18rem,72%)] space-y-2",
                        isOwn && "items-end",
                      )}
                    >
                      <span className="block h-2.5 w-20 rounded-full bg-muted" />
                      <span className="block h-16 rounded-2xl bg-muted/80" />
                    </div>
                  </div>
                ))}
              </div>
            ) : loadError ? (
              <div
                role="alert"
                className="flex min-h-72 flex-col items-center justify-center px-6 text-center"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <CircleAlert aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold">
                  Messages are unavailable
                </h3>
                <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                  {loadError}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-5"
                  onClick={() => setLoadAttempt((current) => current + 1)}
                >
                  <RefreshCw aria-hidden="true" className="size-4" />
                  Try again
                </Button>
              </div>
            ) : messages.length ? (
              <div className="space-y-4">
                {messages.map((message, index) => {
                  const isOwn = message.sender.id === currentUser.id;
                  const dateLabel = shouldShowCommunityDateSeparator(
                    message.createdAt,
                    messages[index - 1]?.createdAt,
                  )
                    ? formatCommunityMessageDate(message.createdAt)
                    : null;

                  return (
                    <div key={message.id} className="space-y-4">
                      {dateLabel ? (
                        <div
                          role="separator"
                          aria-label={dateLabel}
                          className="flex items-center gap-3 py-1"
                        >
                          <span className="h-px flex-1 bg-border/75" />
                          <span className="rounded-full border border-border/70 bg-background px-3 py-1 text-[0.6875rem] font-semibold text-muted-foreground shadow-xs">
                            {dateLabel}
                          </span>
                          <span className="h-px flex-1 bg-border/75" />
                        </div>
                      ) : null}

                      <article
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
                        <div
                          className={cn(
                            "max-w-[82%]",
                            isOwn && "text-right",
                          )}
                        >
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
                            {message.replyTo ? (
                              <div
                                className={cn(
                                  "mb-2 rounded-xl border-l-2 px-3 py-2 text-xs",
                                  isOwn
                                    ? "border-primary-foreground/50 bg-primary-foreground/10 text-primary-foreground/80"
                                    : "border-primary/50 bg-background/70 text-muted-foreground",
                                )}
                              >
                                <p className="font-semibold">
                                  {message.replyTo.senderName}
                                </p>
                                <p className="mt-0.5 line-clamp-2">
                                  {message.replyTo.body}
                                </p>
                              </div>
                            ) : null}
                            <p className="whitespace-pre-wrap break-words">
                              {message.body}
                            </p>
                          </div>
                          <time
                            dateTime={message.createdAt}
                            className="mt-1 inline-block text-[0.6875rem] text-muted-foreground"
                          >
                            {formatCommunityMessageTime(message.createdAt)}
                          </time>
                          {!isOwn ? (
                            <span className="ml-1 inline-flex items-center align-middle">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Reply to ${message.sender.name}`}
                                onClick={() => {
                                  setReplyingTo(message);
                                  requestAnimationFrame(() =>
                                    document
                                      .getElementById("community-message")
                                      ?.focus(),
                                  );
                                }}
                              >
                                <Reply aria-hidden="true" className="size-3.5" />
                              </Button>
                              <SafetyActions
                                target={{
                                  type: "COMMUNITY_MESSAGE",
                                  id: message.id,
                                  label: "message",
                                }}
                                user={{
                                  id: message.sender.id,
                                  name: message.sender.name,
                                }}
                                onBlocked={(blockedUserId) => {
                                  setMessages((current) =>
                                    current.filter(
                                      (item) =>
                                        item.sender.id !== blockedUserId,
                                    ),
                                  );
                                  if (
                                    replyingTo?.sender.id === blockedUserId
                                  ) {
                                    setReplyingTo(null);
                                  }
                                }}
                              />
                            </span>
                          ) : null}
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <MessageCircle aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold">No messages yet</h3>
                <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                  Start with a locality question or share a useful housing update
                  with your community.
                </p>
              </div>
            )}
          </div>

          {newMessageCount > 0 ? (
            <Button
              type="button"
              size="sm"
              onClick={jumpToLatestMessage}
              aria-live="polite"
              className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 shadow-lg"
            >
              <ArrowDown aria-hidden="true" className="size-4" />
              {newMessageCount === 1
                ? "1 new message"
                : `${newMessageCount} new messages`}
            </Button>
          ) : null}
        </div>

        <form
          onSubmit={sendMessage}
          className="border-t border-border/70 bg-card/70 p-3 sm:p-4"
        >
          <label htmlFor="community-message" className="sr-only">
            Message {locality} community
          </label>
          {sendError ? (
            <p
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-xs font-medium leading-5 text-destructive"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              {sendError}
            </p>
          ) : null}
          {replyingTo ? (
            <div className="mb-3 flex items-start gap-3 rounded-xl border border-border/75 bg-muted/45 px-3 py-2.5">
              <Reply aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">
                  Replying to {replyingTo.sender.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {replyingTo.body}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cancel reply"
                onClick={() => setReplyingTo(null)}
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              id="community-message"
              rows={1}
              value={draft}
              maxLength={MAX_COMMUNITY_MESSAGE_LENGTH}
              onChange={(event) => {
                setDraft(event.target.value);
                if (sendError) setSendError("");
              }}
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
            Press Enter to send · Shift+Enter for a new line · Use @Full Name to mention someone
          </p>
        </form>
      </div>
    </section>
  );
}
