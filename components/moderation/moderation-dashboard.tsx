"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  History,
  LoaderCircle,
  LockKeyhole,
  MessageSquareWarning,
  ShieldCheck,
  ShieldOff,
  UserRoundCog,
} from "lucide-react";

import { performModerationAction } from "@/app/admin/moderation/actions";
import { ModerationSupportCases } from "@/components/moderation/moderation-support-cases";
import { Button } from "@/components/ui/button";
import {
  formatModerationTime,
  moderationActionLabels,
} from "@/lib/moderation";
import { cn } from "@/lib/utils";
import type {
  ModerationActionType,
  ModerationDashboardData,
  ModerationQueueItem,
} from "@/types/moderation";

type DashboardTab = "queue" | "support" | "restrictions" | "audit";

const severityStyles = {
  LOW: "border-border bg-muted text-muted-foreground",
  MEDIUM: "border-amber-300/60 bg-amber-50 text-amber-800",
  HIGH: "border-destructive/25 bg-destructive/8 text-destructive",
} as const;

const actionIcons: Record<ModerationActionType, typeof ShieldCheck> = {
  DISMISS: CheckCircle2,
  WARN: MessageSquareWarning,
  HIDE_CONTENT: ShieldOff,
  RESTRICT: Clock3,
  SUSPEND: Ban,
  RESTORE_USER: ShieldCheck,
  SUPPORT_CASE_UPDATE: ShieldCheck,
};

function availableActions(item: ModerationQueueItem, isAdmin: boolean) {
  return [
    "DISMISS" as const,
    "WARN" as const,
    ...(item.target.canHide ? (["HIDE_CONTENT"] as const) : []),
    "RESTRICT" as const,
    ...(isAdmin ? (["SUSPEND"] as const) : []),
  ];
}

