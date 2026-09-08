import { notFound, redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { SupportCaseView } from "@/components/support/support-case-view";
import { getSupportContext, loadSupportCase } from "@/lib/support-data";

export default async function SupportCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const context = await getSupportContext();
  const { caseId } = await params;
  if (!context) redirect(`/login?next=/support/${encodeURIComponent(caseId)}`);
  const supportCase = await loadSupportCase(context, caseId);
  if (!supportCase) notFound();

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <SupportCaseView supportCase={supportCase} />
        </section>
      </main>
    </>
  );
}
