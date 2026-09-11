import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Building2,
  ClipboardPenLine,
  HeartHandshake,
  MapPinned,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const roleActions = [
  {
    role: "I need a place",
    title: "Find a Room",
    description:
      "Browse available rooms, shared flats, and PGs using your locality, budget, commute, and move-in needs.",
    href: "/rooms",
    cta: "Browse homes",
    icon: BedDouble,
    iconClass: "bg-primary text-primary-foreground",
  },
  {
    role: "I need the right person",
    title: "Find a Roommate",
    description:
      "Discover compatible people by budget, preferred localities, timing, lifestyle, and living preferences.",
    href: "/flatmates",
    cta: "Meet roommates",
    icon: UsersRound,
    iconClass: "bg-secondary text-secondary-foreground",
  },
  {
    role: "I have a place",
    title: "List a Property",
    description:
      "Share a room, flat, or PG with structured details so suitable renters can find and compare it.",
    href: "/list-property",
    cta: "Create a listing",
    icon: Building2,
    iconClass: "bg-brand-saffron/15 text-amber-800",
  },
  {
    role: "I have a specific need",
    title: "Post a Requirement",
    description:
      "Tell people what room or flatmate you need and surface relevant matches in your chosen locality.",
    href: "/post-requirement",
    cta: "Share your need",
    icon: ClipboardPenLine,
    iconClass: "bg-brand-teal/15 text-teal-800",
  },
] as const;

const steps = [
  {
    icon: Search,
    step: "01",
    title: "Choose what you need",
    text: "Start with rooms, roommates, a property listing, or a requirement—without detouring through another flow.",
  },
  {
    icon: ShieldCheck,
    step: "02",
    title: "Review useful context",
    text: "Use locality, fit, trust, readiness, and practical details to build a clearer shortlist.",
  },
  {
    icon: HeartHandshake,
    step: "03",
    title: "Connect and move forward",
    text: "Save, compare, message, plan visits, and track your progress from the same account.",
  },
] as const;

export function HeroSection() {
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border/60 py-12 sm:py-18 lg:py-22">
        <div
          aria-hidden="true"
          className="absolute -left-28 top-12 -z-10 size-72 rounded-full bg-brand-saffron/10 blur-3xl sm:size-[26rem]"
        />
        <div
          aria-hidden="true"
          className="absolute -right-32 top-1/3 -z-10 size-72 rounded-full bg-brand-teal/10 blur-3xl sm:size-[28rem]"
        />

        <div className="content-shell">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card px-3.5 py-1.5 text-[0.8125rem] font-semibold text-primary shadow-sm">
              <Sparkles aria-hidden="true" className="size-3.5" />
              One home search, four clear ways to begin
            </div>
            <h1 className="mt-6 text-[clamp(2.55rem,7vw,5rem)] font-semibold leading-[0.98] tracking-[-0.065em]">
              What brings you to <span className="text-primary">Roomzi?</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Find a place, meet a compatible roommate, list your property, or
              share exactly what you need. Pick your role and start directly.
            </p>
          </div>

          <div
            id="start"
            className="mx-auto mt-10 grid max-w-7xl scroll-mt-24 gap-3 sm:grid-cols-2 lg:mt-12 xl:grid-cols-4"
          >
            {roleActions.map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className="group flex min-h-64 flex-col rounded-3xl border border-border/75 bg-card p-5 shadow-sm outline-none transition-[transform,box-shadow,border-color] hover:-translate-y-1 hover:border-primary/25 hover:shadow-xl hover:shadow-foreground/[0.07] focus-visible:ring-3 focus-visible:ring-ring/25 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <span
                    className={cn(
                      "flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-sm",
                      action.iconClass,
                    )}
                  >
                    <action.icon aria-hidden="true" className="size-5.5" />
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="mt-1 size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
                  />
                </div>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  {action.role}
                </p>
                <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">
                  {action.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {action.description}
                </p>
                <span className="mt-auto pt-5 text-sm font-semibold text-foreground group-hover:text-primary">
                  {action.cta}
                </span>
              </Link>
            ))}
          </div>

          <div className="mx-auto mt-5 flex max-w-7xl flex-col gap-4 rounded-3xl border border-border/70 bg-muted/35 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
                <MapPinned aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">Already know your locality?</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Visit locality communities for structured housing posts,
                  neighbourhood context, and member conversations.
                </p>
              </div>
            </div>
            <Link
              href="/community"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full shrink-0 bg-card sm:w-auto",
              )}
            >
              Explore communities
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="scroll-mt-24 bg-muted/20 py-14 sm:py-20"
      >
        <div className="content-shell">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-primary">
              How Roomzi works
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
              Start in the right place. Move forward with confidence.
            </h2>
          </div>

          <div className="mx-auto mt-9 grid max-w-6xl gap-4 md:grid-cols-3">
            {steps.map((item) => (
              <article
                key={item.step}
                className="rounded-3xl border border-border/70 bg-card p-5 sm:p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <item.icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="text-xs font-bold tracking-[0.14em] text-muted-foreground">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.text}
                </p>
              </article>
            ))}
          </div>

          <div className="mx-auto mt-8 flex max-w-6xl flex-col items-start justify-between gap-5 rounded-3xl border border-primary/15 bg-primary/[0.045] p-5 sm:flex-row sm:items-center sm:p-7">
            <div>
              <h2 className="text-lg font-semibold">
                Not sure which path fits?
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Browse locality communities first, then choose any discovery or
                posting flow when you are ready.
              </p>
            </div>
            <Link
              href="/community"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full bg-card sm:w-auto",
              )}
            >
              Open locality communities
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