export function ModerationDashboard({ data }: { data: ModerationDashboardData }) {
  const router = useRouter();
  const [tab, setTab] = useState<DashboardTab>("queue");
  const [selectedAction, setSelectedAction] = useState<
    Record<string, ModerationActionType>
  >({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [restrictionHours, setRestrictionHours] = useState<Record<string, number>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdmin = data.role === "ADMIN";

  const submit = (
    item: ModerationQueueItem,
    action: ModerationActionType,
  ) => {
    const reason = reasons[item.id] ?? "";
    if (
      (action === "HIDE_CONTENT" || action === "SUSPEND") &&
      !window.confirm(
        action === "SUSPEND"
          ? `Suspend ${item.subject.name}? They will be unable to post or message, and their content will be hidden.`
          : "Hide this content from NestMate members?",
      )
    ) {
      return;
    }

    setPendingId(item.id);
    setFeedback(null);
    startTransition(async () => {
      const result = await performModerationAction({
        queueType: item.queueType,
        queueId: item.id,
        action,
        reason,
        restrictionHours: restrictionHours[item.id] ?? 24,
      });
      setFeedback(result);
      setPendingId(null);
      if (result.success) router.refresh();
    });
  };

  const restoreUser = (userId: string, userName: string) => {
    if (!window.confirm(`Restore ${userName}'s NestMate access?`)) return;
    setPendingId(userId);
    setFeedback(null);
    startTransition(async () => {
      const result = await performModerationAction({
        queueType: "USER_STATE",
        queueId: userId,
        action: "RESTORE_USER",
        reason: "Admin reviewed and restored the account",
      });
      setFeedback(result);
      setPendingId(null);
      if (result.success) router.refresh();
    });
  };

  const tabs: Array<{ id: DashboardTab; label: string; count: number }> = [
    { id: "queue", label: "Review queue", count: data.queue.length },
    { id: "support", label: "Support cases", count: data.supportCases.length },
    {
      id: "restrictions",
      label: "Restrictions",
      count: data.restrictions.length,
    },
    { id: "audit", label: "Audit log", count: data.audit.length },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Restricted access · {isAdmin ? "Administrator" : "Moderator"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            Safety & moderation
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Review reports and private safety signals, take proportionate action,
            and keep a clear record of every decision.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-md">
          {[
            ["Open", data.queue.length + data.supportCases.length],
            ["Restricted", data.restrictions.length],
            ["Logged", data.audit.length],
          ].map(([label, value]) => (
            <div key={label} className="surface-card p-3 text-center">
              <p className="text-xl font-semibold">{value}</p>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {label}
              </p>
            </div>
          ))}
        </div>
      </header>

      <div className="mt-7 flex gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card p-1.5 shadow-sm">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
              tab === item.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[0.625rem]",
                tab === item.id ? "bg-white/15" : "bg-muted",
              )}
            >
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {feedback ? (
        <div
          role={feedback.success ? "status" : "alert"}
          className={cn(
            "mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium",
            feedback.success
              ? "border-primary/20 bg-primary/8 text-primary"
              : "border-destructive/25 bg-destructive/8 text-destructive",
          )}
        >
          {feedback.success ? (
            <CheckCircle2 aria-hidden="true" className="size-4" />
          ) : (
            <CircleAlert aria-hidden="true" className="size-4" />
          )}
          {feedback.message}
        </div>
      ) : null}

      {tab === "queue" ? (
        <section className="mt-6 space-y-4" aria-label="Moderation review queue">
          {data.queue.length ? (
            data.queue.map((item) => {
              const actions = availableActions(item, isAdmin);
              const action = selectedAction[item.id] ?? actions[0];
              const ActionIcon = actionIcons[action];
              const itemPending = isPending && pendingId === item.id;
              return (
                <article key={`${item.queueType}:${item.id}`} className="surface-card p-5 sm:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                          {item.sourceLabel}
                        </span>
                        <span className={cn("rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold", severityStyles[item.severity])}>
                          {item.severity.toLowerCase()} priority
                        </span>
                        {item.target.hidden ? (
                          <span className="rounded-full border border-border px-2.5 py-1 text-[0.6875rem] font-semibold text-muted-foreground">
                            Content hidden
                          </span>
                        ) : null}
                      </div>
                      <h2 className="mt-3 text-lg font-semibold">{item.headline}</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.reason}</p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-border/70 bg-muted/35 p-3.5">
                          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Account</p>
                          <p className="mt-1 text-sm font-semibold">{item.subject.name}</p>
                          {item.subject.email ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.subject.email}</p> : null}
                        </div>
                        <div className="rounded-xl border border-border/70 bg-muted/35 p-3.5">
                          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Related {item.target.type.toLowerCase().replaceAll("_", " ")}</p>
                          <p className="mt-1 text-sm font-semibold">{item.target.label}</p>
                          {item.target.excerpt ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.target.excerpt}</p> : null}
                          {item.target.href ? (
                            <Link href={item.target.href} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                              Open related item <ChevronRight aria-hidden="true" className="size-3.5" />
                            </Link>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                        <span>{formatModerationTime(item.createdAt)}</span>
                        {item.reporterName ? <span>Reported by {item.reporterName}</span> : null}
                      </div>
                      {item.internalDetails.length ? (
                        <details className="mt-4 rounded-xl border border-border/70 bg-muted/25 p-3.5">
                          <summary className="cursor-pointer text-xs font-semibold text-foreground">Private detection context</summary>
                          <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                            {item.internalDetails.map((detail) => <li key={detail}>{detail}</li>)}
                          </ul>
                        </details>
                      ) : null}
                    </div>

                    <div className="w-full rounded-2xl border border-border/70 bg-card p-4 lg:w-80 lg:shrink-0">
                      <label htmlFor={`action-${item.id}`} className="text-xs font-semibold">Action</label>
                      <select
                        id={`action-${item.id}`}
                        value={action}
                        onChange={(event) => setSelectedAction((current) => ({ ...current, [item.id]: event.target.value as ModerationActionType }))}
                        className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-3 focus:ring-ring/20"
                      >
                        {actions.map((option) => <option key={option} value={option}>{moderationActionLabels[option]}</option>)}
                      </select>
                      {action === "RESTRICT" ? (
                        <label className="mt-3 block text-xs font-semibold">
                          Duration
                          <select
                            value={restrictionHours[item.id] ?? 24}
                            onChange={(event) => setRestrictionHours((current) => ({ ...current, [item.id]: Number(event.target.value) }))}
                            className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-3 focus:ring-ring/20"
                          >
                            <option value={1}>1 hour</option>
                            <option value={6}>6 hours</option>
                            <option value={24}>24 hours</option>
                            <option value={72}>3 days</option>
                            <option value={168}>7 days</option>
                          </select>
                        </label>
                      ) : null}
                      <label htmlFor={`reason-${item.id}`} className="mt-3 block text-xs font-semibold">Private reason</label>
                      <textarea
                        id={`reason-${item.id}`}
                        rows={3}
                        maxLength={500}
                        value={reasons[item.id] ?? ""}
                        onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                        placeholder="Required for the audit log"
                        className="mt-2 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-5 outline-none focus:ring-3 focus:ring-ring/20"
                      />
                      <Button
                        type="button"
                        className="mt-3 w-full"
                        disabled={itemPending || (reasons[item.id]?.trim().length ?? 0) < 5}
                        onClick={() => submit(item, action)}
                        variant={action === "SUSPEND" || action === "HIDE_CONTENT" ? "destructive" : "default"}
                      >
                        {itemPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <ActionIcon aria-hidden="true" className="size-4" />}
                        {itemPending ? "Recording..." : moderationActionLabels[action]}
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="surface-card flex flex-col items-center px-6 py-16 text-center">
              <ShieldCheck aria-hidden="true" className="size-8 text-primary" />
              <h2 className="mt-4 text-lg font-semibold">Review queue is clear</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">New reports, safety signals, and verification issues will appear here.</p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "restrictions" ? (
        <section className="mt-6 space-y-3" aria-label="Active restrictions">
          {data.restrictions.length ? data.restrictions.map((state) => (
            <article key={state.userId} className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                {state.status === "SUSPENDED" ? <Ban aria-hidden="true" className="size-5" /> : <Clock3 aria-hidden="true" className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{state.userName}</h2>
                  <span className="rounded-full border border-destructive/20 bg-destructive/8 px-2 py-0.5 text-[0.6875rem] font-semibold text-destructive">{state.status.toLowerCase()}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{state.privateReason}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Updated by {state.updatedBy} · {formatModerationTime(state.updatedAt)}
                  {state.restrictedUntil ? ` · Until ${formatModerationTime(state.restrictedUntil)}` : ""}
                </p>
              </div>
              {isAdmin ? (
                <Button type="button" variant="outline" disabled={isPending && pendingId === state.userId} onClick={() => restoreUser(state.userId, state.userName)}>
                  {isPending && pendingId === state.userId ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <ShieldCheck aria-hidden="true" className="size-4" />}
                  Restore
                </Button>
              ) : null}
            </article>
          )) : (
            <div className="surface-card py-14 text-center">
              <UserRoundCog aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-semibold">No active restrictions</p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "support" ? (
        <ModerationSupportCases cases={data.supportCases} />
      ) : null}

      {tab === "audit" ? (
        <section className="surface-card mt-6 overflow-hidden p-0" aria-label="Moderation audit log">
          {data.audit.length ? (
            <div className="divide-y divide-border/70">
              {data.audit.map((entry) => (
                <article key={entry.id} className="flex gap-3 p-4 sm:p-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <History aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{moderationActionLabels[entry.action]}</p>
                      <span className="text-xs text-muted-foreground">by {entry.moderatorName}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{entry.subjectName} · {entry.targetType.toLowerCase().replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{entry.reason}</p>
                    <time className="mt-2 block text-[0.6875rem] font-medium text-muted-foreground" dateTime={entry.createdAt}>{formatModerationTime(entry.createdAt)}</time>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="py-14 text-center">
              <History aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-semibold">No moderation actions yet</p>
            </div>
          )}
        </section>
      ) : null}

      <aside className="mt-6 flex items-start gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3.5 text-xs leading-5 text-muted-foreground">
        <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        Detection details, reporter information, private reasons, and audit entries are visible only to authorized safety team members.
      </aside>
    </div>
  );
}
