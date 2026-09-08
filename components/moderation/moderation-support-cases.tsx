"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CheckCircle2,
  CircleAlert,
  LifeBuoy,
  LoaderCircle,
  LockKeyhole,
  Send,
} from "lucide-react";

import { manageSupportCaseAction } from "@/app/admin/moderation/support-actions";
import { Button } from "@/components/ui/button";
import {
  formatSupportTime,
  supportCategoryLabels,
  supportStatusLabels,
  supportStatuses,
} from "@/lib/support";
import { cn } from "@/lib/utils";
import type {
  ModerationSupportCase,
  SupportCaseStatus,
} from "@/types/support";

export function ModerationSupportCases({ cases }: { cases: ModerationSupportCase[] }) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, SupportCaseStatus>>({});
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (supportCase: ModerationSupportCase) => {
    const status = statuses[supportCase.id] ?? supportCase.status;
    const response = responses[supportCase.id] ?? "";
    const internalNote = notes[supportCase.id] ?? "";
    if (status === supportCase.status && !response.trim() && !internalNote.trim()) {
      setFeedback({ success: false, message: "Change the status, add a response, or add a private note." });
      return;
    }

    setPendingId(supportCase.id);
    setFeedback(null);
    startTransition(async () => {
      const result = await manageSupportCaseAction({
        caseId: supportCase.id,
        status,
        response,
        internalNote,
      });
      setFeedback(result);
      setPendingId(null);
      if (result.success) {
        setResponses((current) => ({ ...current, [supportCase.id]: "" }));
        setNotes((current) => ({ ...current, [supportCase.id]: "" }));
        router.refresh();
      }
    });
  };

  return (
    <section className="mt-6 space-y-4" aria-label="Open support and appeal cases">
      {feedback ? (
        <div role={feedback.success ? "status" : "alert"} className={cn("flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium", feedback.success ? "border-primary/20 bg-primary/8 text-primary" : "border-destructive/25 bg-destructive/8 text-destructive")}>
          {feedback.success ? <CheckCircle2 aria-hidden="true" className="size-4" /> : <CircleAlert aria-hidden="true" className="size-4" />}
          {feedback.message}
        </div>
      ) : null}

      {cases.length ? cases.map((supportCase) => {
        const itemPending = isPending && pendingId === supportCase.id;
        return (
          <article key={supportCase.id} className="surface-card p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[0.6875rem] font-semibold text-primary">
                    {supportCategoryLabels[supportCase.category]}
                  </span>
                  <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[0.6875rem] font-semibold text-muted-foreground">
                    {supportStatusLabels[supportCase.status]}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-semibold">{supportCase.subject}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{supportCase.description}</p>
                {supportCase.reference ? (
                  <p className="mt-3 break-words rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs">
                    <span className="font-semibold">Related item:</span> {supportCase.reference}
                  </p>
                ) : null}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Submitted by</p>
                    <p className="mt-1 text-sm font-semibold">{supportCase.user.name}</p>
                    {supportCase.user.email ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{supportCase.user.email}</p> : null}
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Activity</p>
                    <p className="mt-1 text-xs text-muted-foreground">Opened {formatSupportTime(supportCase.createdAt)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Updated {formatSupportTime(supportCase.updatedAt)}</p>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Case messages</p>
                  {supportCase.messages.length ? supportCase.messages.map((message) => (
                    <div key={message.id} className={cn("rounded-xl border px-3.5 py-3", message.senderRole === "MODERATOR" ? "border-primary/20 bg-primary/[0.045]" : "border-border/70 bg-muted/25")}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold">{message.senderName} · {message.senderRole === "MODERATOR" ? "Reviewer" : "User"}</p>
                        <time className="text-[0.6875rem] text-muted-foreground">{formatSupportTime(message.createdAt)}</time>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                    </div>
                  )) : <p className="rounded-xl border border-dashed border-border px-3.5 py-4 text-xs text-muted-foreground">No follow-up messages yet.</p>}
                </div>

                {supportCase.internalNotes.length ? (
                  <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                    <summary className="cursor-pointer text-xs font-semibold text-amber-900">Private moderator notes ({supportCase.internalNotes.length})</summary>
                    <div className="mt-3 space-y-2">
                      {supportCase.internalNotes.map((note) => (
                        <div key={note.id} className="border-t border-amber-200 pt-2 first:border-0 first:pt-0">
                          <p className="whitespace-pre-wrap text-xs leading-5 text-amber-950">{note.body}</p>
                          <p className="mt-1 text-[0.6875rem] text-amber-800">{note.moderatorName} · {formatSupportTime(note.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>

              <div className="w-full rounded-2xl border border-border/70 bg-card p-4 lg:w-80 lg:shrink-0">
                <label className="block text-xs font-semibold">
                  Status
                  <select value={statuses[supportCase.id] ?? supportCase.status} onChange={(event) => setStatuses((current) => ({ ...current, [supportCase.id]: event.target.value as SupportCaseStatus }))} className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-3 focus:ring-ring/20">
                    {supportStatuses.map((status) => <option key={status} value={status}>{supportStatusLabels[status]}</option>)}
                  </select>
                </label>
                <label className="mt-3 block text-xs font-semibold">
                  Response to user <span className="font-normal text-muted-foreground">(optional)</span>
                  <textarea rows={4} maxLength={2000} value={responses[supportCase.id] ?? ""} onChange={(event) => setResponses((current) => ({ ...current, [supportCase.id]: event.target.value }))} placeholder="Visible only to this user" className="mt-2 w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-5 outline-none focus:ring-3 focus:ring-ring/20" />
                </label>
                <label className="mt-3 block text-xs font-semibold">
                  Internal note <span className="font-normal text-muted-foreground">(optional)</span>
                  <textarea rows={3} maxLength={2000} value={notes[supportCase.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [supportCase.id]: event.target.value }))} placeholder="Reviewers only — never shown to the user" className="mt-2 w-full resize-y rounded-xl border border-amber-300 bg-amber-50/50 px-3 py-2.5 text-sm leading-5 outline-none focus:ring-3 focus:ring-amber-300/30" />
                </label>
                <p className="mt-2 flex items-start gap-1.5 text-[0.6875rem] leading-4 text-muted-foreground">
                  <LockKeyhole aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /> Internal notes and audit context remain moderator-only.
                </p>
                <Button type="button" className="mt-3 w-full" disabled={itemPending} onClick={() => submit(supportCase)}>
                  {itemPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Send aria-hidden="true" className="size-4" />}
                  {itemPending ? "Updating..." : "Update case"}
                </Button>
              </div>
            </div>
          </article>
        );
      }) : (
        <div className="surface-card flex flex-col items-center px-6 py-16 text-center">
          <LifeBuoy aria-hidden="true" className="size-8 text-primary" />
          <h2 className="mt-4 text-lg font-semibold">No open support cases</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">New support requests and appeals will appear here.</p>
        </div>
      )}
    </section>
  );
}
