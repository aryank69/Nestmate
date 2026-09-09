"use client";

import Link from "next/link";
import { createContext, useContext, useMemo, useState } from "react";
import { Check, GitCompareArrows, LogIn } from "lucide-react";

import { SavePostButton } from "@/components/saved/saved-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { MAX_COMPARISON_LISTINGS } from "@/lib/comparison";
import { cn } from "@/lib/utils";

type RoomCompareContextValue = {
  selected: string[];
  toggle: (postId: string) => void;
  message: string;
};

const RoomCompareContext = createContext<RoomCompareContextValue | null>(null);

export function RoomCompareProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const value = useMemo<RoomCompareContextValue>(
    () => ({
      selected,
      message,
      toggle(postId) {
        setMessage("");
        setSelected((current) => {
          if (current.includes(postId)) {
            return current.filter((id) => id !== postId);
          }
          if (current.length >= MAX_COMPARISON_LISTINGS) {
            setMessage(`You can compare up to ${MAX_COMPARISON_LISTINGS} listings.`);
            return current;
          }
          return [...current, postId];
        });
      },
    }),
    [message, selected],
  );
  const compareHref = `/saved/compare?ids=${encodeURIComponent(selected.join(","))}`;

  return (
    <RoomCompareContext.Provider value={value}>
      {children}
      {selected.length ? (
        <div className="sticky bottom-4 z-30 mx-auto mt-6 flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-background/95 p-3 shadow-xl backdrop-blur">
          <div className="min-w-0 pl-2">
            <p className="text-sm font-semibold">
              {selected.length}/{MAX_COMPARISON_LISTINGS} selected
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {message || (selected.length < 2 ? "Select one more saved listing" : "Ready to compare")}
            </p>
          </div>
          {selected.length >= 2 ? (
            <Link href={compareHref} className={buttonVariants({ size: "sm" })}>
              <GitCompareArrows aria-hidden="true" className="size-4" />
              Compare
            </Link>
          ) : (
            <Button type="button" size="sm" disabled>
              Compare
            </Button>
          )}
        </div>
      ) : null}
    </RoomCompareContext.Provider>
  );
}
export function RoomListingActions({
  postId,
  isSaved,
  isAuthenticated,
}: {
  postId: string;
  isSaved: boolean;
  isAuthenticated: boolean;
}) {
  const context = useContext(RoomCompareContext);
  if (!context) return null;
  const selected = context.selected.includes(postId);
  const atLimit = context.selected.length >= MAX_COMPARISON_LISTINGS;

  if (!isAuthenticated) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent("/rooms")}`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <LogIn aria-hidden="true" className="size-4" />
        Sign in to save
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SavePostButton postId={postId} initialSaved={isSaved} refreshOnChange />
      <Button
        type="button"
        variant={selected ? "secondary" : "outline"}
        size="sm"
        aria-pressed={selected}
        disabled={!isSaved || (!selected && atLimit)}
        title={!isSaved ? "Save this listing before comparing it" : undefined}
        onClick={() => context.toggle(postId)}
        className={cn(selected && "border-primary/25 text-primary")}
      >
        {selected ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <GitCompareArrows aria-hidden="true" className="size-4" />
        )}
        {selected ? "Selected" : "Compare"}
      </Button>
    </div>
  );
}
