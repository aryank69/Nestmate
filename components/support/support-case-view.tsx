"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  LifeBuoy,
  LoaderCircle,
  LockKeyhole,
  Send,
} from "lucide-react";

import { replyToSupportCaseAction } from "@/app/support/actions";
import { Button } from "@/components/ui/button";
import {
  formatSupportTime,
  supportCategoryLabels,
  supportStatusLabels,
} from "@/lib/support";
import { cn } from "@/lib/utils";
import type { SupportCaseDetail } from "@/types/support";

export function SupportCaseView({ supportCase }: { supportCase: SupportCaseDetail }) {
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const isActive = supportCase.status === "OPEN" || supportCase.status === "UNDER_REVIEW";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "");
    setFeedback(null);
    startTransition(async () => {
      const result = await replyToSupportCaseAction({ caseId: supportCase.id, body });
      setFeedback(result);
      if (result.success) form.reset();
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/support" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" /> Back to support
      </Link>

      <article className="surface-card mt-5 p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              <LifeBuoy aria-hidden="true" className="size-4" />
              {supportCategoryLabels[supportCase.category]}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{supportCase.subject}</h1>
            <p className="mt-2 text-xs text-muted-foreground">Opened {formatSupportTime(supportCase.createdAt)}</p>
          </div>
          <span className="w-fit rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-semibold text-primary">
            {supportStatusLabels[supportCase.status]}
          </span>
        </div>

        <div className="mt-6 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Original request</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{supportCase.description}</p>
          {supportCase.reference ? (
            <div className="mt-4 border-t border-border/70 pt-3">
              <p className="text-xs font-semibold text-muted-foreground">Related item</p>
              <p className="mt-1 break-words text-sm">{supportCase.reference}</p>
            </div>
          ) : null}
        </div>

        <section className="mt-7" aria-labelledby="case-updates-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="case-updates-title" className="text-lg font-semibold">Private conversation</h2>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockKeyhole aria-hidden="true" className="size-3.5" /> Only you and reviewers
            </span>
          </div>

          {supportCase.messages.length ? (
            <div className="mt-4 space-y-3">
              {supportCase.messages.map((message) => (
                <div key={message.id} className={cn("flex", message.senderRole === "USER" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[75%]", message.senderRole === "USER" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-card")}>
                    <p className={cn("text-xs font-semibold", message.senderRole === "USER" ? "text-primary-foreground/75" : "text-primary")}>{message.senderName}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                    <p className={cn("mt-1.5 text-[0.6875rem]", message.senderRole === "USER" ? "text-primary-foreground/70" : "text-muted-foreground")}>{formatSupportTime(message.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-border px-5 py-8 text-center">
              <p className="text-sm font-semibold">No replies yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Updates from the NestMate team will appear here.</p>
            </div>
          )}
        </section>

        {isActive ? (
          <form className="mt-6 border-t border-border/70 pt-5" onSubmit={submit}>
            <label htmlFor="support-reply" className="text-sm font-semibold">Add more information</label>
            <textarea id="support-reply" name="body" required maxLength={2000} rows={4} placeholder="Write a private reply..." className="mt-2 w-full resize-y rounded-xl border border-input bg-background px-3.5 py-3 text-sm leading-6 outline-none focus:ring-3 focus:ring-ring/20" />
            {feedback ? (
              <p role={feedback.success ? "status" : "alert"} className={cn("mt-3 flex items-center gap-2 text-xs font-medium", feedback.success ? "text-primary" : "text-destructive")}>
                {feedback.success ? <CheckCircle2 aria-hidden="true" className="size-4" /> : <CircleAlert aria-hidden="true" className="size-4" />}
                {feedback.message}
              </p>
            ) : null}
            <div className="mt-3 flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Send aria-hidden="true" className="size-4" />}
                {isPending ? "Sending..." : "Send reply"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            This case is closed. Start a new support request if you need more help.
          </div>
        )}
      </article>
    </div>
  );
}
