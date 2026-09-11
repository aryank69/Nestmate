import { HouseHeart } from "lucide-react";
import { redirect } from "next/navigation";

import { HouseholdPage } from "@/components/household/household-page";
import { Navbar } from "@/components/navbar";
import { loadHouseholds } from "@/lib/household-data";
import { householdMonthValue } from "@/lib/household";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HouseholdRoute({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login?next=/household");

  const params = await searchParams;
  const selectedMonth = householdMonthValue(
    Array.isArray(params.month) ? params.month[0] : params.month,
  );
  const pageData = await loadHouseholds(data.claims.sub, selectedMonth);
  if (!pageData) redirect("/profile");

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <div className="mx-auto max-w-5xl">
            <header className="mb-6 sm:mb-8">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
                <HouseHeart aria-hidden="true" className="size-3.5" />
                Private to active household members
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Our household</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Coordinate recurring chores, utilities, rent reminders, shared expenses,
                and simple house notes after move-in. Roomzi never processes payments.
              </p>
            </header>
            <HouseholdPage data={pageData} />
          </div>
        </section>
      </main>
    </>
  );
}
