import type {
  RecentViewInput,
  RecentViewItem,
  RecentViewRow,
  RecentViewTarget,
} from "@/types/recently-viewed";

const RECORD_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export function parseRecentViewInput(input: RecentViewInput) {
  const targetId = input.targetId.trim();
  if (
    (input.targetType !== "POST" && input.targetType !== "USER") ||
    !RECORD_ID_PATTERN.test(targetId)
  ) {
    return null;
  }
  return { targetType: input.targetType, targetId } as const;
}

export function recentViewUpsert(
  viewerId: string,
  input: RecentViewInput,
  viewedAt: string,
): {
  record: {
    viewerId: string;
    postId: string | null;
    viewedUserId: string | null;
    viewedAt: string;
  };
  onConflict: "viewerId,postId" | "viewerId,viewedUserId";
} | null {
  const parsed = parseRecentViewInput(input);
  if (!parsed) return null;
  return parsed.targetType === "POST"
    ? {
        record: {
          viewerId,
          postId: parsed.targetId,
          viewedUserId: null,
          viewedAt,
        },
        onConflict: "viewerId,postId",
      }
    : {
        record: {
          viewerId,
          postId: null,
          viewedUserId: parsed.targetId,
          viewedAt,
        },
        onConflict: "viewerId,viewedUserId",
      };
}

export function formatRecentViewTime(value: string | Date, now = new Date()) {
  const viewedAt = new Date(value);
  const elapsedMs = Math.max(0, now.getTime() - viewedAt.getTime());
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: viewedAt.getUTCFullYear() === now.getUTCFullYear() ? undefined : "numeric",
    timeZone: "UTC",
  }).format(viewedAt);
}

export function mergeRecentViews(
  rows: RecentViewRow[],
  targets: RecentViewTarget[],
  now = new Date(),
  limit = 50,
): RecentViewItem[] {
  const targetByKey = new Map(
    targets.map((target) => [`${target.kind}:${target.targetId}`, target]),
  );
  return rows
    .flatMap((row): RecentViewItem[] => {
      const key = row.postId
        ? `POST:${row.postId}`
        : row.viewedUserId
          ? `USER:${row.viewedUserId}`
          : null;
      const target = key ? targetByKey.get(key) : null;
      if (!target) return [];
      return [{
        ...target,
        historyId: row.id,
        viewedAt: row.viewedAt,
        viewedAtLabel: formatRecentViewTime(row.viewedAt, now),
      }];
    })
    .sort(
      (first, second) =>
        new Date(second.viewedAt).getTime() - new Date(first.viewedAt).getTime(),
    )
    .slice(0, limit);
}
