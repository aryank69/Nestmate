import { ExternalLink, MapPin, ShieldCheck } from "lucide-react";

import { getMapProvider } from "@/lib/maps";
import type { PropertyMapLocation } from "@/types/map";

export function PropertyMapFrame({
  location,
  title,
  className = "h-64 w-full sm:h-72",
}: {
  location: PropertyMapLocation;
  title: string;
  className?: string;
}) {
  const provider = getMapProvider();

  return (
    <iframe
      title={title}
      src={provider.embedUrl(location)}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`${className} border-0`}
    />
  );
}

export function PropertyLocationMap({
  location,
  locality,
}: {
  location: PropertyMapLocation;
  locality: string;
}) {
  const provider = getMapProvider();
  const isApproximate = location.precision === "APPROXIMATE";

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-border/80 bg-muted/25">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <MapPin aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h4 className="font-semibold">Property location</h4>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isApproximate
                ? `Approximate area in ${locality}`
                : `Pinned location in ${locality}`}
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/15 bg-primary/[0.06] px-3 py-1.5 text-xs font-semibold text-primary">
          <ShieldCheck aria-hidden="true" className="size-3.5" />
          {isApproximate ? "Approximate location" : "Exact pin shared"}
        </span>
      </div>

      <div className="relative border-y border-border/70 bg-muted">
        <PropertyMapFrame
          location={location}
          title={`Map showing ${isApproximate ? "the approximate area" : "the location"} in ${locality}`}
        />
      </div>

      <div className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <p className="max-w-xl leading-6 text-muted-foreground">
          {isApproximate
            ? "The pin is rounded to a nearby area to protect the poster’s exact address."
            : "The poster chose to share this precise map pin. No street address is displayed."}
        </p>
        <a
          href={provider.externalUrl(location)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-2 font-semibold text-primary outline-none hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/25"
        >
          Open map
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </a>
      </div>
    </section>
  );
}
