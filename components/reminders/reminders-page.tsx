"use client";

import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CircleAlert,
  Clock3,
  ContactRound,
  HeartHandshake,
  LoaderCircle,
  X,
} from "lucide-react";
import { useState, useTransition } from "react";

import { updateReminderAction } from "@/app/reminders/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { REMINDER_KIND_LABELS } from "@/lib/reminders";
import { cn } from "@/lib/utils";
import type { ReminderItem, ReminderKind } from "@/types/reminder";

const reminderIcons: Record<ReminderKind, typeof AlarmClock> = {
  UPCOMING_VISIT: CalendarClock,
  CHAT_FOLLOW_UP: ContactRound,
  SHORTLIST_IDLE: HeartHandshake,
  MOVE_IN_APPROACHING: CalendarDays,
};

function formatDue(value: string, now = new Date()) {
  const due = new Date(value);
  const sameDay = due.toDateString() === now.toDateString();
  if (sameDay) {
    return `Today at ${new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    }).format(due)}`;
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: due.getFullYear() === now.getFullYear() ? undefined : "numeric",
    ...(due.getUTCHours() || due.getUTCMinutes()
      ? { hour: "numeric", minute: "2-digit" }
      : {}),
  }).format(due);
}

export function RemindersPage({
  initialReminders,
  initialError,
}: {
  initialReminders: ReminderItem[];
  initialError: string;
}) {
  const [reminders, setReminders] = useState(initialReminders);
  const [snoozeDays, setSnoozeDays] = useState<Record<string, number>>({});
  const [error, setError] = useState(initialError);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateReminder = (
    reminder: ReminderItem,
    action: "DISMISS" | "SNOOZE",
  ) => {
    setPendingId(reminder.id);
    setError("");
    startTransition(async () => {
      const result = await updateReminderAction({
        reminderId: reminder.id,
        action,
        snoozeDays: action === "SNOOZE" ? snoozeDays[reminder.id] ?? 1 : undefined,
      });
      if (!result.success) {
        setError(result.message);
        setPendingId(null);
        return;
      }
      setReminders((current) =>
        current.filter(({ id }) => id !== reminder.id),
      );
      window.dispatchEvent(new Event("roomzi:reminders-changed"));
      setPendingId(null);
    });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.06] px-3 py-1.5 text-xs font-semibold text-primary">
            <AlarmClock aria-hidden="true" className="size-3.5" />
            Private follow-ups
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
            Reminders
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Timely prompts for visits, conversations, shortlists, and approaching
            move-in dates.
          </p>
        </div>
        <Link href="/progress" className={cn(buttonVariants({ variant: "outline" }))}>
          View progress
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </header>

      {error ? (
        <p role="alert" className="mt-5 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {reminders.length ? (
        <div className="mt-7 grid gap-4">
          {reminders.map((reminder) => {
            const ReminderIcon = reminderIcons[reminder.kind];
            const thisReminderPending = isPending && pendingId === reminder.id;
            return (
              <article key={reminder.id} className="surface-card p-5 sm:p-6">
                <div className="flex items-start gap-3.5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <ReminderIcon aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-primary">
                      {REMINDER_KIND_LABELS[reminder.kind]}
                    </p>
                    <h2 className="mt-1.5 text-lg font-semibold leading-6">
                      {reminder.title}
                    </h2>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                      {reminder.description}
                    </p>
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <Clock3 aria-hidden="true" className="size-3.5" />
                      {formatDue(reminder.dueAt)}
                    </p>
                  </div>
                </div>

                <footer className="mt-5 grid gap-2 border-t border-border/70 pt-4 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center">
                  <Link href={reminder.href} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                    Open
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                  <div className="hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Snooze ${reminder.title}`}
                      value={snoozeDays[reminder.id] ?? 1}
                      disabled={thisReminderPending}
                      onChange={(event) =>
                        setSnoozeDays((current) => ({
                          ...current,
                          [reminder.id]: Number(event.target.value),
                        }))
                      }
                      className="h-10 min-w-28 rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
                    >
                      <option value={1}>Tomorrow</option>
                      <option value={3}>3 days</option>
                      <option value={7}>1 week</option>
                    </select>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={thisReminderPending}
                      onClick={() => updateReminder(reminder, "SNOOZE")}
                    >
                      {thisReminderPending ? (
                        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                      ) : (
                        <AlarmClock aria-hidden="true" className="size-4" />
                      )}
                      Snooze
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={thisReminderPending}
                    onClick={() => updateReminder(reminder, "DISMISS")}
                  >
                    <X aria-hidden="true" className="size-4" />
                    Dismiss
                  </Button>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-7 rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <AlarmClock aria-hidden="true" className="mx-auto size-9 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Nothing needs attention</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            New reminders will appear when a visit is close, a conversation needs a
            reply, or an option is worth revisiting.
          </p>
        </div>
      )}

      <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
        Message contents, private notes, and exact private locations are never included.
        Blocked, deleted, closed, and unavailable options are hidden automatically.
      </p>
    </div>
  );
}
