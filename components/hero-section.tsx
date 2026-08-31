import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  IndianRupee,
  MapPin,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fieldClassName =
  "h-13 w-full rounded-xl border border-input/90 bg-background px-4 text-[0.9375rem] font-medium text-foreground shadow-xs transition-[background-color,border-color,box-shadow] outline-none placeholder:font-normal placeholder:text-muted-foreground/80 hover:border-border hover:bg-card focus:border-primary focus:bg-card focus:ring-3 focus:ring-ring/15";

const labelClassName =
  "px-0.5 text-sm font-semibold tracking-[-0.01em] text-foreground";

export function HeroSection() {
  return (
    <section className="relative isolate flex min-h-[calc(100svh-4.5rem)] items-center overflow-hidden py-12 sm:py-16 lg:py-20">
      <div
        aria-hidden="true"
        className="absolute -left-32 top-16 -z-10 size-80 rounded-full bg-brand-saffron/11 blur-3xl sm:size-[26rem]"
      />
      <div
        aria-hidden="true"
        className="absolute -right-36 top-1/3 -z-10 size-80 rounded-full bg-brand-teal/11 blur-3xl sm:size-[28rem]"
      />

      <div className="content-shell">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card px-3.5 py-1.5 text-[0.8125rem] font-semibold text-primary shadow-sm shadow-foreground/[0.03] sm:mb-8">
            <Sparkles aria-hidden="true" className="size-3.5" />
            A simpler way to find your next home
          </div>

          <h1 className="max-w-4xl text-[clamp(2.5rem,6vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.058em]">
            Find a room. Find a flatmate.{" "}
            <span className="text-primary">Find your place.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:mt-7 sm:text-lg sm:leading-8">
            Explore rooms, PGs, and potential flatmates across your city—all in
            one friendly place.
          </p>

          <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:mt-9 sm:w-auto sm:flex-row">
            <Link
              href="/rooms"
              className={cn(
                buttonVariants({ size: "lg" }),
                "group h-13 px-6 sm:min-w-44",
              )}
            >
              <Search aria-hidden="true" className="size-4.5" />
              Search Rooms
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href="/flatmates"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-13 px-6 sm:min-w-44",
              )}
            >
              <UsersRound aria-hidden="true" className="size-4.5" />
              Find a Flatmate
            </Link>
          </div>
        </div>

        <div className="surface-card mx-auto mt-12 max-w-6xl p-4 sm:mt-16 sm:p-6">
          <div className="mb-5 flex items-start gap-3 sm:items-center">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <MapPin aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold sm:text-lg">
                Where would you like to live?
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Add a few preferences to narrow your search.
              </p>
            </div>
          </div>

          <form
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1.25fr_0.9fr_1fr_auto]"
            aria-label="Search for a place"
          >
            <div className="space-y-2">
              <label htmlFor="city" className={labelClassName}>
                City
              </label>
              <div className="relative">
                <MapPin
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-primary"
                />
                <select
                  id="city"
                  defaultValue="bengaluru"
                  className={cn(fieldClassName, "appearance-none pl-10 pr-9")}
                >
                  <option value="bengaluru">Bengaluru</option>
                  <option value="mumbai">Mumbai</option>
                  <option value="delhi-ncr">Delhi NCR</option>
                  <option value="hyderabad">Hyderabad</option>
                  <option value="pune">Pune</option>
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="locality" className={labelClassName}>
                Locality
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  id="locality"
                  type="text"
                  placeholder="Koramangala, HSR..."
                  className={cn(fieldClassName, "pl-10")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="budget" className={labelClassName}>
                Budget
              </label>
              <div className="relative">
                <IndianRupee
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <select
                  id="budget"
                  defaultValue="any"
                  className={cn(fieldClassName, "appearance-none pl-10 pr-9")}
                >
                  <option value="any">Any budget</option>
                  <option value="under-10k">Under ₹10,000</option>
                  <option value="10k-20k">₹10,000–₹20,000</option>
                  <option value="20k-30k">₹20,000–₹30,000</option>
                  <option value="above-30k">Above ₹30,000</option>
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="move-in-date" className={labelClassName}>
                Move-in date
              </label>
              <div className="relative">
                <CalendarDays
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  id="move-in-date"
                  type="date"
                  className={cn(fieldClassName, "pl-10")}
                />
              </div>
            </div>

            <div className="flex items-end sm:col-span-2 xl:col-span-1">
              <Button
                type="button"
                size="lg"
                className="h-13 w-full px-6 xl:w-auto"
              >
                <Search aria-hidden="true" className="size-4.5" />
                Search
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
