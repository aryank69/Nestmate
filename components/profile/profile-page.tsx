"use client";

import { type FormEvent, useState, useTransition } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CigaretteOff,
  Clock3,
  Edit3,
  IndianRupee,
  LocateFixed,
  LoaderCircle,
  MapPin,
  MoonStar,
  PawPrint,
  Route,
  Save,
  Sparkles,
  UserRound,
  Utensils,
  Wine,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TrustBadges } from "@/components/verification/trust-badges";
import { updateProfileAction } from "@/app/profile/actions";
import { cn } from "@/lib/utils";
import type {
  LifestylePreferences,
  UserProfile,
} from "@/types/profile";

type ProfileDraft = Omit<
  UserProfile,
  "age" | "preferredLocalities" | "commute"
> & {
  age: string;
  preferredLocalities: string;
  commute: {
    destination: string;
    latitude: string;
    longitude: string;
    preferredRangeKm: string;
  };
};

const inputClassName =
  "h-12 w-full rounded-xl border border-input bg-background px-4 text-[0.9375rem] font-medium text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-muted-foreground/75 hover:border-border focus:border-primary focus:ring-3 focus:ring-ring/15";

const labelClassName = "text-sm font-semibold text-foreground";

const lifestyleFields: Array<{
  key: keyof LifestylePreferences;
  label: string;
  icon: typeof Utensils;
  options: string[];
}> = [
  {
    key: "diet",
    label: "Food preference",
    icon: Utensils,
    options: ["Vegetarian", "Non-vegetarian", "Eggetarian", "Vegan"],
  },
  {
    key: "smoking",
    label: "Smoking",
    icon: CigaretteOff,
    options: ["Non-smoker", "Occasionally", "Regularly"],
  },
  {
    key: "drinking",
    label: "Drinking",
    icon: Wine,
    options: ["Never", "Occasionally", "Regularly"],
  },
  {
    key: "sleepSchedule",
    label: "Sleep schedule",
    icon: MoonStar,
    options: ["Early bird", "Night owl", "Flexible"],
  },
  {
    key: "cleanliness",
    label: "Cleanliness",
    icon: Sparkles,
    options: ["Very tidy", "Moderately tidy", "Relaxed"],
  },
  {
    key: "pets",
    label: "Pets",
    icon: PawPrint,
    options: ["Pet friendly", "Prefer no pets", "Have a pet"],
  },
  {
    key: "status",
    label: "Work / study",
    icon: BriefcaseBusiness,
    options: [
      "Working professional",
      "Student",
      "Freelancer",
      "Self-employed",
      "Other",
    ],
  },
];

function createDraft(profile: UserProfile): ProfileDraft {
  return {
    ...profile,
    age: profile.age ? String(profile.age) : "",
    preferredLocalities: profile.preferredLocalities.join(", "),
    commute: {
      destination: profile.commute.destination,
      latitude:
        profile.commute.latitude === null ? "" : String(profile.commute.latitude),
      longitude:
        profile.commute.longitude === null
          ? ""
          : String(profile.commute.longitude),
      preferredRangeKm:
        profile.commute.preferredRangeKm === null
          ? ""
          : String(profile.commute.preferredRangeKm),
    },
  };
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatMoveInDate(date: string) {
  if (!date) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date + "T00:00:00"));
}

type ProfilePageProps = {
  initialProfile: UserProfile;
  accountEmail?: string;
};

