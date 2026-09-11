"use client";

import {
  BadgeCheck,
  CheckCircle2,
  Download,
  FileCheck2,
  FileClock,
  FileLock2,
  FilePlus2,
  History,
  LoaderCircle,
  ShieldAlert,
  Trash2,
  Upload,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteSharedDocumentAction,
  markSharedDocumentAcknowledgementAction,
  registerSharedDocumentAction,
  revokeSharedDocumentAction,
} from "@/app/documents/actions";
import { Button } from "@/components/ui/button";
import { FinalizedMilestones } from "@/components/documents/finalized-milestones";
import { FinalizedMatchLifecycle } from "@/components/documents/finalized-match-lifecycle";
import {
  documentAcknowledgementLabel,
  formatDocumentSize,
  groupSharedDocumentVersions,
  sharedDocumentCategoryLabel,
  sharedDocumentPath,
  SHARED_DOCUMENT_BUCKET,
  SHARED_DOCUMENT_CATEGORIES,
  SHARED_DOCUMENT_MIME_TYPES,
  validateSharedDocumentFile,
} from "@/lib/shared-documents";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  DocumentAcknowledgementStatus,
  FinalizedDocumentSpaceView,
  SharedDocumentCategory,
  SharedDocumentView,
} from "@/types/shared-documents";

function formatVersionDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DocumentSharing({
  viewerId,
  spaces,
}: {
  viewerId: string;
  spaces: FinalizedDocumentSpaceView[];
}) {
  if (!spaces.length) {
    return (
      <div className="surface-card mx-auto max-w-2xl p-8 text-center sm:p-12">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <FileLock2 aria-hidden="true" className="size-7" />
        </span>
        <h2 className="mt-5 text-xl font-bold">No finalized sharing spaces yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Secure document sharing appears only after a listing or flatmate match is
          finalized. Unavailable, blocked, or private matches stay hidden.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {spaces.map((space) => (
        <DocumentSpace key={space.id} viewerId={viewerId} space={space} />
      ))}
    </div>
  );
}

function DocumentSpace({
  viewerId,
  space,
}: {
  viewerId: string;
  space: FinalizedDocumentSpaceView;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<SharedDocumentCategory>(
    SHARED_DOCUMENT_CATEGORIES[0].value,
  );
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const versionGroups = groupSharedDocumentVersions(space.documents);
  const readOnly = space.status === "CLOSED";

  const uploadFile = (
    selectedFile: File,
    selectedCategory: SharedDocumentCategory,
    replacesDocumentId?: string,
  ) => {
    setMessage("");
    setError("");
    const validationError = validateSharedDocumentFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (replacesDocumentId) setBusyDocumentId(replacesDocumentId);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) {
        setError("Your session expired. Please log in again.");
        setBusyDocumentId(null);
        return;
      }

      const documentId = crypto.randomUUID();
      const objectPath = sharedDocumentPath(
        userData.user.id,
        space.id,
        documentId,
        selectedFile,
      );
      const { error: uploadError } = await supabase.storage
        .from(SHARED_DOCUMENT_BUCKET)
        .upload(objectPath, selectedFile, {
          cacheControl: "0",
          contentType: selectedFile.type,
          upsert: false,
        });
      if (uploadError) {
        setError("Upload blocked. Check the file type, size, and finalized match.");
        setBusyDocumentId(null);
        return;
      }

      const result = await registerSharedDocumentAction({
        documentId,
        spaceId: space.id,
        category: selectedCategory,
        objectPath,
        originalName: selectedFile.name,
        replacesDocumentId,
      });
      if (!result.success) {
        await supabase.storage.from(SHARED_DOCUMENT_BUCKET).remove([objectPath]);
        setError(result.message);
        setBusyDocumentId(null);
        return;
      }

      if (!replacesDocumentId) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      }
      setBusyDocumentId(null);
      setMessage(result.message);
      router.refresh();
    });
  };

  const upload = () => {
    if (!file) {
      setError("Choose a document to share.");
      return;
    }
    uploadFile(file, category);
  };

  const download = async (document: SharedDocumentView) => {
    setBusyDocumentId(document.id);
    setMessage("");
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { data, error: downloadError } = await supabase.storage
      .from(SHARED_DOCUMENT_BUCKET)
      .download(document.objectPath);
    if (downloadError || !data) {
      setError("This private document is revoked or no longer available.");
      setBusyDocumentId(null);
      return;
    }

    const temporaryUrl = URL.createObjectURL(data);
    const link = window.document.createElement("a");
    link.href = temporaryUrl;
    link.download = document.originalName;
    link.rel = "noopener";
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(temporaryUrl);
    setBusyDocumentId(null);
  };

  const acknowledge = (
    documentId: string,
    status: DocumentAcknowledgementStatus,
  ) => {
    setBusyDocumentId(documentId);
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await markSharedDocumentAcknowledgementAction({ documentId, status });
      setBusyDocumentId(null);
      if (!result.success) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      router.refresh();
    });
  };

  const manage = (documentId: string, action: "revoke" | "delete") => {
    const confirmed = window.confirm(
      action === "revoke"
        ? "Revoke access to every version of this document for both participants?"
        : "Permanently delete this document and its complete private version history? This cannot be undone.",
    );
    if (!confirmed) return;
    setBusyDocumentId(documentId);
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = action === "revoke"
        ? await revokeSharedDocumentAction(documentId)
        : await deleteSharedDocumentAction(documentId);
      setBusyDocumentId(null);
      if (!result.success) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      router.refresh();
    });
  };

  return (
    <article className="surface-card overflow-hidden">
      <header className="border-b border-border/70 bg-muted/20 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.6875rem] font-semibold text-emerald-800">
              <UserRoundCheck aria-hidden="true" className="size-3.5" />
              Finalized participants only
            </span>
            <h2 className="mt-3 text-xl font-bold tracking-tight">{space.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {space.subtitle} · shared with {space.counterpartName}
            </p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {versionGroups.length} {versionGroups.length === 1 ? "document" : "documents"} · {space.documents.length} {space.documents.length === 1 ? "version" : "versions"}
          </span>
        </div>
      </header>

      <div className="p-5 sm:p-6">
        <FinalizedMatchLifecycle space={space} />
        <FinalizedMilestones
          key={space.milestones.map(({ id, updatedAt }) => `${id}:${updatedAt}`).join("|")}
          spaceId={space.id}
          viewerId={viewerId}
          counterpartName={space.counterpartName}
          initialMilestones={space.milestones}
          readOnly={readOnly}
        />

        {!readOnly ? <div className="mt-5 rounded-2xl border border-border/75 bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] sm:items-end">
            <label className="text-xs font-semibold text-muted-foreground">
              Document category
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as SharedDocumentCategory)}
                disabled={pending}
                className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
              >
                {SHARED_DOCUMENT_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              PDF, JPG, or PNG · maximum 10 MB
              <input
                ref={inputRef}
                type="file"
                accept={SHARED_DOCUMENT_MIME_TYPES.join(",")}
                disabled={pending}
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  setError(selected ? validateSharedDocumentFile(selected) ?? "" : "");
                }}
                className="mt-1.5 block h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-semibold"
              />
            </label>
            <Button type="button" onClick={upload} disabled={pending || !file} className="h-11">
              {pending && !busyDocumentId ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <FilePlus2 aria-hidden="true" className="size-4" />}
              Share securely
            </Button>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            Share only what is necessary. Redact unrelated ID numbers and financial details. Reviewed or Acknowledged is a personal tracking status—not a signature, legal acceptance, or Roomzi verification.
          </p>
        </div> : null}

        {versionGroups.length ? (
          <div className="mt-5 grid gap-4">
            {versionGroups.map((versions) => {
              const current = versions.find(({ isCurrent }) => isCurrent) ?? versions[0];
              const previous = versions.filter(({ id }) => id !== current.id);
              const owned = current.uploaderId === viewerId;
              const revoked = Boolean(current.revokedAt);
              const busy = busyDocumentId === current.id;
              const ownAcknowledgement = current.acknowledgements.find(({ userId }) => userId === viewerId);
              const counterpartAcknowledgement = current.acknowledgements.find(({ userId }) => userId !== viewerId);

              return (
                <section key={current.seriesId} className="rounded-2xl border border-border/70 bg-background p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                        {revoked ? <XCircle aria-hidden="true" className="size-5" /> : <FileCheck2 aria-hidden="true" className="size-5" />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">{current.originalName}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-bold text-primary">Current · v{current.versionNumber}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {sharedDocumentCategoryLabel(current.category)} · {formatDocumentSize(current.sizeBytes)} · {owned ? "Uploaded by you" : `Uploaded by ${space.counterpartName}`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatVersionDate(current.createdAt)}</p>
                        {revoked ? <p className="mt-1 text-xs font-semibold text-amber-700">Access to all versions revoked</p> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {!revoked ? (
                        <Button type="button" variant="outline" size="sm" disabled={pending || busy} onClick={() => void download(current)}>
                          {busy ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Download aria-hidden="true" className="size-3.5" />}
                          Download
                        </Button>
                      ) : null}
                      {owned && !revoked && !readOnly ? (
                        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground has-disabled:pointer-events-none has-disabled:opacity-50">
                          <Upload aria-hidden="true" className="size-3.5" />
                          Upload revision
                          <input
                            type="file"
                            className="sr-only"
                            accept={SHARED_DOCUMENT_MIME_TYPES.join(",")}
                            disabled={pending || busy}
                            onChange={(event) => {
                              const revision = event.target.files?.[0];
                              event.currentTarget.value = "";
                              if (revision) uploadFile(revision, current.category, current.id);
                            }}
                          />
                        </label>
                      ) : null}
                      {owned && !revoked && !readOnly ? (
                        <Button type="button" variant="outline" size="sm" disabled={pending || busy} onClick={() => manage(current.id, "revoke")}>Revoke all</Button>
                      ) : null}
                      {owned && !readOnly ? (
                        <Button type="button" variant="destructive" size="sm" disabled={pending || busy} onClick={() => manage(current.id, "delete")}>
                          <Trash2 aria-hidden="true" className="size-3.5" />
                          Delete history
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {!revoked ? (
                    <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold">Current-version acknowledgement</p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{ownAcknowledgement ? `You: ${documentAcknowledgementLabel(ownAcknowledgement.status)}` : "You: Not marked"}</span>
                            <span>{space.counterpartName}: {counterpartAcknowledgement ? documentAcknowledgementLabel(counterpartAcknowledgement.status) : "Not marked"}</span>
                          </div>
                        </div>
                        {!readOnly ? <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" disabled={pending || busy || ownAcknowledgement?.status === "REVIEWED"} onClick={() => acknowledge(current.id, "REVIEWED")}>
                            <CheckCircle2 aria-hidden="true" className="size-3.5" />
                            Reviewed
                          </Button>
                          <Button type="button" variant="outline" size="sm" disabled={pending || busy || ownAcknowledgement?.status === "ACKNOWLEDGED"} onClick={() => acknowledge(current.id, "ACKNOWLEDGED")}>
                            <BadgeCheck aria-hidden="true" className="size-3.5" />
                            Acknowledged
                          </Button>
                        </div> : null}
                      </div>
                    </div>
                  ) : null}

                  {previous.length ? (
                    <details className="mt-4 rounded-xl border border-border/70">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold text-muted-foreground">
                        <History aria-hidden="true" className="size-3.5" />
                        Version history ({previous.length})
                      </summary>
                      <div className="divide-y divide-border/70 border-t border-border/70">
                        {previous.map((document) => {
                          const documentBusy = busyDocumentId === document.id;
                          const documentOwned = document.uploaderId === viewerId;
                          const ownPastStatus = document.acknowledgements.find(({ userId }) => userId === viewerId)?.status;
                          const counterpartPastStatus = document.acknowledgements.find(({ userId }) => userId !== viewerId)?.status;
                          return (
                            <div key={document.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <FileClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold">v{document.versionNumber} · {document.originalName}</p>
                                  <p className="mt-1 text-[0.6875rem] leading-4 text-muted-foreground">
                                    {formatVersionDate(document.createdAt)} · {documentOwned ? "uploaded by you" : `uploaded by ${space.counterpartName}`} · {formatDocumentSize(document.sizeBytes)}
                                  </p>
                                  {(ownPastStatus || counterpartPastStatus) ? (
                                    <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                                      Historical marks: you {ownPastStatus ? documentAcknowledgementLabel(ownPastStatus).toLowerCase() : "not marked"}; {space.counterpartName} {counterpartPastStatus ? documentAcknowledgementLabel(counterpartPastStatus).toLowerCase() : "not marked"}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                              {!document.revokedAt ? (
                                <Button type="button" variant="ghost" size="sm" disabled={pending || documentBusy} onClick={() => void download(document)}>
                                  {documentBusy ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Download aria-hidden="true" className="size-3.5" />}
                                  Download
                                </Button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-border px-5 py-8 text-center">
            <FileLock2 aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-semibold">No documents shared yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Only you and this finalized participant can access files added here.</p>
          </div>
        )}

        {error ? <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p> : null}
        {message ? <p role="status" className="mt-3 text-sm font-medium text-emerald-700">{message}</p> : null}
      </div>
    </article>
  );
}
