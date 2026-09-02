-- Search is intentionally backed by trigram indexes because the product uses
-- case-insensitive contains queries rather than exact or prefix-only matching.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS "Post_title_search_idx"
ON "Post" USING GIN ("title" extensions.gin_trgm_ops)
WHERE "status" = 'ACTIVE' AND "publishedAt" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Post_description_search_idx"
ON "Post" USING GIN ("description" extensions.gin_trgm_ops)
WHERE "status" = 'ACTIVE' AND "publishedAt" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "User_name_search_idx"
ON "User" USING GIN ("name" extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "User_profession_search_idx"
ON "User" USING GIN ("profession" extensions.gin_trgm_ops)
WHERE "profession" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "User_companyOrCollege_search_idx"
ON "User" USING GIN ("companyOrCollege" extensions.gin_trgm_ops)
WHERE "companyOrCollege" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Post_communityId_status_publishedAt_id_idx"
ON "Post"("communityId", "status", "publishedAt" DESC, "id");
CREATE INDEX IF NOT EXISTS "Post_communityId_status_genderPreference_idx"
ON "Post"("communityId", "status", "genderPreference");
CREATE INDEX IF NOT EXISTS "Post_communityId_status_monthlyAmountMin_idx"
ON "Post"("communityId", "status", "monthlyAmountMin");
CREATE INDEX IF NOT EXISTS "Post_communityId_status_monthlyAmountMax_idx"
ON "Post"("communityId", "status", "monthlyAmountMax");
CREATE INDEX IF NOT EXISTS "Post_communityId_status_moveInDate_idx"
ON "Post"("communityId", "status", "moveInDate");

CREATE INDEX IF NOT EXISTS "UserPreferences_budgetMin_budgetMax_idx"
ON "UserPreferences"("budgetMin", "budgetMax");
CREATE INDEX IF NOT EXISTS "UserPreferences_preferredMoveInDate_idx"
ON "UserPreferences"("preferredMoveInDate");
CREATE INDEX IF NOT EXISTS "UserPreferences_diet_idx" ON "UserPreferences"("diet");
CREATE INDEX IF NOT EXISTS "UserPreferences_smoking_idx" ON "UserPreferences"("smoking");
CREATE INDEX IF NOT EXISTS "UserPreferences_drinking_idx" ON "UserPreferences"("drinking");
CREATE INDEX IF NOT EXISTS "UserPreferences_sleepSchedule_idx" ON "UserPreferences"("sleepSchedule");
CREATE INDEX IF NOT EXISTS "UserPreferences_cleanliness_idx" ON "UserPreferences"("cleanliness");
CREATE INDEX IF NOT EXISTS "UserPreferences_pets_idx" ON "UserPreferences"("pets");
CREATE INDEX IF NOT EXISTS "UserPreferences_occupationStatus_idx" ON "UserPreferences"("occupationStatus");
