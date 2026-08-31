import type {
  CompatibilityBudget,
  CompatibilityFactor,
  CompatibilityFactorKey,
  CompatibilityProfile,
  CompatibilityResult,
  CompatibilitySourceProfile,
} from "@/types/compatibility";

export const COMPATIBILITY_WEIGHTS = {
  budget: 20,
  locality: 20,
  diet: 10,
  smoking: 12,
  drinking: 8,
  sleepSchedule: 10,
  cleanliness: 10,
  pets: 7,
  occupationStatus: 3,
} as const satisfies Record<CompatibilityFactorKey, number>;

const TOTAL_FACTORS = Object.keys(COMPATIBILITY_WEIGHTS).length;
const UNKNOWN_VALUES = new Set(["", "not set", "unknown", "prefer not to say"]);

function normalize(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("en-IN") ?? "";
}

function isKnown(value: string | null | undefined): value is string {
  return !UNKNOWN_VALUES.has(normalize(value));
}

function normalizeLocality(value: string) {
  return normalize(value).replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
}

function parseBudgetLabel(value: string): CompatibilityBudget | null {
  if (!value.trim()) {
    return null;
  }

  const amounts = value
    .match(/\d[\d,]*/g)
    ?.map((amount) => Number(amount.replaceAll(",", "")))
    .filter(Number.isFinite);

  if (!amounts?.length) {
    return null;
  }

  if (/up to/i.test(value)) {
    return { minimum: null, maximum: amounts[0] };
  }

  if (/\+/.test(value)) {
    return { minimum: amounts[0], maximum: null };
  }

  return {
    minimum: amounts[0],
    maximum: amounts[1] ?? amounts[0],
  };
}

export function compatibilityProfileFromUserProfile(
  profile: CompatibilitySourceProfile,
): CompatibilityProfile {
  return {
    budget: parseBudgetLabel(profile.budget),
    preferredLocalities: profile.preferredLocalities,
    diet: isKnown(profile.preferences.diet) ? profile.preferences.diet : null,
    smoking: isKnown(profile.preferences.smoking)
      ? profile.preferences.smoking
      : null,
    drinking: isKnown(profile.preferences.drinking)
      ? profile.preferences.drinking
      : null,
    sleepSchedule: isKnown(profile.preferences.sleepSchedule)
      ? profile.preferences.sleepSchedule
      : null,
    cleanliness: isKnown(profile.preferences.cleanliness)
      ? profile.preferences.cleanliness
      : null,
    pets: isKnown(profile.preferences.pets) ? profile.preferences.pets : null,
    occupationStatus: isKnown(profile.preferences.status)
      ? profile.preferences.status
      : null,
  };
}

function normalizeBudget(range: CompatibilityBudget) {
  const minimum = range.minimum ?? 0;
  const maximum = range.maximum ?? Number.POSITIVE_INFINITY;

  if (minimum < 0 || maximum < minimum) {
    return null;
  }

  return { minimum, maximum };
}

function budgetAlignment(
  first: CompatibilityBudget | null,
  second: CompatibilityBudget | null,
) {
  if (!first || !second) {
    return null;
  }

  const a = normalizeBudget(first);
  const b = normalizeBudget(second);
  if (!a || !b) {
    return null;
  }

  const overlapStart = Math.max(a.minimum, b.minimum);
  const overlapEnd = Math.min(a.maximum, b.maximum);

  if (overlapStart <= overlapEnd) {
    return { alignment: 1, detail: "Monthly budgets overlap" };
  }

  const gap = overlapStart - overlapEnd;
  const finiteCeilings = [a.maximum, b.maximum].filter(Number.isFinite);
  const reference = Math.max(...finiteCeilings, a.minimum, b.minimum, 1);
  const gapRatio = gap / reference;

  if (gapRatio <= 0.1) {
    return { alignment: 0.65, detail: "Monthly budgets are close" };
  }

  if (gapRatio <= 0.25) {
    return { alignment: 0.35, detail: "Monthly budgets need flexibility" };
  }

  return { alignment: 0, detail: "Monthly budgets are far apart" };
}

