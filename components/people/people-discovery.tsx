import Link from "next/link";
import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  IndianRupee,
  MapPin,
  MessageCircle,
  Search,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  UserRoundSearch,
} from "lucide-react";

import { CompatibilitySummary } from "@/components/compatibility/compatibility-summary";
import { SafetyActions } from "@/components/trust-safety/safety-actions";
import { SaveSearchButton } from "@/components/saved/saved-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { activePeopleFilterCount, peopleFilterQuery } from "@/lib/discovery";
import { cn } from "@/lib/utils";
import type { CommunityLocationOption } from "@/types/community";
import type { PeopleDiscoveryProfile, PeopleFilters } from "@/types/discovery";

const inputClassName =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-3 focus:ring-ring/15";
const selectClassName = `${inputClassName} appearance-none pr-9`;

const lifestyleFields = [
  {
    name: "diet",
    label: "Food preference",
    options: [
      ["VEGETARIAN", "Vegetarian"],
      ["NON_VEGETARIAN", "Non-vegetarian"],
      ["EGGETARIAN", "Eggetarian"],
      ["VEGAN", "Vegan"],
    ],
  },
  {
    name: "smoking",
    label: "Smoking",
    options: [["NEVER", "Non-smoker"], ["OCCASIONALLY", "Occasionally"], ["REGULARLY", "Regularly"]],
  },
  {
    name: "drinking",
    label: "Drinking",
    options: [["NEVER", "Never"], ["OCCASIONALLY", "Occasionally"], ["REGULARLY", "Regularly"]],
  },
  {
    name: "sleep",
    label: "Sleep schedule",
    options: [["EARLY_BIRD", "Early bird"], ["BALANCED", "Flexible"], ["NIGHT_OWL", "Night owl"]],
  },
  {
    name: "cleanliness",
    label: "Cleanliness",
    options: [["RELAXED", "Relaxed"], ["MODERATE", "Moderately tidy"], ["VERY_TIDY", "Very tidy"]],
  },
  {
    name: "pets",
    label: "Pets",
    options: [["HAS_PETS", "Has pets"], ["PET_FRIENDLY", "Pet friendly"], ["PREFERS_NO_PETS", "Prefers no pets"]],
  },
  {
    name: "status",
    label: "Work / study",
    options: [
      ["STUDENT", "Student"],
      ["WORKING_PROFESSIONAL", "Working professional"],
      ["SELF_EMPLOYED", "Self-employed"],
      ["FREELANCER", "Freelancer"],
      ["OTHER", "Other"],
    ],
  },
] as const;

function currentLifestyleValue(filters: PeopleFilters, name: (typeof lifestyleFields)[number]["name"]) {
  if (name === "sleep") return filters.sleepSchedule;
  if (name === "status") return filters.occupationStatus;
  return filters[name];
}

