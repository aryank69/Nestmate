import { notFound, redirect } from "next/navigation";

import { ModerationDashboard } from "@/components/moderation/moderation-dashboard";
import { Navbar } from "@/components/navbar";
import {
  getModeratorContext,
  loadModerationDashboard,
} from "@/lib/moderation-data";

export default async function ModerationPage() {
  const context = await getModeratorContext();
  if (context.status === "unauthenticated") {
    redirect("/login?next=/admin/moderation");
  }
  if (context.status !== "authorized") notFound();

  const data = await loadModerationDashboard(context);
  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <ModerationDashboard data={data} />
        </section>
      </main>
    </>
  );
}
