import { FileLock2 } from "lucide-react";
import { redirect } from "next/navigation";

import { DocumentSharing } from "@/components/documents/document-sharing";
import { Navbar } from "@/components/navbar";
import { loadSharedDocuments } from "@/lib/shared-documents-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DocumentsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login?next=/documents");

  const pageData = await loadSharedDocuments(claims.sub);
  if (!pageData) redirect("/profile");

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <div className="mx-auto max-w-5xl">
            <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
                  <FileLock2 aria-hidden="true" className="size-3.5" />
                  Private document sharing · versioned
                </span>
                <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Move-in hub</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Track shared milestones and exchange only the files needed for a finalized move-in. Every participant records their own progress; nothing here is legal or payment verification.
                </p>
              </div>
            </header>
            <DocumentSharing viewerId={pageData.viewerId} spaces={pageData.spaces} />
          </div>
        </section>
      </main>
    </>
  );
}
