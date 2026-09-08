export const MAX_COMPARISON_LISTINGS = 4;

export function parseComparisonSelection(
  value: string | string[] | undefined,
) {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];
  const unique: string[] = [];

  for (const rawValue of rawValues) {
    for (const part of rawValue.split(",")) {
      const id = part.trim();
      if (
        id &&
        id.length <= 128 &&
        /^[a-zA-Z0-9_-]+$/.test(id) &&
        !unique.includes(id)
      ) {
        unique.push(id);
      }
    }
  }

  return {
    ids: unique.slice(0, MAX_COMPARISON_LISTINGS),
    selectionWasTrimmed: unique.length > MAX_COMPARISON_LISTINGS,
  };
}

function comparisonValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(String).sort().join("|").toLocaleLowerCase("en-IN");
  }
  if (value === null || value === undefined || value === "") return "missing";
  return String(value).trim().toLocaleLowerCase("en-IN");
}

export function hasMeaningfulDifference(values: unknown[]) {
  return new Set(values.map(comparisonValue)).size > 1;
}

export function bestComparisonIds(
  values: Array<{ id: string; value: number | null }>,
  preference: "LOWEST" | "HIGHEST",
) {
  const available = values.filter(
    (entry): entry is { id: string; value: number } => entry.value !== null,
  );
  if (available.length < 2) return new Set<string>();
  const distinct = new Set(available.map((entry) => entry.value));
  if (distinct.size < 2) return new Set<string>();
  const best = Math[preference === "LOWEST" ? "min" : "max"](
    ...available.map((entry) => entry.value),
  );
  return new Set(
    available.filter((entry) => entry.value === best).map((entry) => entry.id),
  );
}
