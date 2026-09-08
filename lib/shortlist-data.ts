import "server-only";

import { parseComparisonSelection } from "@/lib/comparison";
import {
  DEFAULT_PEOPLE_FILTERS,
  loadPeopleDiscovery,
} from "@/lib/people-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  FlatmateComparisonData,
  FlatmateShortlistData,
} from "@/types/shortlist";

type ShortlistRow = {
  targetUserId: string;
  createdAt: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export async function loadFlatmateShortlistData(
  viewerAuthUserId: string,
  userId: string,
): Promise<FlatmateShortlistData> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("ShortlistedProfile")
    .select("targetUserId,createdAt")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(60);
  const rows = (result.data ?? []) as ShortlistRow[];
  const profiles = rows.length
    ? await loadPeopleDiscovery(
        viewerAuthUserId,
        DEFAULT_PEOPLE_FILTERS,
        rows.map(({ targetUserId }) => targetUserId),
      )
    : [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  return {
    profiles: rows.flatMap((row) => {
      const profile = profileById.get(row.targetUserId);
      return profile
        ? [{ profile, shortlistedAt: formatDate(row.createdAt) }]
        : [];
    }),
    unavailableCount: rows.filter((row) => !profileById.has(row.targetUserId)).length,
    error: result.error
      ? "We could not load your complete flatmate shortlist. Please refresh and try again."
      : "",
  };
}

export async function loadFlatmateComparisonData(
  viewerAuthUserId: string,
  userId: string,
  rawIds: string | string[] | undefined,
): Promise<FlatmateComparisonData> {
  const parsed = parseComparisonSelection(rawIds);
  if (!parsed.ids.length) {
    return { slots: [], selectionWasTrimmed: parsed.selectionWasTrimmed, error: "" };
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("ShortlistedProfile")
    .select("targetUserId")
    .eq("userId", userId)
    .in("targetUserId", parsed.ids);
  const allowedIds = new Set(
    ((result.data ?? []) as Array<{ targetUserId: string }>).map(
      ({ targetUserId }) => targetUserId,
    ),
  );
  const profiles = allowedIds.size
    ? await loadPeopleDiscovery(
        viewerAuthUserId,
        DEFAULT_PEOPLE_FILTERS,
        [...allowedIds],
      )
    : [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  return {
    slots: parsed.ids.map((id) => ({
      id,
      profile: allowedIds.has(id) ? profileById.get(id) ?? null : null,
      unavailableReason: profileById.has(id)
        ? null
        : "This profile is no longer available from your shortlist.",
    })),
    selectionWasTrimmed: parsed.selectionWasTrimmed,
    error: result.error
      ? "We could not verify every shortlisted profile. Please try again."
      : "",
  };
}
