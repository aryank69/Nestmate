"use client";

import { Heart, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setProfileShortlistedAction } from "@/app/shortlist/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ShortlistProfileButton({
  profileId,
  initialShortlisted,
  className,
}: {
  profileId: string;
  initialShortlisted: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [shortlisted, setShortlisted] = useState(initialShortlisted);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggleShortlist() {
    const next = !shortlisted;
    setMessage("");
    startTransition(async () => {
      const result = await setProfileShortlistedAction(profileId, next);
      setMessage(result.message);
      if (result.success) {
        setShortlisted(Boolean(result.shortlisted));
        router.refresh();
      }
    });
  }

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <Button
        type="button"
        size="sm"
        variant={shortlisted ? "secondary" : "outline"}
        disabled={isPending}
        aria-pressed={shortlisted}
        onClick={toggleShortlist}
      >
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
        ) : (
          <Heart
            aria-hidden="true"
            className={cn("size-3.5", shortlisted && "fill-current")}
          />
        )}
        {shortlisted ? "Shortlisted" : "Shortlist"}
      </Button>
      {message ? (
        <span
          role="status"
          className={cn(
            "max-w-44 text-right text-[0.6875rem] leading-4",
            message.startsWith("We could not") || message.startsWith("That profile")
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
