-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CommunityRole" AS ENUM ('MEMBER', 'MODERATOR');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('NEED_ROOM', 'ROOM_AVAILABLE', 'NEED_FLATMATE', 'PG_AVAILABLE');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GenderPreference" AS ENUM ('ANY', 'WOMEN', 'MEN');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'INDEPENDENT_HOUSE', 'PG', 'HOSTEL', 'OTHER');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('PRIVATE_ROOM', 'SHARED_ROOM', 'ENTIRE_PLACE');

-- CreateEnum
CREATE TYPE "FurnishingStatus" AS ENUM ('FURNISHED', 'SEMI_FURNISHED', 'UNFURNISHED');

-- CreateEnum
CREATE TYPE "DietPreference" AS ENUM ('VEGETARIAN', 'NON_VEGETARIAN', 'EGGETARIAN', 'VEGAN');

-- CreateEnum
CREATE TYPE "HabitFrequency" AS ENUM ('NEVER', 'OCCASIONALLY', 'REGULARLY');

-- CreateEnum
CREATE TYPE "SleepSchedule" AS ENUM ('EARLY_BIRD', 'BALANCED', 'NIGHT_OWL');

-- CreateEnum
CREATE TYPE "CleanlinessLevel" AS ENUM ('RELAXED', 'MODERATE', 'VERY_TIDY');

-- CreateEnum
CREATE TYPE "PetPreference" AS ENUM ('HAS_PETS', 'PET_FRIENDLY', 'PREFERS_NO_PETS');

-- CreateEnum
CREATE TYPE "OccupationStatus" AS ENUM ('STUDENT', 'WORKING_PROFESSIONAL', 'SELF_EMPLOYED', 'FREELANCER', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "dateOfBirth" DATE,
    "profession" TEXT,
    "companyOrCollege" TEXT,
    "bio" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL DEFAULT 'IN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Locality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Locality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Community" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "localityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityMember" (
    "userId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "role" "CommunityRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityMember_pkey" PRIMARY KEY ("userId","communityId")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "type" "PostType" NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" VARCHAR(140) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "monthlyAmountMin" INTEGER,
    "monthlyAmountMax" INTEGER,
    "securityDeposit" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "moveInDate" DATE,
    "genderPreference" "GenderPreference" NOT NULL DEFAULT 'ANY',
    "propertyType" "PropertyType",
    "roomType" "RoomType",
    "furnishingStatus" "FurnishingStatus",
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "currentOccupants" INTEGER,
    "availableSpots" INTEGER,
    "mealsIncluded" BOOLEAN,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "preferredMoveInDate" DATE,
    "diet" "DietPreference",
    "smoking" "HabitFrequency",
    "drinking" "HabitFrequency",
    "sleepSchedule" "SleepSchedule",
    "cleanliness" "CleanlinessLevel",
    "pets" "PetPreference",
    "occupationStatus" "OccupationStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferredLocality" (
    "preferencesId" TEXT NOT NULL,
    "localityId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPreferredLocality_pkey" PRIMARY KEY ("preferencesId","localityId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE INDEX "City_state_idx" ON "City"("state");

-- CreateIndex
CREATE UNIQUE INDEX "City_name_state_countryCode_key" ON "City"("name", "state", "countryCode");

-- CreateIndex
CREATE INDEX "Locality_cityId_name_idx" ON "Locality"("cityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Locality_cityId_slug_key" ON "Locality"("cityId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Community_localityId_key" ON "Community"("localityId");

-- CreateIndex
CREATE INDEX "Community_isActive_idx" ON "Community"("isActive");

-- CreateIndex
CREATE INDEX "CommunityMember_communityId_joinedAt_idx" ON "CommunityMember"("communityId", "joinedAt");

-- CreateIndex
CREATE INDEX "Post_authorId_createdAt_idx" ON "Post"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_communityId_type_status_createdAt_idx" ON "Post"("communityId", "type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Post_moveInDate_idx" ON "Post"("moveInDate");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- CreateIndex
CREATE INDEX "UserPreferredLocality_localityId_idx" ON "UserPreferredLocality"("localityId");

-- CreateIndex
CREATE INDEX "UserPreferredLocality_preferencesId_priority_idx" ON "UserPreferredLocality"("preferencesId", "priority");

-- AddForeignKey
ALTER TABLE "Locality" ADD CONSTRAINT "Locality_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferredLocality" ADD CONSTRAINT "UserPreferredLocality_preferencesId_fkey" FOREIGN KEY ("preferencesId") REFERENCES "UserPreferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferredLocality" ADD CONSTRAINT "UserPreferredLocality_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE CASCADE ON UPDATE CASCADE;
