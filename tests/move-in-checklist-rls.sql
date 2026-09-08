-- Rollback-only integration test for finalized participant checklist isolation.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '57000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'checklist-owner@example.test', '', now(), '{}', '{"full_name":"Checklist Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '57000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'checklist-requester@example.test', '', now(), '{}', '{"full_name":"Checklist Requester"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '57000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'checklist-outsider@example.test', '', now(), '{}', '{"full_name":"Checklist Outsider"}', now(), now());

SELECT set_config('nestmate.checklist_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '57000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.checklist_requester', (SELECT "id" FROM public."User" WHERE "authUserId" = '57000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.checklist_outsider', (SELECT "id" FROM public."User" WHERE "authUserId" = '57000000-0000-4000-8000-0000000000c3'), true);

INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('checklist-pref-owner', current_setting('nestmate.checklist_owner'), now()),
  ('checklist-pref-requester', current_setting('nestmate.checklist_requester'), now()),
  ('checklist-pref-outsider', current_setting('nestmate.checklist_outsider'), now())
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('checklist-test-city', 'Checklist Test City', 'checklist-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('checklist-test-locality', 'Checklist Test Locality', 'checklist-test-locality', 'checklist-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('checklist-test-community', 'Checklist Test Community', 'checklist-test-community', 'checklist-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES (
  'checklist-test-post',
  'ROOM_AVAILABLE'::public."PostType",
  'Finalized room for checklist testing',
  'Temporary listing used only to verify private move-in checklist policies.',
  current_setting('nestmate.checklist_owner'),
  'checklist-test-community',
  'AVAILABLE'::public."ListingAvailabilityStatus",
  now(),
  now()
);

-- Build a completed-visit fixture without invoking the live request-time workflow.
-- The checklist behavior itself is exercised below as authenticated participants.
SET LOCAL session_replication_role = replica;
INSERT INTO public."VisitRequest" (
  "id", "postId", "requesterId", "ownerId", "status",
  "requestedAt", "scheduledAt", "respondedAt", "updatedAt"
) VALUES (
  '57000000-0000-4000-8000-0000000000d4',
  'checklist-test-post',
  current_setting('nestmate.checklist_requester'),
  current_setting('nestmate.checklist_owner'),
  'ACCEPTED'::public."VisitRequestStatus",
  now() - interval '2 days',
  now() - interval '1 day',
  now() - interval '2 days',
  now()
);
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"57000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '57000000-0000-4000-8000-0000000000a1', true);

INSERT INTO public."VisitOutcome" ("visitId", "userId", "outcome")
VALUES (
  '57000000-0000-4000-8000-0000000000d4',
  current_setting('nestmate.checklist_owner'),
  'FINALIZED'::public."VisitOutcomeType"
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public."MoveInChecklist") <> 1 THEN
    RAISE EXCEPTION 'Finalized owner outcome did not create one private checklist.';
  END IF;
  IF (SELECT count(*) FROM public."MoveInChecklistItem") <> 9 THEN
    RAISE EXCEPTION 'The owner checklist did not receive all nine tasks.';
  END IF;
END;
$$;

UPDATE public."MoveInChecklistItem"
SET "privateDetail" = 'Confirmed privately', "isCompleted" = TRUE
WHERE "kind" = 'DEPOSIT_CONFIRMATION'::public."MoveInChecklistItemKind";

DO $$
DECLARE
  identity_change_denied BOOLEAN := FALSE;
  direct_insert_denied BOOLEAN := FALSE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."MoveInChecklistItem"
    WHERE "kind" = 'DEPOSIT_CONFIRMATION'::public."MoveInChecklistItemKind"
      AND "privateDetail" = 'Confirmed privately'
      AND "isCompleted"
      AND "completedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The owner could not save a private completion state.';
  END IF;
  BEGIN
    UPDATE public."MoveInChecklistItem" SET "label" = 'Changed identity';
  EXCEPTION WHEN insufficient_privilege THEN identity_change_denied := TRUE;
  END;
  BEGIN
    INSERT INTO public."MoveInChecklist" (
      "userId", "visitId", "targetType", "postId"
    ) VALUES (
      current_setting('nestmate.checklist_owner'),
      '57000000-0000-4000-8000-0000000000d4',
      'LISTING'::public."InterestTargetType",
      'checklist-test-post'
    );
  EXCEPTION WHEN insufficient_privilege THEN direct_insert_denied := TRUE;
  END;
  IF NOT identity_change_denied OR NOT direct_insert_denied THEN
    RAISE EXCEPTION 'A protected checklist mutation was accepted.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"57000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '57000000-0000-4000-8000-0000000000b2', true);

INSERT INTO public."InterestActivity" (
  "userId", "targetType", "postId", "stage"
) VALUES (
  current_setting('nestmate.checklist_requester'),
  'LISTING'::public."InterestTargetType",
  'checklist-test-post',
  'FINALIZED'::public."InterestStage"
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public."MoveInChecklist") <> 1 THEN
    RAISE EXCEPTION 'The requester could not read exactly their own checklist.';
  END IF;
  IF (SELECT count(*) FROM public."MoveInChecklistItem") <> 9 THEN
    RAISE EXCEPTION 'The requester checklist did not receive all nine tasks.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."MoveInChecklistItem"
    WHERE "privateDetail" = 'Confirmed privately'
  ) THEN
    RAISE EXCEPTION 'The owner private detail leaked to the requester.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"57000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '57000000-0000-4000-8000-0000000000c3', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."MoveInChecklist")
    OR EXISTS (SELECT 1 FROM public."MoveInChecklistItem") THEN
    RAISE EXCEPTION 'An outsider could read participant checklists.';
  END IF;
  UPDATE public."MoveInChecklistItem"
  SET "isCompleted" = TRUE;
  IF FOUND THEN
    RAISE EXCEPTION 'An outsider could update participant checklist tasks.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"57000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '57000000-0000-4000-8000-0000000000b2', true);
INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (
  current_setting('nestmate.checklist_requester'),
  current_setting('nestmate.checklist_owner')
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."MoveInChecklist")
    OR EXISTS (SELECT 1 FROM public."MoveInChecklistItem") THEN
    RAISE EXCEPTION 'Checklist data remained visible after blocking the participant.';
  END IF;
END;
$$;

ROLLBACK;
