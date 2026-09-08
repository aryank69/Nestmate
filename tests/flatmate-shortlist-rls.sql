-- Rollback-only integration test for flatmate-shortlist ownership and privacy.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'shortlist-owner@example.test', '', now(), '{}', '{"full_name":"Shortlist Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'shortlist-target@example.test', '', now(), '{}', '{"full_name":"Visible Target"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'shortlist-blocked@example.test', '', now(), '{}', '{"full_name":"Blocked Target"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'shortlist-suspended@example.test', '', now(), '{}', '{"full_name":"Suspended Target"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-4000-8000-0000000000e5', 'authenticated', 'authenticated', 'shortlist-outsider@example.test', '', now(), '{}', '{"full_name":"Shortlist Outsider"}', now(), now());

SELECT set_config('nestmate.shortlist_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '4a000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.shortlist_target', (SELECT "id" FROM public."User" WHERE "authUserId" = '4a000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.shortlist_blocked', (SELECT "id" FROM public."User" WHERE "authUserId" = '4a000000-0000-4000-8000-0000000000c3'), true);
SELECT set_config('nestmate.shortlist_suspended', (SELECT "id" FROM public."User" WHERE "authUserId" = '4a000000-0000-4000-8000-0000000000d4'), true);
SELECT set_config('nestmate.shortlist_outsider', (SELECT "id" FROM public."User" WHERE "authUserId" = '4a000000-0000-4000-8000-0000000000e5'), true);

INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('shortlist-pref-owner', current_setting('nestmate.shortlist_owner'), now()),
  ('shortlist-pref-target', current_setting('nestmate.shortlist_target'), now()),
  ('shortlist-pref-blocked', current_setting('nestmate.shortlist_blocked'), now()),
  ('shortlist-pref-suspended', current_setting('nestmate.shortlist_suspended'), now()),
  ('shortlist-pref-outsider', current_setting('nestmate.shortlist_outsider'), now())
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (current_setting('nestmate.shortlist_blocked'), current_setting('nestmate.shortlist_owner'));

INSERT INTO public."UserModerationState" (
  "userId", "status", "privateReason", "updatedById", "updatedAt"
) VALUES (
  current_setting('nestmate.shortlist_suspended'),
  'SUSPENDED'::public."UserModerationStatus",
  'Temporary RLS test state',
  current_setting('nestmate.shortlist_owner'),
  now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"4a000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '4a000000-0000-4000-8000-0000000000a1', true);

INSERT INTO public."ShortlistedProfile" ("userId", "targetUserId")
VALUES (current_setting('nestmate.shortlist_owner'), current_setting('nestmate.shortlist_target'));

DO $$
DECLARE
  self_denied BOOLEAN := FALSE;
  blocked_denied BOOLEAN := FALSE;
  suspended_denied BOOLEAN := FALSE;
  cross_owner_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."ShortlistedProfile") <> 1 THEN
    RAISE EXCEPTION 'The owner could not read their visible shortlist.';
  END IF;

  BEGIN
    INSERT INTO public."ShortlistedProfile" ("userId", "targetUserId")
    VALUES (current_setting('nestmate.shortlist_owner'), current_setting('nestmate.shortlist_owner'));
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN self_denied := TRUE;
  END;
  BEGIN
    INSERT INTO public."ShortlistedProfile" ("userId", "targetUserId")
    VALUES (current_setting('nestmate.shortlist_owner'), current_setting('nestmate.shortlist_blocked'));
  EXCEPTION WHEN insufficient_privilege THEN blocked_denied := TRUE;
  END;
  BEGIN
    INSERT INTO public."ShortlistedProfile" ("userId", "targetUserId")
    VALUES (current_setting('nestmate.shortlist_owner'), current_setting('nestmate.shortlist_suspended'));
  EXCEPTION WHEN insufficient_privilege THEN suspended_denied := TRUE;
  END;
  BEGIN
    INSERT INTO public."ShortlistedProfile" ("userId", "targetUserId")
    VALUES (current_setting('nestmate.shortlist_outsider'), current_setting('nestmate.shortlist_target'));
  EXCEPTION WHEN insufficient_privilege THEN cross_owner_denied := TRUE;
  END;

  IF NOT self_denied OR NOT blocked_denied OR NOT suspended_denied OR NOT cross_owner_denied THEN
    RAISE EXCEPTION 'One or more protected shortlist writes were accepted.';
  END IF;
END;
$$;

DO $$
BEGIN
  DELETE FROM public."ShortlistedProfile"
  WHERE "userId" = current_setting('nestmate.shortlist_owner')
    AND "targetUserId" = current_setting('nestmate.shortlist_target');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The owner could not remove their visible shortlist row.';
  END IF;
END;
$$;
INSERT INTO public."ShortlistedProfile" ("userId", "targetUserId")
VALUES (current_setting('nestmate.shortlist_owner'), current_setting('nestmate.shortlist_target'));

SELECT set_config('request.jwt.claims', '{"sub":"4a000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '4a000000-0000-4000-8000-0000000000b2', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."ShortlistedProfile") THEN
    RAISE EXCEPTION 'A shortlisted person could see who shortlisted them.';
  END IF;
  DELETE FROM public."ShortlistedProfile"
  WHERE "userId" = current_setting('nestmate.shortlist_owner');
  IF FOUND THEN
    RAISE EXCEPTION 'Another user could remove the owner shortlist.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"4a000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '4a000000-0000-4000-8000-0000000000a1', true);

INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (current_setting('nestmate.shortlist_owner'), current_setting('nestmate.shortlist_target'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."ShortlistedProfile") THEN
    RAISE EXCEPTION 'A newly blocked profile remained visible in the shortlist.';
  END IF;
END;
$$;

ROLLBACK;
