"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileQuestion,
  LifeBuoy,
  LoaderCircle,
  LockKeyhole,
  Plus,
} from "lucide-react";

import { createSupportCaseAction } from "@/app/support/actions";
import { Button } from "@/components/ui/button";
import {
  formatSupportTime,
  supportCategories,
  supportCategoryLabels,
  supportStatusLabels,
} from "@/lib/support";
import { cn } from "@/lib/utils";
import type { SupportCaseStatus, SupportCaseSummary } from "@/types/support";

const statusStyles: Record<SupportCaseStatus, string> = {
  OPEN: "border-sky-200 bg-sky-50 text-sky-700",
  UNDER_REVIEW: "border-amber-200 bg-amber-50 text-amber-800",
  RESOLVED: "border-primary/20 bg-primary/8 text-primary",
  REJECTED: "border-border bg-muted text-muted-foreground",
};

const fieldClass =
  "mt-2 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus:ring-3 focus:ring-ring/20";

export function SupportCenter({ cases }: { cases: SupportCaseSummary[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(cases.length === 0);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setFeedback(null);
    startTransition(async () => {
      const result = await createSupportCaseAction({
        category: String(values.get("category") ?? ""),
        subject: String(values.get("subject") ?? ""),
        description: String(values.get("description") ?? ""),
        reference: String(values.get("reference") ?? ""),
      });
      setFeedback(result);
      if (result.success && result.caseId) {
        form.reset();
        router.push(`/support/${result.caseId}`);
      }
    });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <LifeBuoy aria-hidden="true" className="size-4" />
            Private help centre
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            Support & appeals
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Ask for help or appeal a content or account decision. Only you and
            authorized Roomzi reviewers can see your case.
          </p>
        </div>
        <Button type="button" onClick={() => setShowForm((value) => !value)}>
          <Plus aria-hidden="true" className="size-4" />
          {showForm ? "Close form" : "New request"}
        </Button>
      </header>

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)]">
        <section className="surface-card p-5 sm:p-6" aria-labelledby="case-history-title">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="case-history-title" className="text-lg font-semibold">Your cases</h2>
              <p className="mt-1 text-sm text-muted-foreground">Track updates and reply from each case.</p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {cases.length}
            </span>
          </div>

          {cases.length ? (
            <div className="mt-5 divide-y divide-border/70">
              {cases.map((supportCase) => (
                <Link
                  key={supportCase.id}
                  href={`/support/${supportCase.id}`}
                  className="group flex gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <FileQuestion aria-hidden="true" className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{supportCase.subject}</span>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold", statusStyles[supportCase.status])}>
                        {supportStatusLabels[supportCase.status]}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs font-medium text-primary">
                      {supportCategoryLabels[supportCase.category]}
                    </span>
                    <span className="mt-1 line-clamp-1 block text-xs text-muted-foreground">
                      Updated {formatSupportTime(supportCase.updatedAt)}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-border px-5 py-10 text-center">
              <CheckCircle2 aria-hidden="true" className="mx-auto size-7 text-primary" />
              <h3 className="mt-3 text-sm font-semibold">No support cases yet</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">If you need help, your new request will appear here.</p>
            </div>
          )}
        </section>

        {showForm ? (
          <section className="surface-card p-5 sm:p-6" aria-labelledby="new-case-title">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LifeBuoy aria-hidden="true" className="size-4.5" />
              </span>
              <div>
                <h2 id="new-case-title" className="text-lg font-semibold">How can we help?</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Share enough context for a fair, useful review.</p>
              </div>
            </div>

            <form className="mt-5 space-y-4" onSubmit={submit}>
              <label className="block text-sm font-semibold">
                Category
                <select name="category" required defaultValue="" className={fieldClass}>
                  <option value="" disabled>Choose a category</option>
                  {supportCategories.map((category) => (
                    <option key={category} value={category}>{supportCategoryLabels[category]}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Subject
                <input name="subject" required minLength={5} maxLength={120} placeholder="A short summary" className={fieldClass} />
              </label>
              <label className="block text-sm font-semibold">
                Description
                <textarea name="description" required minLength={20} maxLength={2000} rows={6} placeholder="What happened, and what outcome would help?" className={cn(fieldClass, "resize-y leading-6")} />
              </label>
              <label className="block text-sm font-semibold">
                Related item <span className="font-normal text-muted-foreground">(optional)</span>
                <input name="reference" maxLength={200} placeholder="Post link, message reference, or case context" className={fieldClass} />
              </label>

              {feedback ? (
                <div role={feedback.success ? "status" : "alert"} className={cn("flex items-start gap-2 rounded-xl border px-3.5 py-3 text-xs font-medium", feedback.success ? "border-primary/20 bg-primary/8 text-primary" : "border-destructive/25 bg-destructive/8 text-destructive")}>
                  {feedback.success ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
                  {feedback.message}
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <LifeBuoy aria-hidden="true" className="size-4" />}
                {isPending ? "Submitting securely..." : "Submit request"}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                <LockKeyhole aria-hidden="true" className="size-3.5" />
                Case details are private and access-controlled.
              </p>
            </form>
          </section>
        ) : (
          <aside className="surface-card p-5 sm:p-6">
            <Clock3 aria-hidden="true" className="size-6 text-primary" />
            <h2 className="mt-3 text-base font-semibold">What happens next?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your case starts as Open. A reviewer can move it to Under review,
              respond privately, and record a final Resolved or Rejected status.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
