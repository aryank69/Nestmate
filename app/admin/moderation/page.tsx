import { notFound, redirect } from "next/navigation";

import { ProductFunnel } from "@/components/analytics/product-funnel";
import { ModerationDashboard } from "@/components/moderation/moderation-dashboard";
import { Navbar } from "@/components/navbar";
import { loadProductAnalyticsFunnel } from "@/lib/analytics.server";
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

  const [data, funnel] = await Promise.all([
    loadModerationDashboard(context),
    loadProductAnalyticsFunnel(context.user.id),
  ]);
  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <ProductFunnel data={funnel} />
          <ModerationDashboard data={data} />
        </section>
      </main>
    </>
  );
}
