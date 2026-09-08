"use client";

import {
  Check,
  Circle,
  Clock3,
  LoaderCircle,
  Milestone,
  ShieldAlert,
} from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateFinalizedMilestoneAction } from "@/app/documents/actions";
import {
  FINALIZED_MILESTONES,
  milestoneProgress,
  milestonesByKind,
} from "@/lib/finalized-milestones";
import { cn } from "@/lib/utils";
import type {
  FinalizedMatchMilestoneView,
  FinalizedMilestoneKind,
} from "@/types/shared-documents";

function completedLabel(value: string | null) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function FinalizedMilestones({
  spaceId,
  viewerId,
  counterpartName,
  initialMilestones,
  readOnly = false,
}: {
  spaceId: string;
  viewerId: string;
  counterpartName: string;
  initialMilestones: FinalizedMatchMilestoneView[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [milestones, setMilestones] = useState(initialMilestones);
  const [busyKind, setBusyKind] = useState<FinalizedMilestoneKind | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const grouped = milestonesByKind(milestones);
  const ownProgress = milestoneProgress(milestones, viewerId);
  const counterpartId = milestones.find(({ userId }) => userId !== viewerId)?.userId;
  const counterpartProgress = counterpartId
    ? milestoneProgress(milestones, counterpartId)
    : { completed: 0, total: FINALIZED_MILESTONES.length };

  const update = (kind: FinalizedMilestoneKind, completed: boolean) => {
    setBusyKind(kind);
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await updateFinalizedMilestoneAction({
        spaceId,
        kind,
        completed,
      });
      setBusyKind(null);
      if (!result.success) {
        setError(result.message);
        return;
      }
      const timestamp = completed ? new Date().toISOString() : null;
      setMilestones((current) =>
        current.map((milestone) =>
          milestone.userId === viewerId && milestone.kind === kind
            ? {
                ...milestone,
                status: completed ? "COMPLETED" : "PENDING",
                completedAt: timestamp,
                updatedAt: new Date().toISOString(),
              }
            : milestone,
        ),
      );
      setMessage(result.message);
      router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border border-border/75 bg-muted/15 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="flex items-center gap-2 text-sm font-bold">
            <Milestone aria-hidden="true" className="size-4 text-primary" />
            Shared agreement &amp; move-in milestones
          </span>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Each participant records their own progress. Document acknowledgements and
            related private checklist tasks can advance matching milestones automatically.
          </p>
          {readOnly ? (
            <p className="mt-2 text-xs font-semibold text-slate-600">
              Preserved as read-only match history.
            </p>
          ) : null}
        </div>
        <div className="flex gap-2 text-[0.6875rem] font-semibold">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
            You {ownProgress.completed}/{ownProgress.total}
          </span>
          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
            {counterpartName} {counterpartProgress.completed}/{counterpartProgress.total}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5 lg:grid-cols-2">
        {FINALIZED_MILESTONES.map((definition) => {
          const entries = grouped.get(definition.kind) ?? [];
          const own = entries.find(({ userId }) => userId === viewerId);
          const counterpart = entries.find(({ userId }) => userId !== viewerId);
          const ownCompleted = own?.status === "COMPLETED";
          const isBusy = pending && busyKind === definition.kind;
          return (
            <article
              key={definition.kind}
              className={cn(
                "rounded-xl border border-border/70 bg-background p-3.5",
                ownCompleted && "border-emerald-200/90 bg-emerald-50/25",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{definition.label}</h3>
                  <p className="mt-1 text-[0.6875rem] leading-4 text-muted-foreground">
                    {definition.description}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={readOnly || pending || !own}
                  onClick={() => update(definition.kind, !ownCompleted)}
                  className={cn(
                    "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[0.6875rem] font-semibold transition disabled:opacity-50",
                    ownCompleted
                      ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                      : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {isBusy ? (
                    <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                  ) : ownCompleted ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    <Circle aria-hidden="true" className="size-3.5" />
                  )}
                  {ownCompleted ? "Completed" : "Mark complete"}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[0.6875rem]">
                <div className="rounded-lg bg-muted/45 px-2.5 py-2">
                  <p className="font-semibold">You</p>
                  <p className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                    <Clock3 aria-hidden="true" className="size-3" />
                    {completedLabel(own?.completedAt ?? null)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/45 px-2.5 py-2">
                  <p className="truncate font-semibold">{counterpartName}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                    <Clock3 aria-hidden="true" className="size-3" />
                    {completedLabel(counterpart?.completedAt ?? null)}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[0.6875rem] leading-4 text-amber-900">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        Milestones are coordination records only. They are not legal proof, signatures,
        payment verification, document verification, or guarantees. Financial and document
        details stay in their existing private areas and are never copied here.
      </p>
      {error ? <p role="alert" className="mt-3 text-xs font-medium text-destructive">{error}</p> : null}
      {message ? <p role="status" className="mt-3 text-xs font-medium text-emerald-700">{message}</p> : null}
    </section>
  );
}