export function PeopleDiscovery({
  profiles,
  locations,
  filters,
}: {
  profiles: PeopleDiscoveryProfile[];
  locations: CommunityLocationOption[];
  filters: PeopleFilters;
}) {
  const activeFilterCount = activePeopleFilterCount(filters);
  const filterQuery = peopleFilterQuery(filters);
  const savedSearchHref = `/flatmates${filterQuery ? `?${filterQuery}` : ""}`;

  return (
    <>
      <section className="border-b border-border/70 bg-card/45">
        <div className="content-shell py-10 sm:py-14">
          <div className="mx-auto max-w-5xl">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <UserRoundSearch aria-hidden="true" className="size-4" />
              People discovery
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
              Find a flatmate who fits your everyday life.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Search by locality, budget, timing, and lifestyle. Compatibility scores use the transparent preferences in your profile.
            </p>

            <div className="surface-card mt-8 p-4 sm:p-5">
              <form method="get" action="/flatmates" className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr_13rem]">
                  <label className="relative block">
                    <span className="sr-only">Search people</span>
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      name="q"
                      defaultValue={filters.query}
                      placeholder="Search name, profession, company"
                      className={cn(inputClassName, "pl-10")}
                    />
                  </label>
                  <FilterSelect
                    label="Preferred locality"
                    name="locality"
                    value={filters.localityId}
                    options={locations.map((location) => [location.id, `${location.locality}, ${location.city}`])}
                  />
                  <FilterSelect
                    label="Sort matches"
                    name="sort"
                    value={filters.sort}
                    options={[
                      ["highest-compatibility", "Highest compatibility"],
                      ["lowest-budget", "Lowest budget"],
                      ["newest", "Newest profiles"],
                    ]}
                    includeAny={false}
                  />
                </div>

                <details open={activeFilterCount > 0} className="group border-t border-border/70 pt-4">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/20 [&::-webkit-details-marker]:hidden">
                    <SlidersHorizontal aria-hidden="true" className="size-4 text-primary" />
                    Budget, move-in &amp; lifestyle
                    {activeFilterCount ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{activeFilterCount} active</span>
                    ) : null}
                  </summary>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <NumberFilter label="Minimum budget" name="min" value={filters.budgetMin} />
                    <NumberFilter label="Maximum budget" name="max" value={filters.budgetMax} />
                    <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
                      Move in by
                      <input type="date" name="moveInBy" defaultValue={filters.moveInBy} className={inputClassName} />
                    </label>
                    <FilterSelect
                      label="Minimum match"
                      name="score"
                      value={filters.minimumCompatibility?.toString() ?? ""}
                      options={[["50", "50%+"], ["60", "60%+"], ["70", "70%+"], ["80", "80%+"]]}
                    />
                    {lifestyleFields.map((field) => (
                      <FilterSelect
                        key={field.name}
                        label={field.label}
                        name={field.name}
                        value={currentLifestyleValue(filters, field.name) ?? ""}
                        options={field.options}
                      />
                    ))}
                  </div>
                </details>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Link href="/flatmates" className={cn(buttonVariants({ variant: "ghost" }), "w-full sm:w-auto")}>Clear filters</Link>
                  <Button type="submit" className="w-full sm:w-auto">
                    <Search aria-hidden="true" className="size-4" />
                    Find people
                  </Button>
                </div>
              </form>
              <div className="mt-4 flex justify-end border-t border-border/70 pt-4">
                <SaveSearchButton
                  kind="PEOPLE"
                  href={savedSearchHref}
                  defaultName="My flatmate search"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="content-shell py-8 sm:py-12">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-primary">Your matches</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                {profiles.length} {profiles.length === 1 ? "person" : "people"} found
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Blocked users are automatically excluded. Missing preferences never count as mismatches.
            </p>
          </div>

          {profiles.length ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {profiles.map((profile) => (
                <PeopleCard key={profile.id} profile={profile} />
              ))}
            </div>
          ) : (
            <div className="surface-card flex flex-col items-center px-6 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <SearchX aria-hidden="true" className="size-5" />
              </span>
              <h2 className="mt-4 text-xl font-semibold">No people match every filter</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Try a wider budget, fewer lifestyle filters, or a lower compatibility threshold.
              </p>
              <Link href="/flatmates" className={cn(buttonVariants({ variant: "outline" }), "mt-6")}>Clear all filters</Link>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function PeopleCard({ profile }: { profile: PeopleDiscoveryProfile }) {
  return (
    <article className="surface-card flex flex-col p-5 sm:p-6">
      <header className="flex items-start gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground ring-4 ring-secondary/35">
          {profile.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{profile.name}</h3>
            {profile.age ? <span className="text-sm text-muted-foreground">{profile.age}</span> : null}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <BriefcaseBusiness aria-hidden="true" className="size-3.5" />
            {profile.profession}{profile.organization ? ` · ${profile.organization}` : ""}
          </p>
        </div>
        <SafetyActions
          target={{ type: "USER", id: profile.id, label: "user" }}
          user={{ id: profile.id, name: profile.name }}
        />
      </header>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">{profile.bio}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <p className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5 text-sm font-semibold">
          <IndianRupee aria-hidden="true" className="size-4 text-primary" />
          {profile.budgetLabel}
        </p>
        <p className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5 text-sm font-semibold">
          <CalendarDays aria-hidden="true" className="size-4 text-primary" />
          {profile.moveInLabel}
        </p>
      </div>

      {profile.preferredLocalities.length ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          {profile.preferredLocalities.join(" · ")}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {profile.lifestyleTags.slice(0, 6).map((tag) => (
          <span key={tag} className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">{tag}</span>
        ))}
      </div>

      {profile.compatibility ? (
        <CompatibilitySummary result={profile.compatibility} />
      ) : (
        <p className="mt-5 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
          <Sparkles aria-hidden="true" className="size-4" />
          Add more preferences to your profile to calculate compatibility.
        </p>
      )}

      <footer className="mt-auto border-t border-border/70 pt-4">
        <Link
          href={{ pathname: "/chat", query: { user: profile.authUserId } }}
          className={cn(buttonVariants(), "w-full")}
        >
          <MessageCircle aria-hidden="true" className="size-4" />
          Message {profile.name.split(" ")[0]}
        </Link>
      </footer>
    </article>
  );
}

function NumberFilter({ label, name, value }: { label: string; name: string; value: number | null }) {
  return (
    <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
      {label}
      <span className="relative block">
        <IndianRupee aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2" />
        <input type="number" min="0" max="10000000" step="500" name={name} defaultValue={value ?? ""} className={cn(inputClassName, "pl-9")} />
      </span>
    </label>
  );
}

function FilterSelect({
  label,
  name,
  value,
  options,
  includeAny = true,
}: {
  label: string;
  name: string;
  value: string;
  options: readonly (readonly [string, string])[];
  includeAny?: boolean;
}) {
  return (
    <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
      <span className="sr-only">{label}</span>
      <span className="relative block">
        <select name={name} defaultValue={value} aria-label={label} className={selectClassName}>
          {includeAny ? <option value="">Any {label.toLowerCase()}</option> : null}
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>{optionLabel}</option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" />
      </span>
    </label>
  );
}
