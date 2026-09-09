import type {
  AnalyticsFunnelStage,
  AnalyticsProperties,
  ProductAnalyticsEventInput,
  ProductAnalyticsEventName,
  ProductAnalyticsFunnel,
  SanitizedProductAnalyticsEvent,
} from "@/types/analytics";

type PropertyRule =
  | { kind: "boolean" }
  | { kind: "integer"; minimum: number; maximum: number }
  | { kind: "enum"; values: readonly string[] };

const eventNames = new Set<string>([
  "SIGNUP_COMPLETED",
  "PROFILE_COMPLETED",
  "LOCALITY_SELECTED",
  "SEARCH_FILTERS_USED",
  "LISTING_VIEWED",
  "PROFILE_VIEWED",
  "LISTING_SAVED",
  "MESSAGE_STARTED",
  "VISIT_REQUESTED",
  "VISIT_COMPLETED",
  "MATCH_FINALIZED",
]);

const allowedProperties: Record<
  ProductAnalyticsEventName,
  Record<string, PropertyRule>
> = {
  SIGNUP_COMPLETED: {
    method: { kind: "enum", values: ["email", "google"] },
  },
  PROFILE_COMPLETED: {
    completionVersion: { kind: "integer", minimum: 1, maximum: 20 },
  },
  LOCALITY_SELECTED: {
    source: {
      kind: "enum",
      values: ["directory", "community-switcher", "direct-link"],
    },
  },
  SEARCH_FILTERS_USED: {
    surface: { kind: "enum", values: ["listings", "people"] },
    filterCount: { kind: "integer", minimum: 1, maximum: 20 },
    hasTextQuery: { kind: "boolean" },
    hasBudget: { kind: "boolean" },
    hasMoveInDate: { kind: "boolean" },
    hasLocality: { kind: "boolean" },
    hasCategory: { kind: "boolean" },
    hasPreference: { kind: "boolean" },
    hasLifestyle: { kind: "boolean" },
    hasCommuteRange: { kind: "boolean" },
    hasCompatibility: { kind: "boolean" },
    sort: {
      kind: "enum",
      values: [
        "recommended",
        "newest",
        "lowest-amount",
        "highest-compatibility",
        "lowest-budget",
      ],
    },
  },
  LISTING_VIEWED: {
    surface: { kind: "enum", values: ["community", "public-listing"] },
  },
  PROFILE_VIEWED: {
    surface: { kind: "enum", values: ["people"] },
  },
  LISTING_SAVED: {
    source: { kind: "enum", values: ["community", "detail", "saved"] },
  },
  MESSAGE_STARTED: {
    source: { kind: "enum", values: ["chat", "listing", "profile"] },
    hasListingContext: { kind: "boolean" },
  },
  VISIT_REQUESTED: {
    listingType: {
      kind: "enum",
      values: ["room-available", "pg-available"],
    },
  },
  VISIT_COMPLETED: {
    participantRole: { kind: "enum", values: ["owner", "requester"] },
  },
  MATCH_FINALIZED: {
    targetType: { kind: "enum", values: ["listing", "flatmate"] },
  },
};

const stageEvents: Record<AnalyticsFunnelStage, Set<ProductAnalyticsEventName>> = {
  discovery: new Set([
    "LOCALITY_SELECTED",
    "SEARCH_FILTERS_USED",
    "LISTING_VIEWED",
    "PROFILE_VIEWED",
    "LISTING_SAVED",
  ]),
  contact: new Set(["MESSAGE_STARTED"]),
  visit: new Set(["VISIT_REQUESTED", "VISIT_COMPLETED"]),
  finalization: new Set(["MATCH_FINALIZED"]),
};

const stageLabels: Record<AnalyticsFunnelStage, string> = {
  discovery: "Discovery",
  contact: "Contact",
  visit: "Visit",
  finalization: "Finalization",
};

export function sanitizeProductAnalyticsEvent(
  input: unknown,
): SanitizedProductAnalyticsEvent | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const candidate = input as Partial<ProductAnalyticsEventInput>;
  if (typeof candidate.name !== "string" || !eventNames.has(candidate.name)) {
    return null;
  }

  const name = candidate.name as ProductAnalyticsEventName;
  const source =
    candidate.properties &&
    typeof candidate.properties === "object" &&
    !Array.isArray(candidate.properties)
      ? candidate.properties
      : {};
  const properties: AnalyticsProperties = {};

  for (const [key, rule] of Object.entries(allowedProperties[name])) {
    const value = source[key];
    if (rule.kind === "boolean" && typeof value === "boolean") {
      properties[key] = value;
    } else if (
      rule.kind === "integer" &&
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= rule.minimum &&
      value <= rule.maximum
    ) {
      properties[key] = value;
    } else if (
      rule.kind === "enum" &&
      typeof value === "string" &&
      rule.values.includes(value)
    ) {
      properties[key] = value;
    }
  }

  return { name, properties };
}

