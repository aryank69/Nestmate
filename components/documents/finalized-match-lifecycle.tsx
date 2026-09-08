"use client";

import {
  Archive,
  CalendarCheck2,
  History,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
} from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  closeFinalizedMatchAction,
  reopenFinalizedMatchAction,
} from "@/app/documents/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  CLOSURE_REASONS,
  closureReasonLabel,
  finalizedMatchStatusLabel,
} from "@/lib/finalized-match";
import type {
  FinalizedDocumentSpaceView,
  MatchClosureReason,
} from "@/types/shared-documents";
import { cn } from "@/lib/utils";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function visitStatusLabel(status: string) {
  return status.toLowerCase().replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

export function FinalizedMatchLifecycle({
  space,
}: {
  space: FinalizedDocumentSpaceView;
}) {
  const router = useRouter();
  const selectableReasons = CLOSURE_REASONS.filter(
    ({ value }) => value !== "MOVE_IN_COMPLETED" || space.status === "COMPLETED",
  );
  const [reason, setReason] = useState<MatchClosureReason>(
    space.status === "COMPLETED" ? "MOVE_IN_COMPLETED" : "ARCHIVED",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const hasHousehold =
    space.status === "COMPLETED" ||
    (space.status === "CLOSED" && space.statusBeforeClose === "COMPLETED");

  const closeMatch = () => {
    if (!window.confirm("Close this match for both participants and make its history read-only?")) return;
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await closeFinalizedMatchAction({ spaceId: space.id, reason });
      if (!result.success) setError(result.message);
      else {
        setMessage(result.message);
        router.refresh();
      }
    });
  };

  const reopen = () => {
    if (!space.statusBeforeClose) return;
    if (!window.confirm("Reopen this match and return it to active progress flows?")) return;
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await reopenFinalizedMatchAction({
        spaceId: space.id,
        restoreStatus: space.statusBeforeClose === "COMPLETED" ? "COMPLETED" : "ACTIVE",
      });
      if (!result.success) setError(result.message);
      else {
        setMessage(result.message);
        router.refresh();
      }
    });
  };

  return (
    <section className="mb-5 rounded-2xl border border-border/75 bg-background p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 text-sm font-bold">
            {space.status === "CLOSED" ? (
              <LockKeyhole aria-hidden="true" className="size-4 text-slate-600" />
            ) : (
              <CalendarCheck2 aria-hidden="true" className="size-4 text-emerald-600" />
            )}
            {finalizedMatchStatusLabel(space.status)}
          </span>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
            {space.status === "CLOSED"
              ? `${closureReasonLabel(space.closureReason)} · closed ${space.closedAt ? formatDate(space.closedAt) : "recently"}. The shared record is read-only and omitted from active progress.`
              : space.status === "COMPLETED"
                ? "Both participants marked move-in complete. You can now close this match as completed."
                : "This finalized match remains active until a participant closes it or both participants complete move-in."}
          </p>
        </div>

        {space.status === "CLOSED" ? (
          space.canReopen ? (
            <Button type="button" variant="outline" onClick={reopen} disabled={pending}>
              {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <RotateCcw aria-hidden="true" className="size-4" />}
              Reopen match
            </Button>
          ) : (
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              Archived read-only
            </span>
          )
        ) : (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-64">
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as MatchClosureReason)}
              disabled={pending}
              aria-label="Reason for closing match"
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
            >
              {selectableReasons.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <Button type="button" variant="outline" onClick={closeMatch} disabled={pending}>
              {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Archive aria-hidden="true" className="size-4" />}
              Close or archive
            </Button>
          </div>
        )}
      </div>

      {space.status === "CLOSED" ? (
        <details className="mt-4 rounded-xl border border-border/70 bg-muted/15">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-xs font-semibold">
            <History aria-hidden="true" className="size-4 text-muted-foreground" />
            Read-only match history
          </summary>
          <div className="grid gap-4 border-t border-border/70 p-3.5 md:grid-cols-2">
            <div>
              <h3 className="text-xs font-bold">Status changes</h3>
              <div className="mt-2 grid gap-2">
                {space.statusChanges.length ? space.statusChanges.map((change) => (
                  <p key={change.id} className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{change.actorName}</span>{" "}
                    changed {finalizedMatchStatusLabel(change.fromStatus).toLowerCase()} to {finalizedMatchStatusLabel(change.toStatus).toLowerCase()}
                    {change.reason ? ` · ${closureReasonLabel(change.reason)}` : ""}
                    <span className="mt-0.5 block text-[0.6875rem]">{formatDate(change.createdAt)}</span>
                  </p>
                )) : <p className="text-xs text-muted-foreground">No recorded status changes.</p>}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold">Property visits</h3>
              <div className="mt-2 grid gap-2">
                {space.visits.length ? space.visits.map((visit) => (
                  <p key={visit.id} className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{visitStatusLabel(visit.status)}</span>
                    <span className="mt-0.5 block text-[0.6875rem]">
                      {formatDate(visit.scheduledAt ?? visit.createdAt)}
                    </span>
                  </p>
                )) : <p className="text-xs text-muted-foreground">No property visits are attached to this match.</p>}
              </div>
            </div>
          </div>
          <p className="border-t border-border/70 px-3.5 py-3 text-[0.6875rem] leading-4 text-muted-foreground">
            Private notes, feedback, contact details, and deleted or revoked content are not included in this history.
          </p>
        </details>
      ) : null}

      {hasHousehold ? (
        <Link
          href="/household"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}
        >
          Open private household
        </Link>
      ) : null}

      {error ? <p role="alert" className="mt-3 text-xs font-medium text-destructive">{error}</p> : null}
      {message ? <p role="status" className="mt-3 text-xs font-medium text-emerald-700">{message}</p> : null}
    </section>
  );
}
