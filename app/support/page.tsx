import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { SupportCenter } from "@/components/support/support-center";
import { getSupportContext, loadSupportCases } from "@/lib/support-data";

export default async function SupportPage() {
  const context = await getSupportContext();
  if (!context) redirect("/login?next=/support");
  const cases = await loadSupportCases(context);

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <SupportCenter cases={cases} />
        </section>
      </main>
    </>
  );
}
