import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verificationSummary } from "@/lib/verification";
import type { LifestylePreferences, UserProfile } from "@/types/profile";

type AuthIdentity = {
  id: string;
  email?: string | null;
  name?: string | null;
};

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  dateOfBirth: string | null;
  profession: string | null;
  companyOrCollege: string | null;
  bio: string | null;
};

type PreferencesRow = {
  id: string;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredMoveInDate: string | null;
  diet: string | null;
  smoking: string | null;
  drinking: string | null;
  sleepSchedule: string | null;
  cleanliness: string | null;
  pets: string | null;
  occupationStatus: string | null;
  commuteDestination: string | null;
  commuteLatitude: number | null;
  commuteLongitude: number | null;
  preferredCommuteKm: number | null;
};

const dietFromDatabase: Record<string, string> = {
  VEGETARIAN: "Vegetarian",
  NON_VEGETARIAN: "Non-vegetarian",
  EGGETARIAN: "Eggetarian",
  VEGAN: "Vegan",
};

const smokingFromDatabase: Record<string, string> = {
  NEVER: "Non-smoker",
  OCCASIONALLY: "Occasionally",
  REGULARLY: "Regularly",
};

const drinkingFromDatabase: Record<string, string> = {
  NEVER: "Never",
  OCCASIONALLY: "Occasionally",
  REGULARLY: "Regularly",
};

const sleepFromDatabase: Record<string, string> = {
  EARLY_BIRD: "Early bird",
  BALANCED: "Flexible",
  NIGHT_OWL: "Night owl",
};

const cleanlinessFromDatabase: Record<string, string> = {
  RELAXED: "Relaxed",
  MODERATE: "Moderately tidy",
  VERY_TIDY: "Very tidy",
};

const petsFromDatabase: Record<string, string> = {
  HAS_PETS: "Have a pet",
  PET_FRIENDLY: "Pet friendly",
  PREFERS_NO_PETS: "Prefer no pets",
};

const occupationFromDatabase: Record<string, string> = {
  STUDENT: "Student",
  WORKING_PROFESSIONAL: "Working professional",
  SELF_EMPLOYED: "Self-employed",
  FREELANCER: "Freelancer",
  OTHER: "Other",
};

function reverseMap(map: Record<string, string>, value: string) {
  return (
    Object.entries(map).find(([, label]) => label === value)?.[0] ?? null
  );
}

function calculateAge(dateOfBirth: string | null) {
  if (!dateOfBirth) {
    return 0;
  }

  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const hasNotHadBirthday =
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() &&
      today.getUTCDate() < birthDate.getUTCDate());

  if (hasNotHadBirthday) {
    age -= 1;
  }

  return age;
}

function formatIndianRupees(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBudget(minimum: number | null, maximum: number | null) {
  if (minimum !== null && maximum !== null) {
    if (minimum === maximum) {
      return formatIndianRupees(minimum);
    }

    return `${formatIndianRupees(minimum)}–${formatIndianRupees(maximum)}`;
  }

  if (minimum !== null) {
    return `${formatIndianRupees(minimum)}+`;
  }

  if (maximum !== null) {
    return `Up to ${formatIndianRupees(maximum)}`;
  }

  return "";
}

function databaseLabel(map: Record<string, string>, value: string | null) {
  return value ? (map[value] ?? "Not set") : "Not set";
}

export async function ensureUserProfile(identity: AuthIdentity) {
  const fallbackName =
    identity.name?.trim() ||
    identity.email?.split("@")[0] ||
    "Roomzi member";

  // These unique-key upserts are independently idempotent. Avoiding an
  // interactive transaction here prevents concurrent route prefetches from
  // exhausting Prisma's transaction wait queue through Supabase's pooler.
  const user = await prisma.user.upsert({
    where: { authUserId: identity.id },
    create: {
      authUserId: identity.id,
      name: fallbackName,
      email: identity.email ?? null,
    },
    update: identity.email ? { email: identity.email } : {},
  });

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });

  return user;
}