export function analyticsSearchProperties(input: {
  surface: "listings" | "people";
  query: string;
  budgetMin: number | null;
  budgetMax: number | null;
  moveInBy: string;
  locality?: string;
  category?: string | null;
  preference?: string | null;
  lifestyleCount?: number;
  commuteRange: number | null;
  minimumCompatibility?: number | null;
  sort: string;
}) {
  const hasTextQuery = Boolean(input.query);
  const hasBudget = input.budgetMin !== null || input.budgetMax !== null;
  const hasMoveInDate = Boolean(input.moveInBy);
  const hasLocality = Boolean(input.locality);
  const hasCategory = Boolean(input.category);
  const hasPreference = Boolean(input.preference);
  const hasLifestyle = (input.lifestyleCount ?? 0) > 0;
  const hasCommuteRange = input.commuteRange !== null;
  const hasCompatibility = input.minimumCompatibility !== null && input.minimumCompatibility !== undefined;
  const filterCount = [
    hasTextQuery,
    hasBudget,
    hasMoveInDate,
    hasLocality,
    hasCategory,
    hasPreference,
    hasLifestyle,
    hasCommuteRange,
    hasCompatibility,
  ].filter(Boolean).length;

  if (filterCount === 0 && input.sort === "recommended") return null;
  return {
    surface: input.surface,
    filterCount: Math.max(1, filterCount),
    hasTextQuery,
    hasBudget,
    hasMoveInDate,
    hasLocality,
    hasCategory,
    hasPreference,
    hasLifestyle,
    hasCommuteRange,
    hasCompatibility,
    sort: input.sort,
  };
}

export function calculateProductFunnel(
  events: Array<{ userId: string; name: ProductAnalyticsEventName }>,
  periodDays: number,
  generatedAt = new Date(),
): ProductAnalyticsFunnel {
  const orderedStages: AnalyticsFunnelStage[] = [
    "discovery",
    "contact",
    "visit",
    "finalization",
  ];
  const usersByStage = new Map(
    orderedStages.map((stage) => [stage, new Set<string>()]),
  );
  const signupUsers = new Set<string>();
  const completedProfileUsers = new Set<string>();

  for (const event of events) {
    if (event.name === "SIGNUP_COMPLETED") signupUsers.add(event.userId);
    if (event.name === "PROFILE_COMPLETED") completedProfileUsers.add(event.userId);
    for (const stage of orderedStages) {
      if (stageEvents[stage].has(event.name)) usersByStage.get(stage)?.add(event.userId);
    }
  }

  const progressedUsersByStage = new Map<AnalyticsFunnelStage, Set<string>>();
  let priorUsers: Set<string> | null = null;
  for (const stage of orderedStages) {
    const currentUsers = usersByStage.get(stage) ?? new Set<string>();
    const progressedUsers: Set<string> = priorUsers
      ? new Set([...priorUsers].filter((userId) => currentUsers.has(userId)))
      : new Set(currentUsers);
    progressedUsersByStage.set(stage, progressedUsers);
    priorUsers = progressedUsers;
  }

  return {
    periodDays,
    totalEvents: events.length,
    generatedAt: generatedAt.toISOString(),
    onboarding: {
      signups: signupUsers.size,
      profilesCompleted: completedProfileUsers.size,
      profileCompletionRate:
        signupUsers.size > 0
          ? Math.round(
              ([...completedProfileUsers].filter((userId) => signupUsers.has(userId)).length /
                signupUsers.size) *
                100,
            )
          : 0,
    },
    stages: orderedStages.map((stage, index) => {
      const users = progressedUsersByStage.get(stage)?.size ?? 0;
      const previous =
        index > 0
          ? progressedUsersByStage.get(orderedStages[index - 1])?.size ?? 0
          : 0;
      return {
        stage,
        label: stageLabels[stage],
        users,
        conversionFromPrevious:
          index === 0 ? null : previous > 0 ? Math.round((users / previous) * 100) : 0,
      };
    }),
  };
}
