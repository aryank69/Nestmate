import type {
  DocumentAcknowledgementStatus,
  SharedDocumentCategory,
  SharedDocumentView,
} from "@/types/shared-documents";

export const SHARED_DOCUMENT_BUCKET = "match-documents";
export const MAX_SHARED_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_SHARED_DOCUMENTS_PER_SPACE = 20;
export const SHARED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const DOCUMENT_ACKNOWLEDGEMENT_STATUSES = [
  { value: "REVIEWED", label: "Reviewed" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
] as const satisfies ReadonlyArray<{
  value: DocumentAcknowledgementStatus;
  label: string;
}>;

export const SHARED_DOCUMENT_CATEGORIES = [
  {
    value: "ID_PROOF",
    label: "ID proof",
    description: "A limited identity document shared for move-in coordination.",
  },
  {
    value: "AGREEMENT_DRAFT",
    label: "Agreement draft",
    description: "A draft to review independently before signing.",
  },
  {
    value: "DEPOSIT_RECEIPT",
    label: "Deposit receipt",
    description: "A receipt only—Roomzi does not process the payment.",
  },
  {
    value: "INVENTORY_SHEET",
    label: "Inventory sheet",
    description: "A record of furnishings or condition at move-in.",
  },
  {
    value: "MOVE_IN_DOCUMENT",
    label: "Move-in document",
    description: "Another document directly required for the finalized move-in.",
  },
] as const satisfies ReadonlyArray<{
  value: SharedDocumentCategory;
  label: string;
  description: string;
}>;

const extensionByMimeType: Record<
  (typeof SHARED_DOCUMENT_MIME_TYPES)[number],
  string
> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export function isSharedDocumentCategory(
  value: unknown,
): value is SharedDocumentCategory {
  return SHARED_DOCUMENT_CATEGORIES.some((category) => category.value === value);
}

export function sharedDocumentCategoryLabel(category: SharedDocumentCategory) {
  return SHARED_DOCUMENT_CATEGORIES.find(({ value }) => value === category)?.label ?? category;
}

export function isDocumentAcknowledgementStatus(
  value: unknown,
): value is DocumentAcknowledgementStatus {
  return DOCUMENT_ACKNOWLEDGEMENT_STATUSES.some(({ value: status }) => status === value);
}

export function documentAcknowledgementLabel(
  status: DocumentAcknowledgementStatus,
) {
  return DOCUMENT_ACKNOWLEDGEMENT_STATUSES.find(({ value }) => value === status)?.label ?? status;
}

export function groupSharedDocumentVersions(documents: SharedDocumentView[]) {
  const groups = new Map<string, SharedDocumentView[]>();
  for (const document of documents) {
    const versions = groups.get(document.seriesId) ?? [];
    versions.push(document);
    groups.set(document.seriesId, versions);
  }
  return [...groups.values()]
    .map((versions) => [...versions].sort((a, b) => b.versionNumber - a.versionNumber))
    .sort((a, b) => {
      const aTime = Date.parse(a.find(({ isCurrent }) => isCurrent)?.createdAt ?? a[0].createdAt);
      const bTime = Date.parse(b.find(({ isCurrent }) => isCurrent)?.createdAt ?? b[0].createdAt);
      return bTime - aTime;
    });
}

export function validateSharedDocumentFile(
  file: Pick<File, "name" | "size" | "type">,
): string | null {
  if (
    !SHARED_DOCUMENT_MIME_TYPES.includes(
      file.type as (typeof SHARED_DOCUMENT_MIME_TYPES)[number],
    )
  ) {
    return "Choose a PDF, JPG, or PNG document.";
  }
  if (file.size === 0) return "That document is empty. Choose another file.";
  if (file.size > MAX_SHARED_DOCUMENT_BYTES) {
    return "Documents must be 10 MB or smaller.";
  }
  if (!cleanSharedDocumentName(file.name)) {
    return "Choose a file with a valid name.";
  }
  return null;
}

export function cleanSharedDocumentName(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f/\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 180) return null;
  return cleaned;
}

export function sharedDocumentPath(
  authUserId: string,
  spaceId: string,
  documentId: string,
  file: Pick<File, "type">,
) {
  const extension =
    extensionByMimeType[file.type as (typeof SHARED_DOCUMENT_MIME_TYPES)[number]];
  if (!extension) throw new Error("Unsupported document type.");
  return `${authUserId}/${spaceId}/${documentId}.${extension}`;
}

export function isOwnedSharedDocumentPath(
  path: string,
  authUserId: string,
  spaceId: string,
  documentId: string,
) {
  if (path.length > 500) return false;
  const expected = new RegExp(
    `^${UUID_PATTERN}/${UUID_PATTERN}/${UUID_PATTERN}\\.(?:pdf|jpg|jpeg|png)$`,
    "i",
  );
  if (!expected.test(path)) return false;
  const [pathUserId, pathSpaceId, fileName] = path.split("/");
  return (
    pathUserId.toLowerCase() === authUserId.toLowerCase() &&
    pathSpaceId.toLowerCase() === spaceId.toLowerCase() &&
    fileName.slice(0, 36).toLowerCase() === documentId.toLowerCase()
  );
}

export function formatDocumentSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
