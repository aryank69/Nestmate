import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  CircleAlert,
  Clock3,
  IndianRupee,
  MapPin,
  Route,
  ShieldCheck,
  Sparkles,
  Sofa,
  WalletCards,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  bestComparisonIds,
  hasMeaningfulDifference,
} from "@/lib/comparison";
import { cn } from "@/lib/utils";
import type {
  ComparisonListing,
  ListingComparisonData,
} from "@/types/comparison";

type ComparisonField =
  | "rent"
  | "deposit"
  | "maintenance"
  | "furnishing"
  | "roomType"
  | "amenities"
  | "availabilityDate"
  | "availability"
  | "commute"
  | "recommendation"
  | "freshness"
  | "verification";

type ComparisonRow = {
  key: ComparisonField;
  label: string;
  icon: typeof IndianRupee;
  value: (listing: ComparisonListing) => unknown;
  content: (listing: ComparisonListing) => ReactNode;
};

const rows: ComparisonRow[] = [
  {
    key: "rent",
    label: "Monthly rent",
    icon: IndianRupee,
    value: (listing) => listing.rent.label,
    content: (listing) => listing.rent.label,
  },
  {
    key: "deposit",
    label: "Deposit",
    icon: WalletCards,
    value: (listing) => listing.deposit,
    content: (listing) => listing.deposit ?? "Not provided",
  },
  {
    key: "maintenance",
    label: "Maintenance",
    icon: Building2,
    value: (listing) => listing.maintenance,
    content: (listing) => listing.maintenance ?? "Not provided",
  },
  {
    key: "furnishing",
    label: "Furnishing",
    icon: Sofa,
    value: (listing) => listing.furnishing,
    content: (listing) => listing.furnishing ?? "Not provided",
  },
  {
    key: "roomType",
    label: "Room type",
    icon: Building2,
    value: (listing) => listing.roomType,
    content: (listing) => listing.roomType ?? "Not provided",
  },
  {
    key: "amenities",
    label: "Amenities",
    icon: BadgeCheck,
    value: (listing) => listing.amenities,
    content: (listing) =>
      listing.amenities.length ? (
        <span className="flex flex-wrap gap-1.5">
          {listing.amenities.map((amenity) => (
            <span key={amenity} className="rounded-full border border-border/70 bg-background px-2 py-1 text-[0.6875rem] font-medium">
              {amenity}
            </span>
          ))}
        </span>
      ) : (
        "Not provided"
      ),
  },
  {
    key: "availabilityDate",
    label: "Availability date",
    icon: CalendarDays,
    value: (listing) => listing.availabilityDate,
    content: (listing) => listing.availabilityDate,
  },
  {
    key: "availability",
    label: "Current status",
    icon: ShieldCheck,
    value: (listing) => listing.availability.status,
    content: (listing) => listing.availability.label,
  },
  {
    key: "commute",
    label: "Distance & commute",
    icon: Route,
    value: (listing) => listing.commute?.distanceKm ?? null,
    content: (listing) =>
      listing.commute ? (
        <span>
          <span className="block font-semibold">{listing.commute.distanceLabel}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{listing.commute.relevanceLabel}</span>
          {listing.commute.basedOnApproximateLocation ? (
            <span className="mt-1 block text-[0.6875rem] text-muted-foreground">Based on an approximate location</span>
          ) : null}
        </span>
      ) : (
        "Add a commute destination to compare"
      ),
  },
  {
    key: "recommendation",
    label: "Living Fit",
    icon: Sparkles,
    value: (listing) => listing.recommendation.score,
    content: (listing) =>
      listing.recommendation.score === null ? (
        "Add more profile preferences"
      ) : (
        <span>
          <span className="text-lg font-bold text-primary">{listing.recommendation.score}%</span>
          <span className="ml-2 text-xs font-semibold">{listing.recommendation.label}</span>
          {listing.recommendation.reasons.length ? (
            <span className="mt-2 block text-xs leading-5 text-muted-foreground">
              {listing.recommendation.reasons.slice(0, 2).join(" · ")}
            </span>
          ) : null}
        </span>
      ),
  },
  {
    key: "freshness",
    label: "Freshness",
    icon: Clock3,
    value: (listing) => `${listing.freshness.isStale}:${listing.freshness.ageDays}`,
    content: (listing) => (
      <span className={listing.freshness.isStale ? "text-amber-800" : "text-foreground"}>
        {listing.freshness.label}
      </span>
    ),
  },
  {
    key: "verification",
    label: "Listing verification",
    icon: BadgeCheck,
    value: (listing) => listing.verificationLabels,
    content: (listing) =>
      listing.verificationLabels.length ? (
        <span className="space-y-1">
          {listing.verificationLabels.map((label) => (
            <span key={label} className="flex items-start gap-1.5 text-xs font-semibold text-primary">
              <BadgeCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /> {label}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-muted-foreground">No listing verification badge</span>
      ),
  },
];

export function ListingComparison({
  data,
  backHref = "/saved",
  backLabel = "Back to saved",
  eyebrow = "Your housing shortlist",
  title = "Compare listings",
  description = "Compare the details that shape your decision. Highlighted rows differ across the selected listings; Living Fit scores remain unchanged.",
}: {
  data: ListingComparisonData;
  backHref?: string;
  backLabel?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  const listings = data.slots.flatMap((slot) => (slot.listing ? [slot.listing] : []));
  const rentBest = bestComparisonIds(
    listings.map((listing) => ({
      id: listing.id,
      value: listing.rent.minimum ?? listing.rent.maximum,
    })),
    "LOWEST",
  );
  const commuteBest = bestComparisonIds(
    listings.map((listing) => ({ id: listing.id, value: listing.commute?.distanceKm ?? null })),
    "LOWEST",
  );
  const recommendationBest = bestComparisonIds(
    listings.map((listing) => ({ id: listing.id, value: listing.recommendation.score })),
    "HIGHEST",
  );
  const bestByRow: Partial<Record<ComparisonField, Set<string>>> = {
    rent: rentBest,
    commute: commuteBest,
    recommendation: recommendationBest,
  };
  const gridStyle = {
    gridTemplateColumns: `minmax(9.5rem, .7fr) repeat(${Math.max(data.slots.length, 1)}, minmax(15rem, 1fr))`,
  };

  return (
    <div className="mx-auto max-w-7xl">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" /> {backLabel}
      </Link>
      <header className="mt-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Sparkles aria-hidden="true" className="size-4" /> {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          {description}
        </p>
      </header>

      {data.error ? (
        <p role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> {data.error}
        </p>
      ) : null}
      {data.selectionWasTrimmed ? (
        <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          NestMate compares up to four listings, so only the first four selections are shown.
        </p>
      ) : null}

      {data.slots.length ? (
        <div className="mt-7 overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="grid min-w-max" style={gridStyle} role="table" aria-label="Saved listing comparison">
            <div className="sticky left-0 z-10 border-b border-r border-border/70 bg-muted/80 p-4 backdrop-blur" role="columnheader">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Compare</p>
              <p className="mt-1 text-sm font-semibold">Key details</p>
            </div>
            {data.slots.map((slot) => (
              <div key={slot.id} className="border-b border-border/70 p-4 sm:p-5" role="columnheader">
                {slot.listing ? (
                  <>
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary">{slot.listing.category}</p>
                    <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-6">{slot.listing.title}</h2>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{slot.listing.locality}, {slot.listing.city}</p>
                    <Link href={slot.listing.detailHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}>View listing</Link>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/35 p-3">
                    <CircleAlert aria-hidden="true" className="size-5 text-muted-foreground" />
                    <p className="mt-2 text-sm font-semibold">Listing unavailable</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{slot.unavailableReason}</p>
                  </div>
                )}
              </div>
            ))}

            {rows.map((row) => {
              const values = listings.map(row.value);
              const differs = listings.length >= 2 && hasMeaningfulDifference(values);
              const Icon = row.icon;
              return (
                <div key={row.key} className="contents" role="row">
                  <div className={cn("sticky left-0 z-10 flex items-start gap-2 border-r border-b border-border/70 p-3.5 backdrop-blur", differs ? "bg-amber-50/95" : "bg-muted/65")} role="rowheader">
                    <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", differs ? "text-amber-700" : "text-muted-foreground")} />
                    <span>
                      <span className="block text-xs font-semibold">{row.label}</span>
                      {differs ? <span className="mt-1 block text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-amber-700">Different</span> : null}
                    </span>
                  </div>
                  {data.slots.map((slot) => {
                    const isBest = slot.listing ? bestByRow[row.key]?.has(slot.listing.id) : false;
                    return (
                      <div key={`${row.key}:${slot.id}`} className={cn("border-b border-border/70 p-3.5 text-sm leading-6", differs && "bg-amber-50/35")} role="cell">
                        {slot.listing ? (
                          <>
                            {isBest ? <span className="mb-1.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-primary">Best of selected</span> : null}
                            <div>{row.content(slot.listing)}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Unavailable</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="surface-card mt-7 flex flex-col items-center px-6 py-14 text-center">
          <Sparkles aria-hidden="true" className="size-8 text-primary" />
          <h2 className="mt-4 text-lg font-semibold">Choose listings to compare</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Select between two and four saved Room Available or PG Available listings from your Saved page.</p>
          <Link href="/saved" className={cn(buttonVariants(), "mt-5")}>Open saved listings</Link>
        </div>
      )}

      <aside className="mt-5 flex items-start gap-2 rounded-xl border border-border/70 bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        Comparison uses only listings still available to your account. Blocked, hidden, deleted, and inaccessible content is not revealed. Approximate locations remain approximate.
      </aside>
    </div>
  );
}
