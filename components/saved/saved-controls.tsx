"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  BookmarkCheck,
  BookmarkPlus,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";

import {
  createSavedSearchAction,
  deleteSavedSearchAction,
  setPostSavedAction,
} from "@/app/saved/actions";
import { Button } from "@/components/ui/button";
import { MAX_SAVED_SEARCH_NAME_LENGTH } from "@/lib/saved";
import { cn } from "@/lib/utils";
import type { SavedActionState, SavedSearchKind } from "@/types/saved";

export function SavePostButton({
  postId,
  initialSaved,
  refreshOnChange = false,
  className,
}: {
  postId: string;
  initialSaved: boolean;
  refreshOnChange?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [result, setResult] = useState<SavedActionState>();
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    const nextSaved = !isSaved;
    setResult(undefined);
    startTransition(async () => {
      const next = await setPostSavedAction(postId, nextSaved);
      setResult(next);
      if (next.success) {
        setIsSaved(nextSaved);
        if (refreshOnChange) router.refresh();
      }
    });
  };

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <Button
        type="button"
        variant={isSaved ? "secondary" : "outline"}
        size="sm"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={isSaved}
      >
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
        ) : isSaved ? (
          <BookmarkCheck aria-hidden="true" className="size-3.5" />
        ) : (
          <Bookmark aria-hidden="true" className="size-3.5" />
        )}
        {isPending ? "Saving..." : isSaved ? "Saved" : "Save"}
      </Button>
      {result && !result.success ? (
        <span role="alert" className="max-w-48 text-right text-[0.6875rem] leading-4 text-destructive">
          {result.message}
        </span>
      ) : null}
    </div>
  );
}

export function SaveSearchButton({
  kind,
  href,
  defaultName,
}: {
  kind: SavedSearchKind;
  href: string;
  defaultName: string;
}) {
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [result, setResult] = useState<SavedActionState>();
  const [isPending, startTransition] = useTransition();

  const save = () => {
    setResult(undefined);
    startTransition(async () => {
      const next = await createSavedSearchAction({ kind, href, name });
      setResult(next);
    });
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
        <BookmarkPlus aria-hidden="true" className="size-4" />
        Save this search
      </Button>
      {isOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-foreground/35 backdrop-blur-[2px] sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !isPending) setIsOpen(false);
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <BookmarkPlus aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="font-semibold">Save this search</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  Keep these filters ready to run again from your Saved page.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setIsOpen(false)} disabled={isPending}>
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>

            {result?.success ? (
              <div className="mt-5 rounded-2xl border border-secondary bg-secondary/35 p-4 text-sm font-medium text-secondary-foreground">
                <p className="flex items-center gap-2"><CheckCircle2 aria-hidden="true" className="size-4" />{result.message}</p>
                <Button type="button" className="mt-4 w-full" onClick={() => setIsOpen(false)}>Done</Button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <label className="space-y-2 text-sm font-semibold">
                  Search name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={MAX_SAVED_SEARCH_NAME_LENGTH}
                    required
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
                  />
                </label>
                {result ? (
                  <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-xs font-medium text-destructive">
                    <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{result.message}
                  </p>
                ) : null}
                <Button type="button" onClick={save} disabled={isPending || !name.trim()} className="w-full">
                  {isPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <BookmarkPlus aria-hidden="true" className="size-4" />}
                  {isPending ? "Saving..." : "Save search"}
                </Button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

export function DeleteSavedSearchButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={() => {
          setError("");
          startTransition(async () => {
            const result = await deleteSavedSearchAction(id);
            if (result.success) router.refresh();
            else setError(result.message);
          });
        }}
      >
        {isPending ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Trash2 aria-hidden="true" className="size-3.5" />}
        {isPending ? "Removing..." : "Remove"}
      </Button>
      {error ? <span role="alert" className="max-w-44 text-right text-[0.6875rem] text-destructive">{error}</span> : null}
    </div>
  );
}