function localityAlignment(first: string[], second: string[]) {
  const firstLocalities = new Set(first.map(normalizeLocality).filter(Boolean));
  const secondLocalities = new Set(second.map(normalizeLocality).filter(Boolean));

  if (!firstLocalities.size || !secondLocalities.size) {
    return null;
  }

  const shared = [...firstLocalities].filter((locality) =>
    secondLocalities.has(locality),
  );

  if (!shared.length) {
    return { alignment: 0, detail: "No preferred locality overlaps" };
  }

  const displayLocalities = first.filter((locality) =>
    shared.includes(normalizeLocality(locality)),
  );

  return {
    alignment: 1,
    detail: `Both prefer ${displayLocalities.slice(0, 2).join(" and ")}`,
  };
}

function exactAlignment(
  first: string | null,
  second: string | null,
  matchingDetail: string,
  differingDetail: string,
) {
  if (!isKnown(first) || !isKnown(second)) {
    return null;
  }

  const alignment = normalize(first) === normalize(second) ? 1 : 0;
  return { alignment, detail: alignment ? matchingDetail : differingDetail };
}

function dietAlignment(first: string | null, second: string | null) {
  if (!isKnown(first) || !isKnown(second)) {
    return null;
  }

  const a = normalize(first);
  const b = normalize(second);
  if (a === b) {
    return { alignment: 1, detail: `Both prefer ${first.toLowerCase()} food` };
  }

  const pair = new Set([a, b]);
  let alignment = 0.25;
  if (pair.has("vegetarian") && pair.has("vegan")) alignment = 0.8;
  if (pair.has("vegetarian") && pair.has("eggetarian")) alignment = 0.7;
  if (pair.has("eggetarian") && pair.has("non-vegetarian")) alignment = 0.6;
  if (pair.has("vegan") && pair.has("non-vegetarian")) alignment = 0.1;

  return {
    alignment,
    detail:
      alignment >= 0.6
        ? "Food preferences are easy to accommodate"
        : "Food preferences differ",
  };
}

function ordinalAlignment(
  first: string | null,
  second: string | null,
  order: Record<string, number>,
  matchingDetail: string,
  differingDetail: string,
) {
  if (!isKnown(first) || !isKnown(second)) {
    return null;
  }

  const a = order[normalize(first)];
  const b = order[normalize(second)];
  if (a === undefined || b === undefined) {
    return exactAlignment(first, second, matchingDetail, differingDetail);
  }

  const alignment = 1 - Math.min(Math.abs(a - b), 2) / 2;
  return {
    alignment,
    detail: alignment === 1 ? matchingDetail : differingDetail,
  };
}

function sleepAlignment(first: string | null, second: string | null) {
  if (!isKnown(first) || !isKnown(second)) {
    return null;
  }

  const a = normalize(first);
  const b = normalize(second);
  if (a === b) {
    return { alignment: 1, detail: "Sleep schedules align" };
  }

  if (a === "flexible" || b === "flexible") {
    return { alignment: 0.65, detail: "One sleep schedule is flexible" };
  }

  return { alignment: 0, detail: "Sleep schedules are opposite" };
}

function petsAlignment(first: string | null, second: string | null) {
  if (!isKnown(first) || !isKnown(second)) {
    return null;
  }

  const a = normalize(first);
  const b = normalize(second);
  if (a === b) {
    return { alignment: 1, detail: "Pet preferences align" };
  }

  const pair = new Set([a, b]);
  if (pair.has("have a pet") && pair.has("pet friendly")) {
    return { alignment: 1, detail: "The home is pet compatible" };
  }

  if (pair.has("have a pet") && pair.has("prefer no pets")) {
    return { alignment: 0, detail: "Pet preferences conflict" };
  }

  return { alignment: 0.5, detail: "Pet expectations may need discussion" };
}

function occupationAlignment(first: string | null, second: string | null) {
  if (!isKnown(first) || !isKnown(second)) {
    return null;
  }

  const a = normalize(first);
  const b = normalize(second);
  if (a === b) {
    return { alignment: 1, detail: "Work or study status aligns" };
  }

  const workingStatuses = new Set([
    "working professional",
    "self-employed",
    "freelancer",
  ]);
  if (workingStatuses.has(a) && workingStatuses.has(b)) {
    return { alignment: 0.8, detail: "Both have working routines" };
  }

  return { alignment: 0.5, detail: "Daily work or study routines may differ" };
}

