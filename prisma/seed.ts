import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { resolveDatabaseUrl } from "../lib/database-url";

const connectionString = resolveDatabaseUrl(
  process.env.DATABASE_URL,
  process.env.DATABASE_PASSWORD,
  "DATABASE_URL",
);

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const cities = [
  {
    name: "Bengaluru",
    slug: "bengaluru",
    state: "Karnataka",
    localities: ["Indiranagar", "Koramangala", "HSR Layout"],
  },
  {
    name: "Mumbai",
    slug: "mumbai",
    state: "Maharashtra",
    localities: ["Andheri West", "Powai", "Bandra West"],
  },
  {
    name: "Pune",
    slug: "pune",
    state: "Maharashtra",
    localities: ["Baner", "Kharadi", "Viman Nagar"],
  },
  {
    name: "Hyderabad",
    slug: "hyderabad",
    state: "Telangana",
    localities: ["Gachibowli", "Kondapur", "Jubilee Hills"],
  },
] as const;

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  for (const cityData of cities) {
    const city = await prisma.city.upsert({
      where: { slug: cityData.slug },
      update: {
        name: cityData.name,
        state: cityData.state,
        countryCode: "IN",
      },
      create: {
        name: cityData.name,
        slug: cityData.slug,
        state: cityData.state,
        countryCode: "IN",
      },
    });

    for (const localityName of cityData.localities) {
      const localitySlug = toSlug(localityName);
      const locality = await prisma.locality.upsert({
        where: {
          cityId_slug: {
            cityId: city.id,
            slug: localitySlug,
          },
        },
        update: { name: localityName },
        create: {
          name: localityName,
          slug: localitySlug,
          cityId: city.id,
        },
      });

      await prisma.community.upsert({
        where: { localityId: locality.id },
        update: {
          name: `${localityName} Housing Community`,
          slug: `${cityData.slug}-${localitySlug}`,
          description: `Find rooms, flatmates, and PGs in ${localityName}, ${cityData.name}.`,
          isActive: true,
        },
        create: {
          name: `${localityName} Housing Community`,
          slug: `${cityData.slug}-${localitySlug}`,
          description: `Find rooms, flatmates, and PGs in ${localityName}, ${cityData.name}.`,
          localityId: locality.id,
        },
      });
    }
  }

  console.info(`Seeded ${cities.length} cities and ${cities.reduce((total, city) => total + city.localities.length, 0)} localities.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
