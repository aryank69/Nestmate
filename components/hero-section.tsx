import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Building2,
  CheckCircle2,
  HeartHandshake,
  House,
  MapPinned,
  Search,
  ShieldCheck,
  Sparkles,
  UserRoundSearch,
  UsersRound,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const discoveryPaths = [
  {
    eyebrow: "I need a place",
    title: "Find a Room",
    description:
      "Browse real rooms, shared flats, and PGs by city, locality, budget, commute, and move-in date.",
    href: "/rooms",
    cta: "Explore homes",
    icon: BedDouble,
    points: ["Photos and practical details", "Transparent fit and readiness", "Save and compare options"],
  },
  {
    eyebrow: "I need a person",
    title: "Find a Roommate",
    description:
      "Meet compatible people using shared preferences, preferred localities, budget, lifestyle, and timing.",
    href: "/flatmates",
    cta: "Discover roommates",
    icon: UsersRound,
    points: ["Explainable compatibility", "Privacy-safe profiles", "Shortlist and message"],
  },
] as const;

export function HeroSection() {
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border/60 py-14 sm:py-20 lg:py-24">
        <div aria-hidden="true" className="absolute -left-28 top-12 -z-10 size-72 rounded-full bg-brand-saffron/10 blur-3xl sm:size-[26rem]" />
        <div aria-hidden="true" className="absolute -right-32 top-1/3 -z-10 size-72 rounded-full bg-brand-teal/10 blur-3xl sm:size-[28rem]" />

        <div className="content-shell">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card px-3.5 py-1.5 text-[0.8125rem] font-semibold text-primary shadow-sm">
              <Sparkles aria-hidden="true" className="size-3.5" />
              Your next home starts with the right path
            </div>
            <h1 className="mt-6 text-[clamp(2.65rem,7vw,5.25rem)] font-semibold leading-[0.98] tracking-[-0.065em]">
              Find your room. Find your roommate.{" "}
              <span className="text-primary">Feel at home.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Two simple ways to begin, with real listings and transparent compatibility—not another confusing property dashboard.
            </p>
            <div className="mx-auto mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
              <Link href="/rooms" className={cn(buttonVariants({ size: "lg" }), "group h-13 px-6")}>
                <Search aria-hidden="true" className="size-4.5" />
                Find a Room
                <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/flatmates" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "group h-13 bg-card px-6")}>
                <UserRoundSearch aria-hidden="true" className="size-4.5" />
                Find a Roommate
                <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Have a room or property available?{" "}
              <Link
                href="/list-property"
                className="inline-flex items-center gap-1.5 rounded-md font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/25"
              >
                <Building2 aria-hidden="true" className="size-4" />
                List a Property
              </Link>
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-6xl gap-4 lg:mt-16 lg:grid-cols-2">
            {discoveryPaths.map((path, index) => (
              <article key={path.title} className="group rounded-3xl border border-border/75 bg-card p-5 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg sm:p-7">
                <div className="flex items-start gap-4">
                  <span className={cn(
                    "flex size-12 shrink-0 items-center justify-center rounded-2xl",
                    index === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                  )}>
                    <path.icon aria-hidden="true" className="size-5.5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{path.eyebrow}</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{path.title}</h2>
                  </div>
                </div>
                <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{path.description}</p>
                <ul className="mt-5 grid gap-2.5 text-sm sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {path.points.map((point) => (
                    <li key={point} className="flex items-start gap-2 rounded-xl bg-muted/45 px-3 py-2.5 leading-5">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                      {point}
                    </li>
                  ))}
                </ul>
                <Link href={path.href} className={cn(buttonVariants({ variant: index === 0 ? "default" : "outline" }), "mt-6 w-full sm:w-auto")}>
                  {path.cta} <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 bg-muted/20 py-14 sm:py-20">
        <div className="content-shell">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-primary">How NestMate works</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">From searching to settling in, without the clutter.</h2>
          </div>
          <div className="mx-auto mt-9 grid max-w-6xl gap-4 md:grid-cols-3">
            {[
              { icon: MapPinned, step: "01", title: "Choose your path", text: "Search homes directly, or start with people who share your living preferences." },
              { icon: ShieldCheck, step: "02", title: "Compare with context", text: "Use transparent fit, trust, readiness, and locality signals to make a clearer shortlist." },
              { icon: HeartHandshake, step: "03", title: "Connect confidently", text: "Message, plan visits, save options, and manage your progress from the same account." },
            ].map((item) => (
              <article key={item.step} className="rounded-3xl border border-border/70 bg-card p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><item.icon aria-hidden="true" className="size-5" /></span>
                  <span className="text-xs font-bold tracking-[0.14em] text-muted-foreground">{item.step}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
              </article>
            ))}
          </div>

          <div className="mx-auto mt-8 flex max-w-6xl flex-col items-start justify-between gap-5 rounded-3xl border border-primary/15 bg-primary/[0.045] p-5 sm:flex-row sm:items-center sm:p-7">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><House aria-hidden="true" className="size-5" /></span>
              <div>
                <h2 className="text-lg font-semibold">Ready to find your next place?</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Start with rooms or roommates—you can switch paths anytime.</p>
              </div>
            </div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
              <Link href="/rooms" className={buttonVariants()}>Find a Room</Link>
              <Link href="/flatmates" className={buttonVariants({ variant: "outline" })}>Find a Roommate</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