type Alignment = { alignment: number; detail: string } | null;

const factorLabels: Record<CompatibilityFactorKey, string> = {
  budget: "Budget",
  locality: "Preferred locality",
  diet: "Food preference",
  smoking: "Smoking",
  drinking: "Drinking",
  sleepSchedule: "Sleep schedule",
  cleanliness: "Cleanliness",
  pets: "Pets",
  occupationStatus: "Work / study",
};

function resultLabel(score: number | null) {
  if (score === null) return "Not enough profile details";
  if (score >= 85) return "Excellent preference match";
  if (score >= 70) return "Strong preference match";
  if (score >= 55) return "Good potential match";
  if (score >= 40) return "Some preferences differ";
  return "Low preference alignment";
}

export function calculateCompatibility(
  first: CompatibilityProfile,
  second: CompatibilityProfile,
): CompatibilityResult {
  const alignments: Record<CompatibilityFactorKey, Alignment> = {
    budget: budgetAlignment(first.budget, second.budget),
    locality: localityAlignment(
      first.preferredLocalities,
      second.preferredLocalities,
    ),
    diet: dietAlignment(first.diet, second.diet),
    smoking: ordinalAlignment(
      first.smoking,
      second.smoking,
      { "non-smoker": 0, never: 0, occasionally: 1, regularly: 2 },
      "Smoking preferences align",
      "Smoking preferences differ",
    ),
    drinking: ordinalAlignment(
      first.drinking,
      second.drinking,
      { never: 0, occasionally: 1, regularly: 2 },
      "Drinking preferences align",
      "Drinking preferences differ",
    ),
    sleepSchedule: sleepAlignment(first.sleepSchedule, second.sleepSchedule),
    cleanliness: ordinalAlignment(
      first.cleanliness,
      second.cleanliness,
      { relaxed: 0, "moderately tidy": 1, "very tidy": 2 },
      "Cleanliness expectations align",
      "Cleanliness expectations differ",
    ),
    pets: petsAlignment(first.pets, second.pets),
    occupationStatus: occupationAlignment(
      first.occupationStatus,
      second.occupationStatus,
    ),
  };

  const factors = (Object.keys(COMPATIBILITY_WEIGHTS) as CompatibilityFactorKey[])
    .flatMap((key): CompatibilityFactor[] => {
      const comparison = alignments[key];
      if (!comparison) return [];

      const weight = COMPATIBILITY_WEIGHTS[key];
      const alignment = Math.max(0, Math.min(1, comparison.alignment));
      return [
        {
          key,
          label: factorLabels[key],
          weight,
          alignment,
          weightedPoints: Number((weight * alignment).toFixed(2)),
          status:
            alignment >= 0.65
              ? "match"
              : alignment >= 0.45
                ? "partial"
                : "mismatch",
          detail: comparison.detail,
        },
      ];
    });

  const comparedWeight = factors.reduce((total, factor) => total + factor.weight, 0);
  const earnedPoints = factors.reduce(
    (total, factor) => total + factor.weightedPoints,
    0,
  );
  const score = comparedWeight
    ? Math.max(0, Math.min(100, Math.round((earnedPoints / comparedWeight) * 100)))
    : null;
  const mainMatches = factors
    .filter((factor) => factor.status === "match")
    .sort((a, b) => b.weightedPoints - a.weightedPoints)
    .slice(0, 2);
  const mainMismatches = factors
    .filter((factor) => factor.status === "mismatch")
    .sort(
      (a, b) =>
        b.weight * (1 - b.alignment) - a.weight * (1 - a.alignment),
    )
    .slice(0, 2);

  return {
    score,
    label: resultLabel(score),
    comparedFactors: factors.length,
    totalFactors: TOTAL_FACTORS,
    comparedWeight,
    factors,
    mainMatches,
    mainMismatches,
  };
}
