"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  MapPin,
  MessageSquareText,
  UsersRound,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { communityPath } from "@/lib/community";
import { cn } from "@/lib/utils";
import type { CommunityLocationOption } from "@/types/community";

const selectClassName =
  "h-12 w-full appearance-none rounded-xl border border-input bg-background pl-10 pr-10 text-sm font-semibold text-foreground shadow-xs outline-none transition-[border-color,box-shadow] hover:border-border focus:border-primary focus:ring-3 focus:ring-ring/15";

export function CommunityDirectory({
  locations,
}: {
  locations: CommunityLocationOption[];
}) {
  const cities = useMemo(
    () => [...new Set(locations.map((location) => location.city))],
    [locations],
  );
  const [selectedCity, setSelectedCity] = useState(cities[0] ?? "");
  const cityLocations = useMemo(
    () => locations.filter((location) => location.city === selectedCity),
    [locations, selectedCity],
  );
  const [selectedCommunityId, setSelectedCommunityId] = useState(
    cityLocations[0]?.id ?? "",
  );
  const selectedCommunity =
    cityLocations.find((location) => location.id === selectedCommunityId) ??
    cityLocations[0];

  const changeCity = (city: string) => {
    setSelectedCity(city);
    setSelectedCommunityId(
      locations.find((location) => location.city === city)?.id ?? "",
    );
  };

  return (
    <>
      <section className="border-b border-border/70 bg-card/45">
        <div className="content-shell py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <UsersRound aria-hidden="true" className="size-4" />
              Local communities
            </div>
            <div className="mt-4 max-w-3xl">
              <h1 className="text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
                Find your neighbourhood community.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Choose a city and locality to see housing posts from people in
                that exact area.
              </p>
            </div>

            <div className="surface-card mt-9 grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-5">
              <SelectField
                id="directory-city"
                label="City"
                value={selectedCity}
                onChange={changeCity}
                options={cities.map((city) => ({ value: city, label: city }))}
              />
              <SelectField
                id="directory-locality"
                label="Locality"
                value={selectedCommunity?.id ?? ""}
                onChange={setSelectedCommunityId}
                options={cityLocations.map((location) => ({
                  value: location.id,
                  label: location.locality,
                }))}
              />
              {selectedCommunity ? (
                <Link
                  href={communityPath(selectedCommunity)}
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-12 w-full px-6 sm:w-auto",
                  )}
                >
                  Enter Community
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="content-shell py-10 sm:py-14">
        <div className="mx-auto max-w-5xl">
          <div>
            <p className="text-sm font-semibold text-primary">{selectedCity}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
              Choose a locality
            </h2>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cityLocations.map((location) => (
              <Link
                key={location.id}
                href={communityPath(location)}
                className="surface-card group flex min-h-48 flex-col p-5 outline-none transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/25"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  <Building2 aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{location.locality}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{location.city}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5 text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <UsersRound aria-hidden="true" className="size-3.5" />
                    {location.memberCount} {location.memberCount === 1 ? "member" : "members"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MessageSquareText aria-hidden="true" className="size-3.5" />
                    {location.postCount} {location.postCount === 1 ? "post" : "posts"}
                  </span>
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Enter community
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            ))}
          </div>

          {!cityLocations.length ? (
            <div className="surface-card mt-6 px-6 py-12 text-center text-sm text-muted-foreground">
              No active locality communities are available in this city yet.
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <MapPin
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-primary"
        />
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={selectClassName}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  );
}
