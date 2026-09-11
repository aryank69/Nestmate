"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  Home,
  IndianRupee,
  LocateFixed,
  MapPin,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import {
  saveOnboardingAction,
  skipOnboardingAction,
} from "@/app/onboarding/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { ONBOARDING_INTENTS } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import {
  initialOnboardingActionState,
  type OnboardingDefaults,
  type OnboardingIntent,
  type OnboardingLocation,
} from "@/types/onboarding";

const intentIcons = {
  FIND_ROOM: Search,
  FIND_ROOMMATE: UsersRound,
  LIST_PROPERTY: Building2,
  POST_REQUIREMENT: Home,
} satisfies Record<OnboardingIntent, typeof Search>;

const inputClassName =
  "h-12 w-full rounded-xl border border-input bg-background px-4 text-[0.9375rem] font-medium text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-muted-foreground/75 hover:border-border focus:border-primary focus:ring-3 focus:ring-ring/15 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/10";
const labelClassName = "text-sm font-semibold text-foreground";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export function OnboardingForm({
  locations,
  defaults,
  nextPath,
  isEditing,
  error,
}: {
  locations: OnboardingLocation[];
  defaults: OnboardingDefaults;
  nextPath: string;
  isEditing: boolean;
  error?: string;
}) {
  const initialLocation =
    locations.find(({ id }) => id === defaults.communityId) ?? locations[0];
  const [intent, setIntent] = useState<OnboardingIntent | null>(
    defaults.intent,
  );
  const [selectedCity, setSelectedCity] = useState(initialLocation.city);
  const [communityId, setCommunityId] = useState(initialLocation.id);
  const [commuteDestination, setCommuteDestination] = useState(
    defaults.commuteDestination,
  );
  const [commuteLatitude, setCommuteLatitude] = useState(
    defaults.commuteLatitude,
  );
  const [commuteLongitude, setCommuteLongitude] = useState(
    defaults.commuteLongitude,
  );
  const [locationMessage, setLocationMessage] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [state, formAction, isPending] = useActionState(
    saveOnboardingAction,
    initialOnboardingActionState,
  );

  const cities = useMemo(
    () => [...new Set(locations.map(({ city }) => city))],
    [locations],
  );
  const localityOptions = locations.filter(
    ({ city }) => city === selectedCity,
  );

  function chooseCity(city: string) {
    setSelectedCity(city);
    const firstLocality = locations.find((location) => location.city === city);
    if (firstLocality) setCommunityId(firstLocality.id);
  }

  function updateDestination(value: string) {
    setCommuteDestination(value);
    if (commuteLatitude || commuteLongitude) {
      setCommuteLatitude("");
      setCommuteLongitude("");
      setLocationMessage("Destination changed. Add its location again if you want distance-based matches.");
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser. You can continue without it.");
      return;
    }

    setIsLocating(true);
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCommuteLatitude(coords.latitude.toFixed(6));
        setCommuteLongitude(coords.longitude.toFixed(6));
        setCommuteDestination((current) => current || "Important destination");
        setLocationMessage("Location saved privately for distance-based matches.");
        setIsLocating(false);
      },
      () => {
        setLocationMessage("We could not access your location. You can continue without it.");
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 text-center sm:mb-8">
        <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Home aria-hidden="true" className="size-5" />
        </span>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-primary">
          {isEditing ? "Discovery setup" : "Welcome to Roomzi"}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {isEditing ? "Update what you’re looking for" : "Let’s find your next best step"}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          A few essentials help us open the right search or posting flow. You can change these details later.
        </p>
      </div>

      <form action={formAction} className="rounded-3xl border border-border/80 bg-card p-4 shadow-lg shadow-foreground/5 sm:p-7 lg:p-8">
        <fieldset>
          <legend className={labelClassName}>What brings you to Roomzi?</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {ONBOARDING_INTENTS.map((option) => {
              const Icon = intentIcons[option.value];
              const selected = intent === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "relative flex cursor-pointer gap-3 rounded-2xl border p-4 transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm",
                    selected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/10"
                      : "border-border bg-background",
                  )}
                >
                  <input
                    type="radio"
                    name="intent"
                    value={option.value}
                    checked={selected}
                    onChange={() => setIntent(option.value)}
                    className="sr-only"
                    aria-describedby="intent-error"
                  />
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    <Icon aria-hidden="true" className="size-4.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                      {option.label}
                      {selected ? <Check aria-hidden="true" className="size-4 text-primary" /> : null}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-2">
            <FieldError id="intent-error" message={state.errors.intent} />
          </div>
        </fieldset>

        <div className="my-6 h-px bg-border/80" />

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MapPin aria-hidden="true" className="size-4 text-primary" />
              City
            </span>
            <select
              value={selectedCity}
              onChange={(event) => chooseCity(event.target.value)}
              className={inputClassName}
            >
              {cities.map((city) => <option key={city}>{city}</option>)}
            </select>
          </label>

          <label className="space-y-2">
            <span className={labelClassName}>Locality</span>
            <select
              name="communityId"
              value={communityId}
              onChange={(event) => setCommunityId(event.target.value)}
              className={inputClassName}
              aria-invalid={Boolean(state.errors.communityId)}
              aria-describedby="community-error"
            >
              {localityOptions.map((location) => (
                <option key={location.id} value={location.id}>{location.locality}</option>
              ))}
            </select>
            <FieldError id="community-error" message={state.errors.communityId} />
          </label>

          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <IndianRupee aria-hidden="true" className="size-4 text-primary" />
              Minimum monthly budget
            </span>
            <input
              name="budgetMin"
              type="number"
              min="0"
              max="10000000"
              step="500"
              required
              defaultValue={defaults.budgetMin}
              placeholder="10,000"
              className={inputClassName}
              aria-invalid={Boolean(state.errors.budgetMin)}
              aria-describedby="budget-min-error"
            />
            <FieldError id="budget-min-error" message={state.errors.budgetMin} />
          </label>

          <label className="space-y-2">
            <span className={labelClassName}>Maximum monthly budget</span>
            <input
              name="budgetMax"
              type="number"
              min="0"
              max="10000000"
              step="500"
              required
              defaultValue={defaults.budgetMax}
              placeholder="25,000"
              className={inputClassName}
              aria-invalid={Boolean(state.errors.budgetMax)}
              aria-describedby="budget-max-error"
            />
            <FieldError id="budget-max-error" message={state.errors.budgetMax} />
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarDays aria-hidden="true" className="size-4 text-primary" />
              Move-in date
            </span>
            <input
              name="moveInDate"
              type="date"
              required
              defaultValue={defaults.moveInDate}
              className={cn(inputClassName, "sm:max-w-[calc(50%-0.625rem)]")}
              aria-invalid={Boolean(state.errors.moveInDate)}
              aria-describedby="move-in-error"
            />
            <FieldError id="move-in-error" message={state.errors.moveInDate} />
          </label>
        </div>

        <details className="mt-6 rounded-2xl border border-border bg-muted/25 p-4 open:bg-muted/15 sm:p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span>
              <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                <BriefcaseBusiness aria-hidden="true" className="size-4 text-primary" />
                Add a commute preference
                <span className="font-medium text-muted-foreground">Optional</span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Helps order places by approximate travel distance.
              </span>
            </span>
            <span className="text-xs font-semibold text-primary">Add</span>
          </summary>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-2">
              <span className={labelClassName}>Workplace, college, or important destination</span>
              <input
                name="commuteDestination"
                value={commuteDestination}
                onChange={(event) => updateDestination(event.target.value)}
                maxLength={120}
                placeholder="For example, Manyata Tech Park"
                className={inputClassName}
                aria-invalid={Boolean(state.errors.commuteDestination)}
                aria-describedby="commute-error commute-privacy"
              />
            </label>

            <label className="space-y-2">
              <span className={labelClassName}>Preferred maximum commute</span>
              <select
                name="preferredCommuteKm"
                defaultValue={defaults.preferredCommuteKm}
                className={inputClassName}
              >
                <option value="">No limit</option>
                {[3, 5, 8, 10, 15, 20, 30, 50].map((distance) => (
                  <option key={distance} value={distance}>Within {distance} km</option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <span className={labelClassName}>Approximate destination point</span>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full bg-background"
                onClick={useCurrentLocation}
                disabled={isLocating}
              >
                <LocateFixed aria-hidden="true" className="size-4" />
                {isLocating ? "Finding location…" : commuteLatitude ? "Update location" : "Use current location"}
              </Button>
            </div>

            <input type="hidden" name="commuteLatitude" value={commuteLatitude} />
            <input type="hidden" name="commuteLongitude" value={commuteLongitude} />
            <div className="sm:col-span-2">
              <FieldError id="commute-error" message={state.errors.commuteDestination} />
              {locationMessage ? <p className="mt-1 text-xs font-medium text-muted-foreground" role="status">{locationMessage}</p> : null}
              <p id="commute-privacy" className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Your destination coordinates stay private. They are used only for approximate distance matching and are never added to shared links.
              </p>
            </div>
          </div>
        </details>

        {state.message ? (
          <p className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}
        {error === "skip_failed" ? (
          <p className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive" role="alert">
            We could not save your choice to skip. Please try again.
          </p>
        ) : null}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          {isEditing ? (
            <Link href="/profile" className={cn(buttonVariants({ variant: "ghost" }), "h-11")}>
              Cancel
            </Link>
          ) : null}
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={isPending}>
            {isPending ? "Saving your setup…" : isEditing ? "Save and continue" : "Show my next step"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </form>

      {!isEditing ? (
        <form action={skipOnboardingAction} className="mt-4 text-center">
          <input type="hidden" name="next" value={nextPath} />
          <button type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Skip for now
          </button>
        </form>
      ) : null}
    </div>
  );
}
