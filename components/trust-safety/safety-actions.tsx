"use client";

import { useId, useState, useTransition } from "react";
import {
  Ban,
  CheckCircle2,
  CircleAlert,
  Flag,
  LoaderCircle,
  MoreHorizontal,
  ShieldAlert,
  X,
} from "lucide-react";

import {
  blockUserAction,
  submitReportAction,
} from "@/app/trust-safety/actions";
import { Button } from "@/components/ui/button";
import { reportReasonOptions } from "@/lib/trust-safety";
import { cn } from "@/lib/utils";
import type {
  ReportReason,
  ReportTargetType,
} from "@/types/trust-safety";

type SafetyView = "menu" | "report-target" | "report-user" | "block" | "done";

export function SafetyActions({
  target,
  user,
  onBlocked,
  className,
}: {
  target: { type: ReportTargetType; id: string; label: string };
  user: { id: string; name: string };
  onBlocked?: (blockedUserId: string) => void;
  className?: string;
}) {
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<SafetyView>("menu");
  const [reason, setReason] = useState<ReportReason>("SPAM");
  const [details, setDetails] = useState("");
  const [result, setResult] = useState<{ success: boolean; message: string }>();
  const [isPending, startTransition] = useTransition();

  const close = () => {
    if (isPending) return;
    setIsOpen(false);
    setView("menu");
    setResult(undefined);
    setDetails("");
  };

  const report = () => {
    const reportingUser = view === "report-user";
    setResult(undefined);
    startTransition(async () => {
      const next = await submitReportAction({
        targetType: reportingUser ? "USER" : target.type,
        targetId: reportingUser ? user.id : target.id,
        reason,
        details,
      });
      setResult(next);
      if (next.success) setView("done");
    });
  };

  const block = () => {
    setResult(undefined);
    startTransition(async () => {
      const next = await blockUserAction(user.id);
      setResult(next);
      if (next.success) {
        setView("done");
        onBlocked?.(user.id);
      }
    });
  };

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Safety options for ${user.name}`}
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen(true);
          setView("menu");
          setResult(undefined);
        }}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </Button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-foreground/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <ShieldAlert aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="font-semibold">
                  {view === "block"
                    ? `Block ${user.name}?`
                    : view === "done"
                      ? "Thanks for letting us know"
                      : view.startsWith("report")
                        ? "Submit a report"
                        : "Safety options"}
                </h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {view === "block"
                    ? "Their posts and community messages will be hidden, and private messaging between you will stop."
                    : view === "done"
                      ? result?.message
                      : view.startsWith("report")
                        ? "Reports are private and are only visible to you."
                        : `Choose what you want to do about ${user.name}.`}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close safety options"
                onClick={close}
                disabled={isPending}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>

            {view === "menu" ? (
              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  onClick={() => setView("report-target")}
                  className="flex items-center gap-3 rounded-2xl border border-border/75 px-4 py-3 text-left transition-colors hover:bg-muted"
                >
                  <Flag aria-hidden="true" className="size-4 text-destructive" />
                  <span>
                    <span className="block text-sm font-semibold">
                      Report {target.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Privately tell us why this may be unsafe.
                    </span>
                  </span>
                </button>
                {target.type !== "USER" ? (
                  <button
                    type="button"
                    onClick={() => setView("report-user")}
                    className="flex items-center gap-3 rounded-2xl border border-border/75 px-4 py-3 text-left transition-colors hover:bg-muted"
                  >
                    <CircleAlert aria-hidden="true" className="size-4 text-destructive" />
                    <span className="text-sm font-semibold">Report {user.name}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setView("block")}
                  className="flex items-center gap-3 rounded-2xl border border-border/75 px-4 py-3 text-left transition-colors hover:bg-muted"
                >
                  <Ban aria-hidden="true" className="size-4 text-destructive" />
                  <span>
                    <span className="block text-sm font-semibold">
                      Block {user.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Hide their content and prevent private messaging.
                    </span>
                  </span>
                </button>
              </div>
            ) : null}

            {view === "report-target" || view === "report-user" ? (
              <div className="mt-5 space-y-4">
                <div className="space-y-2">
                  <label htmlFor={`${titleId}-reason`} className="text-sm font-semibold">
                    Reason
                  </label>
                  <select
                    id={`${titleId}-reason`}
                    value={reason}
                    onChange={(event) => setReason(event.target.value as ReportReason)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
                  >
                    {reportReasonOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor={`${titleId}-details`} className="text-sm font-semibold">
                    Extra details <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <textarea
                    id={`${titleId}-details`}
                    rows={4}
                    maxLength={500}
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    placeholder="Add context that may help us understand the issue."
                    className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setView("menu")} disabled={isPending}>
                    Back
                  </Button>
                  <Button type="button" variant="destructive" onClick={report} disabled={isPending} className="flex-1">
                    {isPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Flag aria-hidden="true" className="size-4" />}
                    {isPending ? "Submitting..." : "Submit Report"}
                  </Button>
                </div>
              </div>
            ) : null}

            {view === "block" ? (
              <div className="mt-5">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setView("menu")} disabled={isPending}>
                    Cancel
                  </Button>
                  <Button type="button" variant="destructive" onClick={block} disabled={isPending} className="flex-1">
                    {isPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Ban aria-hidden="true" className="size-4" />}
                    {isPending ? "Blocking..." : "Confirm Block"}
                  </Button>
                </div>
              </div>
            ) : null}

            {view === "done" ? (
              <Button type="button" onClick={close} className="mt-5 w-full">
                <CheckCircle2 aria-hidden="true" className="size-4" />
                Done
              </Button>
            ) : null}

            {result && !result.success ? (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-xs font-medium leading-5 text-destructive">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                {result.message}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
