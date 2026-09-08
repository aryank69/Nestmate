"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  AlarmClock,
  Check,
  CheckCheck,
  CircleAlert,
  LoaderCircle,
  LifeBuoy,
  MessageCircle,
  MessagesSquare,
  ReceiptIndianRupee,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatNotificationTime,
  mergeNotification,
  normalizeNotification,
  notificationTypeLabels,
  unreadNotificationCount,
} from "@/lib/notifications";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  NestMateNotification,
  NotificationRow,
  NotificationType,
} from "@/types/notification";

const notificationIcons: Record<NotificationType, typeof Bell> = {
  PRIVATE_MESSAGE: MessageCircle,
  COMMUNITY_MENTION: MessagesSquare,
  COMMUNITY_REPLY: MessagesSquare,
  POST_ACTIVITY: Sparkles,
  MODERATION_WARNING: ShieldCheck,
  SUPPORT_CASE_UPDATE: LifeBuoy,
  HOUSEHOLD_BILL: ReceiptIndianRupee,
  HOUSEHOLD_BUDGET: CircleAlert,
};

export function NotificationsPanel({
  initialNotifications,
  initialError,
  initialReminderCount = 0,
}: {
  initialNotifications: NestMateNotification[];
  initialError: string;
  initialReminderCount?: number;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [notifications, setNotifications] = useState(initialNotifications);
  const [error, setError] = useState(initialError);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isMarkingAll, startMarkAllTransition] = useTransition();
  const unreadCount = unreadNotificationCount(notifications);

  const loadNotifications = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("Notification")
      .select("id,type,title,body,href,resourceId,readAt,createdAt")
      .order("createdAt", { ascending: false })
      .limit(100);

    if (loadError) {
      setError("We could not refresh your notifications.");
      return;
    }

    setNotifications(
      ((data ?? []) as NotificationRow[]).map(normalizeNotification),
    );
    setError("");
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("notifications-page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Notification" },
        (payload) =>
          setNotifications((current) =>
            mergeNotification(
              current,
              normalizeNotification(payload.new as NotificationRow),
            ),
          ),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "Notification" },
        (payload) =>
          setNotifications((current) =>
            mergeNotification(
              current,
              normalizeNotification(payload.new as NotificationRow),
            ),
          ),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  const markRead = async (notification: NestMateNotification) => {
    if (notification.readAt) return true;
    setPendingId(notification.id);
    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("Notification")
      .update({ readAt })
      .eq("id", notification.id)
      .is("readAt", null);

    if (updateError) {
      setError("We could not mark that notification as read.");
      setPendingId(null);
      return false;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id ? { ...item, readAt } : item,
      ),
    );
    setPendingId(null);
    return true;
  };

  const openNotification = async (notification: NestMateNotification) => {
    const marked = await markRead(notification);
    if (marked) router.push(notification.href);
  };

  const markAllRead = () => {
    startMarkAllTransition(async () => {
      const readAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("Notification")
        .update({ readAt })
        .is("readAt", null);

      if (updateError) {
        setError("We could not mark all notifications as read.");
        return;
      }

      setNotifications((current) =>
        current.map((notification) => ({ ...notification, readAt })),
      );
      setError("");
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Bell aria-hidden="true" className="size-4" />
            Activity centre
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            Notifications
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Private messages, locality conversations, and activity on your posts.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={markAllRead}
          disabled={!unreadCount || isMarkingAll}
        >
          {isMarkingAll ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <CheckCheck aria-hidden="true" className="size-4" />
          )}
          {isMarkingAll ? "Updating..." : "Mark all as read"}
        </Button>
      </div>

      {initialReminderCount ? (
        <Link
          href="/reminders"
          className="mt-5 flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/[0.055] px-4 py-3.5 transition-colors hover:bg-primary/[0.085]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <AlarmClock aria-hidden="true" className="size-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {initialReminderCount} reminder{initialReminderCount === 1 ? "" : "s"} need attention
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Visits, follow-ups, shortlists, and move-in dates
            </span>
          </span>
          <span className="text-sm font-semibold text-primary">View</span>
        </Link>
      ) : null}

      {error ? (
        <div role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive">
          <span className="flex items-center gap-2">
            <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
            {error}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadNotifications()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="surface-card mt-6 overflow-hidden p-0">
        {notifications.length ? (
          <div className="divide-y divide-border/70">
            {notifications.map((notification) => {
              const Icon = notificationIcons[notification.type];
              const isUnread = !notification.readAt;
              const isPending = pendingId === notification.id;

              return (
                <article
                  key={notification.id}
                  className={cn(
                    "flex gap-3 p-4 transition-colors sm:gap-4 sm:p-5",
                    isUnread ? "bg-primary/[0.045]" : "bg-card",
                  )}
                >
                  <span className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full",
                    isUnread
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}>
                    <Icon aria-hidden="true" className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary">
                        {notificationTypeLabels[notification.type]}
                      </span>
                      {isUnread ? (
                        <span className="size-2 rounded-full bg-primary" aria-label="Unread" />
                      ) : null}
                    </div>
                    <h2 className="mt-1 text-sm font-semibold sm:text-base">
                      {notification.title}
                    </h2>
                    {notification.body ? (
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {notification.body}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs font-medium text-muted-foreground">
                      {formatNotificationTime(notification.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={isUnread ? "default" : "outline"}
                      onClick={() => void openNotification(notification)}
                      disabled={isPending}
                    >
                      {isPending ? (
                        <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                      ) : (
                        "Open"
                      )}
                    </Button>
                    {isUnread ? (
                      <button
                        type="button"
                        onClick={() => void markRead(notification)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        <Check aria-hidden="true" className="size-3.5" />
                        Read
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bell aria-hidden="true" className="size-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">You’re all caught up</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              New messages, locality replies, mentions, and post activity will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