export async function loadUserProfile(authUserId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase
    .from("User")
    .select(
      "id,name,email,dateOfBirth,profession,companyOrCollege,bio",
    )
    .eq("authUserId", authUserId)
    .single();

  if (userError || !userData) {
    throw new Error("Unable to load the authenticated profile.");
  }

  const user = userData as UserRow;
  const { data: preferencesData, error: preferencesError } = await supabase
    .from("UserPreferences")
    .select(
      "id,budgetMin,budgetMax,preferredMoveInDate,diet,smoking,drinking,sleepSchedule,cleanliness,pets,occupationStatus,commuteDestination,commuteLatitude,commuteLongitude,preferredCommuteKm",
    )
    .eq("userId", user.id)
    .single();

  if (preferencesError || !preferencesData) {
    throw new Error("Unable to load the authenticated preferences.");
  }

  const preferences = preferencesData as PreferencesRow;
  const { data: preferredRows, error: preferredRowsError } = await supabase
    .from("UserPreferredLocality")
    .select("localityId,priority")
    .eq("preferencesId", preferences.id)
    .order("priority");

  if (preferredRowsError) {
    throw new Error("Unable to load preferred localities.");
  }

  const localityIds = (preferredRows ?? []).map((row) => row.localityId);
  let localityNames: string[] = [];

  if (localityIds.length > 0) {
    const { data: localityRows, error: localityError } = await supabase
      .from("Locality")
      .select("id,name")
      .in("id", localityIds);

    if (localityError) {
      throw new Error("Unable to load locality names.");
    }

    const nameById = new Map(
      (localityRows ?? []).map((locality) => [locality.id, locality.name]),
    );
    localityNames = localityIds
      .map((id) => nameById.get(id))
      .filter((name): name is string => Boolean(name));
  }

  const visitOutcomes = await prisma.visitOutcome.findMany({
    where: { userId: user.id },
    select: {
      outcome: true,
      visit: {
        select: {
          post: {
            select: {
              type: true,
              monthlyAmountMin: true,
              monthlyAmountMax: true,
              community: {
                select: { locality: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  const verificationChecks = await prisma.verificationCheck.findMany({
    where: { userId: user.id, status: "VERIFIED" },
    select: {
      kind: true,
      status: true,
      verifiedAt: true,
      expiresAt: true,
    },
    orderBy: { verifiedAt: "asc" },
  });

  const lifestyle: LifestylePreferences = {
    diet: databaseLabel(dietFromDatabase, preferences.diet),
    smoking: databaseLabel(smokingFromDatabase, preferences.smoking),
    drinking: databaseLabel(drinkingFromDatabase, preferences.drinking),
    sleepSchedule: databaseLabel(
      sleepFromDatabase,
      preferences.sleepSchedule,
    ),
    cleanliness: databaseLabel(
      cleanlinessFromDatabase,
      preferences.cleanliness,
    ),
    pets: databaseLabel(petsFromDatabase, preferences.pets),
    status: databaseLabel(
      occupationFromDatabase,
      preferences.occupationStatus,
    ),
  };

  return {
    name: user.name,
    age: calculateAge(user.dateOfBirth),
    profession: user.profession ?? "",
    organization: user.companyOrCollege ?? "",
    preferredLocalities: localityNames,
    budget: formatBudget(preferences.budgetMin, preferences.budgetMax),
    moveInDate: preferences.preferredMoveInDate ?? "",
    bio: user.bio ?? "",
    commute: {
      destination: preferences.commuteDestination ?? "",
      latitude:
        preferences.commuteLatitude === null
          ? null
          : Number(preferences.commuteLatitude),
      longitude:
        preferences.commuteLongitude === null
          ? null
          : Number(preferences.commuteLongitude),
      preferredRangeKm: preferences.preferredCommuteKm,
    },
    preferences: lifestyle,
    visitOutcomeHistory: visitOutcomes.flatMap(({ outcome, visit }) => {
      if (visit.post.type !== "ROOM_AVAILABLE" && visit.post.type !== "PG_AVAILABLE") {
        return [];
      }
      return [{
        outcome,
        category:
          visit.post.type === "ROOM_AVAILABLE"
            ? ("Room Available" as const)
            : ("PG Available" as const),
        locality: visit.post.community.locality.name,
        monthlyAmountMin: visit.post.monthlyAmountMin,
        monthlyAmountMax: visit.post.monthlyAmountMax,
      }];
    }),
    verification: verificationSummary(verificationChecks),
  } satisfies UserProfile;
}

export function profilePreferencesToDatabase(preferences: LifestylePreferences) {
  return {
    diet: reverseMap(dietFromDatabase, preferences.diet),
    smoking: reverseMap(smokingFromDatabase, preferences.smoking),
    drinking: reverseMap(drinkingFromDatabase, preferences.drinking),
    sleepSchedule: reverseMap(sleepFromDatabase, preferences.sleepSchedule),
    cleanliness: reverseMap(
      cleanlinessFromDatabase,
      preferences.cleanliness,
    ),
    pets: reverseMap(petsFromDatabase, preferences.pets),
    occupationStatus: reverseMap(
      occupationFromDatabase,
      preferences.status,
    ),
  };
}

export function ageToDateOfBirth(age: number) {
  if (!age) {
    return null;
  }

  return `${new Date().getUTCFullYear() - age}-01-01`;
}

export function parseBudget(value: string) {
  const amounts = value
    .match(/\d[\d,]*/g)
    ?.map((amount) => Number(amount.replaceAll(",", "")))
    .filter(Number.isFinite);

  if (!value.trim()) {
    return { minimum: null, maximum: null };
  }

  if (!amounts?.length) {
    return null;
  }

  const minimum = amounts[0];
  const maximum = amounts[1] ?? amounts[0];

  if (minimum < 0 || maximum < minimum) {
    return null;
  }

  return { minimum, maximum };
}
