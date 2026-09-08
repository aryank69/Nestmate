"use client";

import { LoaderCircle, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  clearRecentViewsAction,
  removeRecentViewAction,
} from "@/app/recently-viewed/actions";
import { Button } from "@/components/ui/button";

export function RemoveRecentViewButton({ historyId }: { historyId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={isPending}
        aria-label="Remove from recently viewed"
        onClick={() => {
          setError("");
          startTransition(async () => {
            const result = await removeRecentViewAction(historyId);
            if (result.success) router.refresh();
            else setError(result.message);
          });
        }}
      >
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <X aria-hidden="true" className="size-4" />
        )}
      </Button>
      {error ? <span className="max-w-40 text-right text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

export function ClearRecentViewsButton() {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!isConfirming) {
    return (
      <Button type="button" variant="outline" onClick={() => setIsConfirming(true)}>
        <Trash2 aria-hidden="true" className="size-4" />
        Clear history
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() => setIsConfirming(false)}
        >
          Keep history
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={isPending}
          onClick={() => {
            setError("");
            startTransition(async () => {
              const result = await clearRecentViewsAction();
              if (result.success) {
                setIsConfirming(false);
                router.refresh();
              } else setError(result.message);
            });
          }}
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Trash2 aria-hidden="true" className="size-4" />
          )}
          Clear everything
        </Button>
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
