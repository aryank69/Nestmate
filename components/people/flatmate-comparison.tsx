import { ArrowLeft, CircleAlert, EyeOff, MapPin, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { bestComparisonIds, hasMeaningfulDifference } from "@/lib/comparison";
import { cn } from "@/lib/utils";
import type { PeopleDiscoveryProfile } from "@/types/discovery";
import type { FlatmateComparisonData } from "@/types/shortlist";

type ProfileValue = (profile: PeopleDiscoveryProfile) => ReactNode;
type ProfileCompareValue = (profile: PeopleDiscoveryProfile) => unknown;

export function FlatmateComparison({ data }: { data: FlatmateComparisonData }) {
  const availableProfiles = data.slots.flatMap((slot) => slot.profile ? [slot.profile] : []);
  const bestCompatibility = bestComparisonIds(
    availableProfiles.map((profile) => ({ id: profile.id, value: profile.compatibility?.score ?? null })),
    "HIGHEST",
  );

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/shortlist" className={cn(buttonVariants({ variant: "ghost" }), "mb-5 px-0")}>
        <ArrowLeft aria-hidden="true" className="size-4" />Back to shortlist
      </Link>
      <header>
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Scale aria-hidden="true" className="size-4" />Flatmate comparison
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">Compare your shortlist</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Compare shared profile details side by side. Compatibility is personal to your profile; trust badges are signals, not guarantees.
        </p>
      </header>

      {data.selectionWasTrimmed ? (
        <p className="mt-5 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/25 dark:text-amber-100">Only the first four profiles were included.</p>
      ) : null}
      {data.error ? (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{data.error}
        </p>
      ) : null}

      {!data.slots.length ? (
        <div className="surface-card mt-8 flex flex-col items-center px-6 py-14 text-center">
          <Scale aria-hidden="true" className="size-7 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Choose profiles to compare</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">Select up to four people from your flatmate shortlist.</p>
          <Link href="/shortlist" className={cn(buttonVariants(), "mt-5")}>Open shortlist</Link>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-sm">
          <div
            className="grid min-w-max"
            style={{ gridTemplateColumns: `minmax(10rem, .72fr) repeat(${data.slots.length}, minmax(14rem, 1fr))` }}
          >
            <div className="sticky left-0 z-10 border-b border-r border-border/80 bg-muted/80 p-4" />
            {data.slots.map((slot) => (
              <div key={slot.id} className="border-b border-r border-border/80 p-4 last:border-r-0">
                {slot.profile ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground">{slot.profile.initials}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{slot.profile.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{slot.profile.profession}</p>
                      </div>
                    </div>
                    <Link href={`/flatmates/${encodeURIComponent(slot.profile.id)}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 w-full")}>View profile</Link>
                  </>
                ) : (
                  <div className="flex min-h-24 flex-col items-center justify-center text-center text-sm text-muted-foreground">
                    <EyeOff aria-hidden="true" className="mb-2 size-5" />
                    {slot.unavailableReason}
                  </div>
                )}
              </div>
            ))}

            <ComparisonRow
              label="Compatibility"
              profiles={data.slots}
              compare={(profile) => profile.compatibility?.score ?? null}
              render={(profile) => profile.compatibility ? (
                <span className={cn("font-semibold", bestCompatibility.has(profile.id) && "text-primary")}>
                  {profile.compatibility.score}/100{bestCompatibility.has(profile.id) ? " · Highest" : ""}
                </span>
              ) : "Not enough shared preferences"}
            />
            <ComparisonRow label="Budget" profiles={data.slots} compare={(profile) => profile.budgetLabel} render={(profile) => profile.budgetLabel} />
            <ComparisonRow label="Preferred locality" profiles={data.slots} compare={(profile) => profile.preferredLocalities} render={(profile) => profile.preferredLocalities.length ? profile.preferredLocalities.join(", ") : "Flexible"} />
            <ComparisonRow label="Commute range" profiles={data.slots} compare={(profile) => profile.preferredCommuteLabel} render={(profile) => profile.preferredCommuteLabel ?? "Not shared"} />
            <ComparisonRow label="Lifestyle" profiles={data.slots} compare={(profile) => profile.lifestyleTags} render={(profile) => profile.lifestyleTags.length ? <TagList values={profile.lifestyleTags} /> : "Not shared"} />
            <ComparisonRow label="Verification" profiles={data.slots} compare={(profile) => profile.verification.badges.map(({ kind }) => kind)} render={(profile) => profile.verification.badges.length ? <TagList values={profile.verification.badges.map(({ label }) => label)} icon={<ShieldCheck aria-hidden="true" className="size-3" />} /> : "No badges yet"} />
            <ComparisonRow label="Responsiveness" profiles={data.slots} compare={(profile) => profile.responsiveness.label} render={(profile) => profile.responsiveness.label} />
            <ComparisonRow label="Move-in" profiles={data.slots} compare={(profile) => profile.moveInLabel} render={(profile) => profile.moveInLabel} />
            <ComparisonRow label="Occupation / status" profiles={data.slots} compare={(profile) => [profile.profession, profile.organization, profile.occupationStatus]} render={(profile) => <><span className="font-medium text-foreground">{profile.profession}</span>{profile.organization ? <span className="mt-1 block">{profile.organization}</span> : null}{profile.occupationStatus ? <span className="mt-1 block">{profile.occupationStatus}</span> : null}</>} />
          </div>
        </div>
      )}

      <p className="mt-5 flex items-start gap-2 rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-xs leading-5 text-muted-foreground">
        <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
        Commute comparisons show only the preferred distance range. Private destination names and exact coordinates are never included.
      </p>
    </div>
  );
}

function ComparisonRow({
  label,
  profiles,
  compare,
  render,
}: {
  label: string;
  profiles: FlatmateComparisonData["slots"];
  compare: ProfileCompareValue;
  render: ProfileValue;
}) {
  const values = profiles.map((slot) => slot.profile ? compare(slot.profile) : null);
  const differs = hasMeaningfulDifference(values);
  return (
    <>
      <div className="sticky left-0 z-10 border-b border-r border-border/80 bg-muted/80 p-4 text-sm font-semibold">{label}</div>
      {profiles.map((slot) => (
        <div key={`${label}-${slot.id}`} className={cn("border-b border-r border-border/80 p-4 text-sm leading-6 text-muted-foreground last:border-r-0", differs && slot.profile && "bg-amber-50/55 dark:bg-amber-950/10")}>
          {slot.profile ? render(slot.profile) : <span aria-label="Unavailable">—</span>}
        </div>
      ))}
    </>
  );
}

function TagList({ values, icon }: { values: string[]; icon?: ReactNode }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {values.map((value) => <span key={value} className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background px-2 py-0.5 text-[0.6875rem] font-medium text-foreground">{icon}{value}</span>)}
    </span>
  );
}
