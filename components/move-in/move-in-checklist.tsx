"use client";

import {
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  FileCheck2,
  Files,
  IndianRupee,
  KeyRound,
  LoaderCircle,
  PhoneCall,
  ReceiptIndianRupee,
  ShieldCheck,
  Sparkles,
  UtilityPole,
  WalletCards,
} from "lucide-react";
import { useState, useTransition } from "react";
import Link from "next/link";

import { updateMoveInChecklistItemAction } from "@/app/move-in/[checklistId]/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  MOVE_IN_TASK_GUIDANCE,
  moveInChecklistProgress,
} from "@/lib/move-in-checklist";
import { cn } from "@/lib/utils";
import type {
  MoveInChecklistItemKind,
  MoveInChecklistItemView,
  MoveInChecklistView,
} from "@/types/move-in";

const taskIcons = {
  DEPOSIT_CONFIRMATION: WalletCards,
  RENT_AMOUNT: IndianRupee,
  MOVE_IN_DATE: CalendarDays,
  ID_DOCUMENT_EXCHANGE: ShieldCheck,
  AGREEMENT_STATUS: FileCheck2,
  INVENTORY_PHOTOS: Sparkles,
  UTILITY_RESPONSIBILITIES: UtilityPole,
  KEYS: KeyRound,
  EMERGENCY_CONTACT_DETAILS: PhoneCall,
} satisfies Record<MoveInChecklistItemKind, typeof Circle>;

export function MoveInChecklist({
  checklist,
}: {
  checklist: MoveInChecklistView;
}) {
  const [items, setItems] = useState(checklist.items);
  const progress = moveInChecklistProgress(items);

  return (
    <div>
      <header className="surface-card overflow-hidden p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
              Finalized · private to you
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
              Move-in checklist
            </h1>
            <p className="mt-2 text-lg font-semibold">{checklist.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {checklist.subtitle} · with {checklist.counterpartName}
            </p>
          </div>
          <div className="rounded-2xl border border-border/75 bg-muted/35 px-4 py-3 text-right">
            <p className="text-2xl font-bold tracking-tight">
              {progress.completedCount}/{progress.totalCount}
            </p>
            <p className="text-xs font-medium text-muted-foreground">tasks complete</p>
          </div>
        </div>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width]"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
          Store only coordination notes. Never enter bank details, payment credentials,
          full ID numbers, or document images. Roomzi does not process payments or
          create legal agreements.
        </p>
        {checklist.isReadOnly ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-700">
            This match is closed. Its checklist is preserved as read-only history and
            cannot be changed unless the match is intentionally reopened.
          </p>
        ) : null}
        <Link
          href="/documents"
          className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
        >
          <Files aria-hidden="true" className="size-4" />
          Share move-in documents securely
        </Link>
      </header>

      <div className="mt-5 grid gap-4">
        {items.map((item) => (
          <ChecklistTask
            key={item.id}
            checklistId={checklist.id}
            item={item}
            readOnly={checklist.isReadOnly}
            onSaved={(saved) =>
              setItems((current) =>
                current.map((entry) => (entry.id === saved.id ? saved : entry)),
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

function ChecklistTask({
  checklistId,
  item,
  readOnly,
  onSaved,
}: {
  checklistId: string;
  item: MoveInChecklistItemView;
  readOnly: boolean;
  onSaved: (item: MoveInChecklistItemView) => void;
}) {
  const guidance = MOVE_IN_TASK_GUIDANCE[item.kind];
  const Icon = taskIcons[item.kind];
  const [privateDetail, setPrivateDetail] = useState(item.privateDetail);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const save = (isCompleted = item.isCompleted) => {
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await updateMoveInChecklistItemAction({
        checklistId,
        itemId: item.id,
        isCompleted,
        privateDetail,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      onSaved({
        ...item,
        privateDetail: privateDetail.trim(),
        isCompleted,
        completedAt: isCompleted ? item.completedAt ?? new Date().toISOString() : null,
      });
      setMessage(result.message);
    });
  };

  return (
    <article
      className={cn(
        "surface-card p-4 transition-colors sm:p-5",
        item.isCompleted && "border-emerald-200 bg-emerald-50/35",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{item.label}</h2>
            <button
              type="button"
              disabled={pending || readOnly}
              onClick={() => save(!item.isCompleted)}
              className={cn(
                "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition disabled:opacity-60",
                item.isCompleted
                  ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                  : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
              ) : item.isCompleted ? (
                <Check aria-hidden="true" className="size-3.5" />
              ) : (
                <Circle aria-hidden="true" className="size-3.5" />
              )}
              {item.isCompleted ? "Completed" : "Mark complete"}
            </button>
          </div>

          <label className="mt-3 block text-xs font-semibold text-muted-foreground">
            Private detail
            <span className="relative mt-1.5 block">
              {item.kind === "RENT_AMOUNT" ? (
                <ReceiptIndianRupee
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                />
              ) : null}
              <input
                type={guidance.inputType}
                min={guidance.inputType === "number" ? "0" : undefined}
                step={guidance.inputType === "number" ? "500" : undefined}
                value={privateDetail}
                maxLength={500}
                disabled={readOnly}
                onChange={(event) => setPrivateDetail(event.target.value)}
                placeholder={guidance.placeholder}
                className={cn(
                  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15",
                  item.kind === "RENT_AMOUNT" && "pl-10",
                )}
              />
            </span>
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Visible only in your checklist.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => save()}
              disabled={readOnly || pending || privateDetail === item.privateDetail}
            >
              {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
              Save detail
            </Button>
          </div>
          {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
          {message ? <p role="status" className="mt-2 text-xs text-emerald-700">{message}</p> : null}
        </div>
      </div>
    </article>
  );
}
