"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CircleAlert,
  Clock3,
  Eye,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Pause,
  PencilLine,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";

import {
  deleteCommunityPostAction,
  updateListingLifecycleAction,
  updatePostAvailabilityAction,
} from "@/app/community/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  MyListingView,
  MyListingsData,
} from "@/types/my-listings";

const statusStyles = {
  AVAILABLE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  RESERVED: "border-amber-200 bg-amber-50 text-amber-800",
  PAUSED: "border-slate-200 bg-slate-100 text-slate-700",
  CLOSED: "border-rose-200 bg-rose-50 text-rose-800",
  UNAVAILABLE: "border-rose-200 bg-rose-50 text-rose-800",
} as const;

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <Icon aria-hidden="true" className="size-4 text-primary" />
        <strong className="text-lg tabular-nums text-foreground">{value}</strong>
      </div>
      <p className="mt-2 text-xs font-semibold text-muted-foreground">{label}</p>
      {detail ? <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function ListingManagementActions({ listing }: { listing: MyListingView }) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  function runAction(action: "PAUSE" | "REOPEN" | "CLOSE" | "DELETE") {
    setError("");
    setPendingAction(action);
    startTransition(async () => {
      const result =
        action === "DELETE"
          ? await deleteCommunityPostAction(listing.id)
          : action === "CLOSE"
            ? await updatePostAvailabilityAction(listing.id, "CLOSED")
            : await updateListingLifecycleAction(listing.id, action);
      if (result.success) {
        setConfirmDelete(false);
        router.refresh();
      } else {
        setError(result.message);
      }
      setPendingAction("");
    });
  }

  if (confirmDelete) {
    return (
      <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
        <p className="text-xs font-semibold text-foreground">
          Permanently delete this listing and its related saved/view history?
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => runAction("DELETE")}
            disabled={isPending}
          >
            {isPending ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Trash2 aria-hidden="true" className="size-3.5" />}
            Confirm delete
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmDelete(false)}
            disabled={isPending}
          >
            Keep listing
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-border/70 pt-4">
      <div className="flex flex-wrap gap-2">
        {listing.editHref ? (
          <Link href={listing.editHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <PencilLine aria-hidden="true" className="size-3.5" />
            Edit
          </Link>
        ) : null}
        {listing.canPause ? (
          <Button type="button" variant="outline" size="sm" onClick={() => runAction("PAUSE")} disabled={isPending}>
            {isPending && pendingAction === "PAUSE" ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Pause aria-hidden="true" className="size-3.5" />}
            Pause
          </Button>
        ) : null}
        {listing.canReopen ? (
          <Button type="button" variant="outline" size="sm" onClick={() => runAction("REOPEN")} disabled={isPending}>
            {isPending && pendingAction === "REOPEN" ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-3.5" />}
            Reopen
          </Button>
        ) : null}
        {listing.canClose ? (
          <Button type="button" variant="outline" size="sm" onClick={() => runAction("CLOSE")} disabled={isPending}>
            {isPending && pendingAction === "CLOSE" ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <XCircle aria-hidden="true" className="size-3.5" />}
            Close
          </Button>
        ) : null}
        {listing.canDelete ? (
          <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={isPending}>
            <Trash2 aria-hidden="true" className="size-3.5" />
            Delete
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-1.5 text-xs font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ListingCard({ listing }: { listing: MyListingView }) {
  return (
    <article className="flex flex-col rounded-2xl border border-border/80 bg-card p-4 shadow-sm shadow-foreground/[0.035] sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-muted/45 px-2.5 py-1 text-[0.6875rem] font-bold text-muted-foreground">
              {listing.kind}
            </span>
            <span className={cn("rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold", statusStyles[listing.lifecycleStatus])}>
              {listing.lifecycleLabel}
            </span>
          </div>
          <h2 className="mt-3 text-lg font-bold leading-6 text-foreground">{listing.title}</h2>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            {listing.locality}, {listing.city}
          </p>
        </div>
        <p className="shrink-0 text-right text-sm font-bold text-foreground">{listing.priceLabel}</p>
      </header>

      <div className={cn(
        "mt-4 rounded-xl border px-3 py-2.5",
        listing.freshness.isStale && listing.lifecycleStatus !== "CLOSED"
          ? "border-amber-200 bg-amber-50"
          : "border-border/70 bg-muted/25",
      )}>
        <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Clock3 aria-hidden="true" className="size-3.5 text-primary" />
          {listing.lifecycleStatus === "PAUSED"
            ? "Paused and hidden from discovery"
            : listing.freshness.freshnessLabel}
        </p>
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
          Availability: {listing.freshness.label} · Updated {listing.updatedLabel}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric icon={Eye} label="Views" value={listing.metrics.views} />
        <Metric icon={Heart} label="Saves" value={listing.metrics.saves} />
        <Metric icon={MessageCircle} label="Messages / interests" value={listing.metrics.messagesOrInterests} />
        <Metric
          icon={CalendarClock}
          label="Visit requests"
          value={listing.metrics.visitRequests}
          detail={listing.metrics.openVisitRequests ? `${listing.metrics.openVisitRequests} open` : undefined}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {listing.detailHref ? (
          <Link href={listing.detailHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            View listing <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        ) : null}
        {listing.matchesHref ? (
          <Link href={listing.matchesHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Sparkles aria-hidden="true" className="size-3.5" />
            View matches
          </Link>
        ) : null}
      </div>

      <div className="mt-auto">
        <ListingManagementActions listing={listing} />
      </div>
    </article>
  );
}

export function MyListingsDashboard({ data }: { data: MyListingsData }) {
  const summary = [
    ["Total listings", data.summary.total],
    ["Available", data.summary.available],
    ["Reserved", data.summary.reserved],
    ["Paused", data.summary.paused],
    ["Closed", data.summary.closed],
  ] as const;

  return (
    <section className="content-shell py-8 sm:py-12 lg:py-14">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Building2 aria-hidden="true" className="size-4" />
              Property management
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.045em] text-foreground sm:text-5xl">
              My Listings
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Track interest, keep availability current, and manage every room, shared flat, or PG you have posted.
            </p>
          </div>
          <Link href="/list-property" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
            <Plus aria-hidden="true" className="size-4" />
            List a Property
          </Link>
        </header>

        {data.listings.length ? (
          <>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {summary.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-border/75 bg-card p-4 shadow-sm shadow-foreground/[0.025]">
                  <strong className="text-2xl tabular-nums text-foreground">{value}</strong>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {data.listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-border bg-card px-5 py-16 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Building2 aria-hidden="true" className="size-5" />
            </span>
            <h2 className="mt-4 text-xl font-bold text-foreground">You haven’t listed a property yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Add a room, flat or shared flat, or PG. It will appear here as soon as it is published.
            </p>
            <Link href="/list-property" className={cn(buttonVariants(), "mt-6")}>
              <Plus aria-hidden="true" className="size-4" />
              List a Property
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
