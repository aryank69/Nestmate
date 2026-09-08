import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MoveInChecklist } from "@/components/move-in/move-in-checklist";
import { Navbar } from "@/components/navbar";
import { buttonVariants } from "@/components/ui/button";
import { loadMoveInChecklist } from "@/lib/move-in-checklist-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function MoveInChecklistPage({
  params,
}: {
  params: Promise<{ checklistId: string }>;
}) {
  const { checklistId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    redirect(`/login?next=/move-in/${encodeURIComponent(checklistId)}`);
  }
  const checklist = await loadMoveInChecklist(claims.sub, checklistId);
  if (!checklist) notFound();

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <div className="mx-auto max-w-3xl">
            <Link
              href="/activity?stage=FINALIZED"
              className={cn(buttonVariants({ variant: "ghost" }), "mb-5 px-0")}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to finalized activity
            </Link>
            <MoveInChecklist checklist={checklist} />
          </div>
        </section>
      </main>
    </>
  );
}
