-- Rollback-only integration test for private reports and directional blocks.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'safety-a@example.test', '', now(), '{}', '{"full_name":"Safety A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'safety-b@example.test', '', now(), '{}', '{"full_name":"Safety B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'safety-c@example.test', '', now(), '{}', '{"full_name":"Safety C"}', now(), now());

SELECT set_config(
  'nestmate.safety_user_a',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '20000000-0000-4000-8000-0000000000a1'),
  true
);
SELECT set_config(
  'nestmate.safety_user_b',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '20000000-0000-4000-8000-0000000000b2'),
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);

DO $$
DECLARE
  current_user_id TEXT;
  target_user_id TEXT;
BEGIN
  current_user_id := current_setting('nestmate.safety_user_a');
  target_user_id := current_setting('nestmate.safety_user_b');

  INSERT INTO public."Report" (
    "reporterId", "reportedUserId", "targetType", "targetId", "reason"
  ) VALUES (
    current_user_id,
    target_user_id,
    'USER'::public."ReportTargetType",
    target_user_id,
    'SAFETY_CONCERN'::public."ReportReason"
  );

  INSERT INTO public."UserBlock" ("blockerId", "blockedId")
  VALUES (current_user_id, target_user_id);

  IF (SELECT count(*) FROM public."Report") <> 1
    OR (SELECT count(*) FROM public."UserBlock") <> 1 THEN
    RAISE EXCEPTION 'Reporter could not read their own safety records.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.list_chat_users()
    WHERE user_id = target_user_id
  ) THEN
    RAISE EXCEPTION 'A blocked user remained visible in private chat.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-0000000000c3","role":"authenticated"}',
  true
);

DO $$
DECLARE
  update_denied BOOLEAN := FALSE;
  delete_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."Report") <> 0
    OR (SELECT count(*) FROM public."UserBlock") <> 0 THEN
    RAISE EXCEPTION 'Another user could read private safety records.';
  END IF;

  BEGIN
    UPDATE public."Report" SET "details" = 'tampered';
  EXCEPTION WHEN insufficient_privilege THEN
    update_denied := TRUE;
  END;

  BEGIN
    DELETE FROM public."Report";
  EXCEPTION WHEN insufficient_privilege THEN
    delete_denied := TRUE;
  END;

  IF NOT update_denied OR NOT delete_denied THEN
    RAISE EXCEPTION 'Client report mutation privileges are too broad.';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