export function ProfilePage({
  initialProfile,
  accountEmail,
}: ProfilePageProps) {
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    createDraft(initialProfile),
  );
  const [isEditing, setIsEditing] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");

  const startEditing = () => {
    setDraft(createDraft(profile));
    setSaveNotice(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraft(createDraft(profile));
    setSaveNotice(null);
    setIsEditing(false);
  };

  const updateDraft = (
    field: Exclude<keyof ProfileDraft, "preferences">,
    value: string,
  ) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const updatePreference = (
    field: keyof LifestylePreferences,
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      preferences: { ...current.preferences, [field]: value },
    }));
  };

  const updateCommute = (
    field: keyof ProfileDraft["commute"],
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      commute: { ...current.commute, [field]: value },
    }));
  };

  const useCurrentDestination = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Location access is unavailable in this browser.");
      return;
    }

    setIsLocating(true);
    setLocationStatus("Finding your destination pin…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDraft((current) => ({
          ...current,
          commute: {
            ...current.commute,
            latitude: coords.latitude.toFixed(6),
            longitude: coords.longitude.toFixed(6),
          },
        }));
        setLocationStatus("Destination pin added. Give it a recognizable name.");
        setIsLocating(false);
      },
      () => {
        setLocationStatus(
          "We could not access your location. Enter the coordinates manually.",
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const preferredLocalities = draft.preferredLocalities
      .split(",")
      .map((locality) => locality.trim())
      .filter(Boolean);

    const nextProfile: UserProfile = {
      ...draft,
      age: Number(draft.age),
      preferredLocalities,
      commute: {
        destination: draft.commute.destination,
        latitude: draft.commute.latitude
          ? Number(draft.commute.latitude)
          : null,
        longitude: draft.commute.longitude
          ? Number(draft.commute.longitude)
          : null,
        preferredRangeKm: draft.commute.preferredRangeKm
          ? Number(draft.commute.preferredRangeKm)
          : null,
      },
    };

    startSaving(async () => {
      const result = await updateProfileAction(nextProfile);
      setSaveNotice({ success: result.success, message: result.message });

      if (result.success && result.profile) {
        setProfile(result.profile);
        setDraft(createDraft(result.profile));
        setIsEditing(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  if (isEditing) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">Your profile</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Edit profile
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Keep your details clear so future flatmates can understand your
              housing needs and lifestyle at a glance.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={cancelEditing}
          >
            <X aria-hidden="true" className="size-4" />
            Cancel
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <section className="surface-card p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <UserRound aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">Personal details</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  The basics people will see on your profile.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-x-5 gap-y-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="profile-name" className={labelClassName}>
                  Name
                </label>
                <input
                  id="profile-name"
                  required
                  value={draft.name}
                  onChange={(event) =>
                    updateDraft("name", event.target.value)
                  }
                  className={inputClassName}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="profile-age" className={labelClassName}>
                  Age
                </label>
                <input
                  id="profile-age"
                  type="number"
                  min="18"
                  max="99"
                  value={draft.age}
                  onChange={(event) => updateDraft("age", event.target.value)}
                  className={inputClassName}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="profile-profession" className={labelClassName}>
                  Profession
                </label>
                <input
                  id="profile-profession"
                  value={draft.profession}
                  onChange={(event) =>
                    updateDraft("profession", event.target.value)
                  }
                  placeholder="e.g. Product designer"
                  className={inputClassName}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="profile-organization" className={labelClassName}>
                  Company / college
                </label>
                <input
                  id="profile-organization"
                  value={draft.organization}
                  onChange={(event) =>
                    updateDraft("organization", event.target.value)
                  }
                  placeholder="e.g. FinNova"
                  className={inputClassName}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="profile-bio" className={labelClassName}>
                  Short bio
                </label>
                <textarea
                  id="profile-bio"
                  rows={5}
                  maxLength={500}
                  value={draft.bio}
                  onChange={(event) => updateDraft("bio", event.target.value)}
                  className={cn(
                    inputClassName,
                    "h-auto min-h-32 resize-y py-3 leading-6",
                  )}
                />
                <p className="text-right text-xs text-muted-foreground">
                  {draft.bio.length}/500
                </p>
              </div>
            </div>
          </section>

          <section className="surface-card p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <MapPin aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">Housing preferences</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Where and when you would like to move.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-x-5 gap-y-6 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="profile-localities" className={labelClassName}>
                  Preferred localities
                </label>
                <input
                  id="profile-localities"
                  value={draft.preferredLocalities}
                  onChange={(event) =>
                    updateDraft("preferredLocalities", event.target.value)
                  }
                  placeholder="Indiranagar, Koramangala, HSR Layout"
                  className={inputClassName}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Separate multiple localities with commas.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="profile-budget" className={labelClassName}>
                  Monthly budget
                </label>
                <div className="relative">
                  <IndianRupee
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    id="profile-budget"
                    value={draft.budget}
                    onChange={(event) =>
                      updateDraft("budget", event.target.value)
                    }
                    placeholder="₹18,000–₹25,000"
                    className={cn(inputClassName, "pl-10")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="profile-move-in" className={labelClassName}>
                  Move-in date
                </label>
                <div className="relative">
                  <CalendarDays
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    id="profile-move-in"
                    type="date"
                    value={draft.moveInDate}
                    onChange={(event) =>
                      updateDraft("moveInDate", event.target.value)
                    }
                    className={cn(inputClassName, "pl-10")}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 sm:col-span-2 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <Route aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold">Commute destination</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Add a workplace, college, or important destination to compare listing distances.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <label htmlFor="profile-commute-destination" className={labelClassName}>
                      Destination name <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <input
                      id="profile-commute-destination"
                      maxLength={120}
                      value={draft.commute.destination}
                      onChange={(event) => updateCommute("destination", event.target.value)}
                      placeholder="e.g. Manyata Tech Park or IIT Delhi"
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="profile-commute-latitude" className={labelClassName}>Latitude</label>
                    <input
                      id="profile-commute-latitude"
                      type="number"
                      min="-90"
                      max="90"
                      step="any"
                      inputMode="decimal"
                      value={draft.commute.latitude}
                      onChange={(event) => updateCommute("latitude", event.target.value)}
                      placeholder="e.g. 13.0358"
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="profile-commute-longitude" className={labelClassName}>Longitude</label>
                    <input
                      id="profile-commute-longitude"
                      type="number"
                      min="-180"
                      max="180"
                      step="any"
                      inputMode="decimal"
                      value={draft.commute.longitude}
                      onChange={(event) => updateCommute("longitude", event.target.value)}
                      placeholder="e.g. 77.6203"
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="profile-commute-range" className={labelClassName}>
                      Preferred maximum commute
                    </label>
                    <div className="relative">
                      <Route aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="profile-commute-range"
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        inputMode="numeric"
                        value={draft.commute.preferredRangeKm}
                        onChange={(event) => updateCommute("preferredRangeKm", event.target.value)}
                        placeholder="e.g. 10 km"
                        className={cn(inputClassName, "pl-10")}
                      />
                    </div>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={useCurrentDestination}
                      disabled={isLocating}
                      className="w-full"
                    >
                      {isLocating ? (
                        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                      ) : (
                        <LocateFixed aria-hidden="true" className="size-4" />
                      )}
                      {isLocating ? "Locating…" : "Use Current Location"}
                    </Button>
                  </div>
                </div>
                {locationStatus ? (
                  <p role="status" className="mt-3 text-sm text-muted-foreground">{locationStatus}</p>
                ) : null}
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Your destination coordinates stay private and are used only to calculate approximate distances for you.
                </p>
              </div>
            </div>
          </section>

          <section className="surface-card p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
                <Sparkles aria-hidden="true" className="size-5 text-primary" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">
                  Lifestyle preferences
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Simple details that help set expectations.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-x-5 gap-y-6 sm:grid-cols-2">
              {lifestyleFields.map((field) => {
                const Icon = field.icon;

                return (
                  <div key={field.key} className="space-y-2">
                    <label
                      htmlFor={"preference-" + field.key}
                      className={labelClassName}
                    >
                      {field.label}
                    </label>
                    <div className="relative">
                      <Icon
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      />
                      <select
                        id={"preference-" + field.key}
                        value={draft.preferences[field.key]}
                        onChange={(event) =>
                          updatePreference(field.key, event.target.value)
                        }
                        className={cn(
                          inputClassName,
                          "appearance-none pl-10 pr-9",
                        )}
                      >
                        <option>Not set</option>
                        {field.options.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                      <ChevronDown
                        aria-hidden="true"
                        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {saveNotice && !saveNotice.success ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive"
            >
              {saveNotice.message}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isSaving}
              onClick={cancelEditing}
            >
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={isSaving}>
              {isSaving ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Save aria-hidden="true" className="size-4" />
              )}
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {saveNotice?.success ? (
        <div
          role="status"
          className="mb-5 flex items-center gap-2 rounded-xl border border-secondary bg-secondary/55 px-4 py-3 text-sm font-semibold text-secondary-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="size-4.5" />
          {saveNotice.message}
        </div>
      ) : null}

      <section className="surface-card overflow-hidden">
        <div className="h-2 bg-primary" />
        <div className="p-5 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-secondary text-2xl font-bold tracking-[-0.04em] text-secondary-foreground ring-8 ring-secondary/35 sm:size-24 sm:text-3xl">
              {getInitials(profile.name)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                  {profile.name}
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
                  <CheckCircle2 aria-hidden="true" className="size-3.5" />
                  Profile preview
                </span>
              </div>
              <TrustBadges
                verification={profile.verification}
                showDisclaimer
                className="mt-3"
              />
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted-foreground">
                <span className="font-medium text-foreground">
                  {profile.profession || "Add your profession"}
                </span>
                {profile.organization ? (
                  <>
                    <span aria-hidden="true">•</span>
                    <span>{profile.organization}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <BriefcaseBusiness
                  aria-hidden="true"
                  className="size-4 text-primary"
                />
                {profile.preferences.status}
              </p>
              {accountEmail ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium">Account:</span>
                  <span className="truncate">{accountEmail}</span>
                </p>
              ) : null}
            </div>

            <Button
              type="button"
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={startEditing}
            >
              <Edit3 aria-hidden="true" className="size-4" />
              Edit Profile
            </Button>
          </div>

          <dl className="mt-7 grid gap-3 border-t border-border/70 pt-6 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted/50 px-4 py-4">
              <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <UserRound aria-hidden="true" className="size-3.5 text-primary" />
                Age
              </dt>
              <dd className="mt-1.5 text-sm font-semibold">
                {profile.age ? `${profile.age} years` : "Not set"}
              </dd>
            </div>
            <div className="rounded-2xl bg-muted/50 px-4 py-4">
              <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <IndianRupee
                  aria-hidden="true"
                  className="size-3.5 text-primary"
                />
                Monthly budget
              </dt>
              <dd className="mt-1.5 text-sm font-semibold">
                {profile.budget || "Not set"}
              </dd>
            </div>
            <div className="rounded-2xl bg-muted/50 px-4 py-4">
              <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <CalendarDays
                  aria-hidden="true"
                  className="size-3.5 text-primary"
                />
                Move-in
              </dt>
              <dd className="mt-1.5 text-sm font-semibold">
                {formatMoveInDate(profile.moveInDate)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="surface-card p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <UserRound aria-hidden="true" className="size-4.5 text-primary" />
            <h2 className="text-lg font-semibold">About</h2>
          </div>
          <p className="mt-4 text-[0.9375rem] leading-7 text-muted-foreground">
            {profile.bio || "Add a short bio to introduce yourself."}
          </p>
        </section>

        <section className="surface-card p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <MapPin aria-hidden="true" className="size-4.5 text-primary" />
            <h2 className="text-lg font-semibold">Preferred localities</h2>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.preferredLocalities.map((locality) => (
              <span
                key={locality}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs"
              >
                <MapPin
                  aria-hidden="true"
                  className="size-3.5 text-primary"
                />
                {locality}
              </span>
            ))}
            {profile.preferredLocalities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No preferred localities added yet.
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <section className="surface-card mt-6 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <Route aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Commute preference</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {profile.commute.destination || "No destination added yet."}
            </p>
            {profile.commute.preferredRangeKm ? (
              <p className="mt-2 text-sm font-semibold text-foreground">
                Prefer listings within {profile.commute.preferredRangeKm} km
              </p>
            ) : null}
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          The destination pin is private. Other members can only see your preferred commute range.
        </p>
      </section>

      <section className="surface-card mt-6 p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">Lifestyle preferences</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A quick view of everyday habits and home expectations.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lifestyleFields.map((field) => {
            const Icon = field.icon;

            return (
              <div
                key={field.key}
                className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-4"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-xs">
                  <Icon aria-hidden="true" className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    {field.label}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold">
                    {profile.preferences[field.key]}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <Clock3 aria-hidden="true" className="size-3.5" />
        Your profile and preferences are saved securely to your account.
      </p>
    </div>
  );
}
