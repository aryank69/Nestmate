-- Rollback-only integration test for moderator RBAC, actions, privacy, and audit logging.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '48000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'moderation-admin@example.test', '', now(), '{}', '{"full_name":"Moderation Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '48000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'moderation-reviewer@example.test', '', now(), '{}', '{"full_name":"Moderation Reviewer"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '48000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'moderation-normal@example.test', '', now(), '{}', '{"full_name":"Normal Member"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '48000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'moderation-subject@example.test', '', now(), '{}', '{"full_name":"Reported Member"}', now(), now());

SELECT set_config('nestmate.mod_admin', (SELECT "id" FROM public."User" WHERE "authUserId" = '48000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.mod_reviewer', (SELECT "id" FROM public."User" WHERE "authUserId" = '48000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.mod_normal', (SELECT "id" FROM public."User" WHERE "authUserId" = '48000000-0000-4000-8000-0000000000c3'), true);
SELECT set_config('nestmate.mod_subject', (SELECT "id" FROM public."User" WHERE "authUserId" = '48000000-0000-4000-8000-0000000000d4'), true);

INSERT INTO public."ModeratorMembership" ("userId", "role") VALUES
  (current_setting('nestmate.mod_admin'), 'ADMIN'::public."ModeratorRole"),
  (current_setting('nestmate.mod_reviewer'), 'MODERATOR'::public."ModeratorRole");

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('moderation-test-city', 'Moderation Test City', 'moderation-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('moderation-test-locality', 'Moderation Test Locality', 'moderation-test-locality', 'moderation-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('moderation-test-community', 'Moderation Test Community', 'moderation-test-community', 'moderation-test-locality', now());
INSERT INTO public."CommunityMember" ("userId", "communityId") VALUES
  (current_setting('nestmate.mod_normal'), 'moderation-test-community'),
  (current_setting('nestmate.mod_subject'), 'moderation-test-community');

INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES (
  'moderation-test-post',
  'ROOM_AVAILABLE'::public."PostType",
  'Moderation test room',
  'A temporary listing used to verify secure content hiding behavior.',
  current_setting('nestmate.mod_subject'),
  'moderation-test-community',
  'AVAILABLE'::public."ListingAvailabilityStatus",
  now(),
  now()
);

INSERT INTO public."SafetyFlag" (
  "id", "actorId", "targetType", "targetId", "category", "severity",
  "scope", "dedupeKey", "privateDetails"
) VALUES
  ('48000000-0000-4000-8000-000000000101', current_setting('nestmate.mod_subject'), 'USER'::public."ReportTargetType", current_setting('nestmate.mod_subject'), 'BURST_ACTIVITY'::public."SafetyFlagCategory", 'MEDIUM'::public."SafetyFlagSeverity", 'ALL'::public."SafetyActivityScope", 'moderation-warn-test', '{"count":12,"lookback":"5 minutes"}'),
  ('48000000-0000-4000-8000-000000000102', current_setting('nestmate.mod_subject'), 'POST'::public."ReportTargetType", 'moderation-test-post', 'REPEATED_CONTACT'::public."SafetyFlagCategory", 'HIGH'::public."SafetyFlagSeverity", 'POST'::public."SafetyActivityScope", 'moderation-hide-test', '{"count":4,"lookback":"24 hours"}'),
  ('48000000-0000-4000-8000-000000000103', current_setting('nestmate.mod_subject'), 'USER'::public."ReportTargetType", current_setting('nestmate.mod_subject'), 'RAPID_ACCOUNT_ACTIVITY'::public."SafetyFlagCategory", 'HIGH'::public."SafetyFlagSeverity", 'ALL'::public."SafetyActivityScope", 'moderation-restrict-test', '{"count":20,"lookback":"10 minutes"}'),
  ('48000000-0000-4000-8000-000000000104', current_setting('nestmate.mod_subject'), 'USER'::public."ReportTargetType", current_setting('nestmate.mod_subject'), 'DUPLICATE_CONTENT'::public."SafetyFlagCategory", 'HIGH'::public."SafetyFlagSeverity", 'ALL'::public."SafetyActivityScope", 'moderation-suspend-test', '{"count":8,"lookback":"24 hours"}');

-- A normal user cannot read moderation internals or invoke privileged actions.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"48000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '48000000-0000-4000-8000-0000000000c3', true);

DO $$
DECLARE
  action_denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."SafetyFlag")
    OR EXISTS (SELECT 1 FROM public."ModerationAuditLog")
    OR EXISTS (SELECT 1 FROM public."UserModerationState")
    OR EXISTS (SELECT 1 FROM public."ModeratorMembership") THEN
    RAISE EXCEPTION 'A normal user could read private moderation data.';
  END IF;

  BEGIN
    PERFORM public.perform_moderation_action(
      'SAFETY_FLAG', '48000000-0000-4000-8000-000000000101',
      'WARN', 'Unauthorized moderation attempt', NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN
    action_denied := TRUE;
  END;
  IF NOT action_denied THEN
    RAISE EXCEPTION 'A normal user performed a moderation action.';
  END IF;
END;
$$;

-- A moderator can review records and take proportionate actions, but cannot suspend.
SELECT set_config('request.jwt.claims', '{"sub":"48000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '48000000-0000-4000-8000-0000000000b2', true);

DO $$
DECLARE
  private_verification_denied BOOLEAN := FALSE;
  suspend_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."SafetyFlag") < 4 THEN
    RAISE EXCEPTION 'A moderator could not review safety flags.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."VerificationCheck"
    WHERE "userId" = current_setting('nestmate.mod_subject')
      AND "status" = 'PENDING'::public."VerificationStatus"
  ) THEN
    RAISE EXCEPTION 'A moderator could not review safe verification status.';
  END IF;
  BEGIN
    EXECUTE 'SELECT "privateMetadata" FROM public."VerificationCheck" LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN
    private_verification_denied := TRUE;
  END;
  IF NOT private_verification_denied THEN
    RAISE EXCEPTION 'Sensitive verification metadata was exposed.';
  END IF;

  PERFORM public.perform_moderation_action(
    'SAFETY_FLAG', '48000000-0000-4000-8000-000000000101',
    'WARN', 'Send a community-guideline reminder', NULL
  );
  PERFORM public.perform_moderation_action(
    'SAFETY_FLAG', '48000000-0000-4000-8000-000000000102',
    'HIDE_CONTENT', 'Repeated contact details require review', NULL
  );
  PERFORM public.perform_moderation_action(
    'SAFETY_FLAG', '48000000-0000-4000-8000-000000000103',
    'RESTRICT', 'Temporarily restrict rapid account activity', 24
  );

  BEGIN
    PERFORM public.perform_moderation_action(
      'SAFETY_FLAG', '48000000-0000-4000-8000-000000000104',
      'SUSPEND', 'A moderator must not permanently suspend', NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN
    suspend_denied := TRUE;
  END;
  IF NOT suspend_denied THEN
    RAISE EXCEPTION 'A moderator permanently suspended an account.';
  END IF;
END;
$$;

-- The warned user receives only a generic notice, not private evidence.
SELECT set_config('request.jwt.claims', '{"sub":"48000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '48000000-0000-4000-8000-0000000000d4', true);

DO $$
DECLARE
  post_denied BOOLEAN := FALSE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Notification"
    WHERE "type" = 'MODERATION_WARNING'::public."NotificationType"
      AND "body" NOT ILIKE '%count%'
      AND "body" NOT ILIKE '%lookback%'
  ) THEN
    RAISE EXCEPTION 'The user did not receive a privacy-safe warning.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."Post" WHERE "id" = 'moderation-test-post'
  ) THEN
    RAISE EXCEPTION 'Moderation-hidden content remained visible.';
  END IF;
  BEGIN
    INSERT INTO public."Post" (
      "id", "type", "title", "description", "authorId", "communityId",
      "availabilityStatus", "publishedAt", "updatedAt"
    ) VALUES (
      'moderation-restricted-post',
      'ROOM_AVAILABLE'::public."PostType",
      'Restricted post attempt',
      'A restricted user should not be able to publish this listing.',
      current_setting('nestmate.mod_subject'),
      'moderation-test-community',
      'AVAILABLE'::public."ListingAvailabilityStatus",
      now(), now()
    );
  EXCEPTION WHEN insufficient_privilege THEN
    post_denied := TRUE;
  END;
  IF NOT post_denied THEN
    RAISE EXCEPTION 'A restricted user could publish content.';
  END IF;
END;
$$;

-- Only an administrator can suspend an account.
SELECT set_config('request.jwt.claims', '{"sub":"48000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '48000000-0000-4000-8000-0000000000a1', true);

SELECT public.perform_moderation_action(
  'SAFETY_FLAG',
  '48000000-0000-4000-8000-000000000104',
  'SUSPEND',
  'Administrator confirmed account suspension',
  NULL
);

DO $$
DECLARE
  audit_insert_denied BOOLEAN := FALSE;
  audit_update_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."ModerationAuditLog") <> 4 THEN
    RAISE EXCEPTION 'Every successful moderation action was not audited.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."UserModerationState"
    WHERE "userId" = current_setting('nestmate.mod_subject')
      AND "status" = 'SUSPENDED'::public."UserModerationStatus"
      AND "restrictedUntil" IS NULL
  ) THEN
    RAISE EXCEPTION 'The administrator suspension was not recorded.';
  END IF;
  BEGIN
    INSERT INTO public."ModerationAuditLog" (
      "moderatorId", "action", "queueType", "queueId", "subjectUserId",
      "targetType", "targetId", "reason"
    ) VALUES (
      current_setting('nestmate.mod_admin'),
      'WARN'::public."ModerationActionType",
      'USER_STATE'::public."ModerationQueueType",
      current_setting('nestmate.mod_subject'),
      current_setting('nestmate.mod_subject'),
      'USER', current_setting('nestmate.mod_subject'), 'Forged audit record'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    audit_insert_denied := TRUE;
  END;
  BEGIN
    UPDATE public."ModerationAuditLog" SET "reason" = 'Tampered audit';
  EXCEPTION WHEN insufficient_privilege THEN
    audit_update_denied := TRUE;
  END;
  IF NOT audit_insert_denied OR NOT audit_update_denied THEN
    RAISE EXCEPTION 'The client could mutate the append-only audit log.';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
