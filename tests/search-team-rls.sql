-- Rollback-only integration test for private collaborative Team Mode.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '49000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'team-owner@example.test', '', now(), '{}', '{"full_name":"Team Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '49000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'team-member@example.test', '', now(), '{}', '{"full_name":"Team Member"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '49000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'team-outsider@example.test', '', now(), '{}', '{"full_name":"Team Outsider"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '49000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'team-listing-author@example.test', '', now(), '{}', '{"full_name":"Listing Author"}', now(), now());

SELECT set_config('nestmate.team_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '49000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.team_member', (SELECT "id" FROM public."User" WHERE "authUserId" = '49000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.team_outsider', (SELECT "id" FROM public."User" WHERE "authUserId" = '49000000-0000-4000-8000-0000000000c3'), true);
SELECT set_config('nestmate.team_author', (SELECT "id" FROM public."User" WHERE "authUserId" = '49000000-0000-4000-8000-0000000000d4'), true);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt") VALUES ('team-test-city', 'Team Test City', 'team-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt") VALUES ('team-test-locality', 'Team Test Locality', 'team-test-locality', 'team-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt") VALUES ('team-test-community', 'Team Test Community', 'team-test-community', 'team-test-locality', now());
INSERT INTO public."Post" ("id", "type", "title", "description", "authorId", "communityId", "availabilityStatus", "publishedAt", "updatedAt")
VALUES ('team-test-post', 'ROOM_AVAILABLE'::public."PostType", 'Team test listing', 'Temporary shared listing.', current_setting('nestmate.team_author'), 'team-test-community', 'AVAILABLE'::public."ListingAvailabilityStatus", now(), now());
INSERT INTO public."SavedPost" ("userId", "postId") VALUES (current_setting('nestmate.team_owner'), 'team-test-post');

ALTER TABLE public."VisitRequest" DISABLE TRIGGER USER;
INSERT INTO public."VisitRequest" ("id", "postId", "requesterId", "ownerId", "status", "requestedAt", "scheduledAt", "respondedAt", "createdAt", "updatedAt")
VALUES ('49000000-0000-4000-8000-0000000000e5', 'team-test-post', current_setting('nestmate.team_owner'), current_setting('nestmate.team_author'), 'ACCEPTED'::public."VisitRequestStatus", now(), now() + interval '1 day', now(), now(), now());
ALTER TABLE public."VisitRequest" ENABLE TRIGGER USER;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"49000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-0000000000a1', true);

INSERT INTO public."SearchTeam" ("id", "name", "ownerId") VALUES ('49000000-0000-4000-8000-0000000000f1', 'Private home search', current_setting('nestmate.team_owner'));
INSERT INTO public."SearchTeamMember" ("teamId", "userId", "role") VALUES ('49000000-0000-4000-8000-0000000000f1', current_setting('nestmate.team_owner'), 'OWNER');
INSERT INTO public."SearchTeamInvite" ("id", "teamId", "invitedById", "recipientId", "expiresAt")
VALUES ('49000000-0000-4000-8000-0000000000f2', '49000000-0000-4000-8000-0000000000f1', current_setting('nestmate.team_owner'), current_setting('nestmate.team_member'), now() + interval '7 days');
INSERT INTO public."SearchTeamListing" ("teamId", "postId", "addedById") VALUES ('49000000-0000-4000-8000-0000000000f1', 'team-test-post', current_setting('nestmate.team_owner'));
INSERT INTO public."SearchTeamVisit" ("teamId", "visitId", "postId", "sharedById") VALUES ('49000000-0000-4000-8000-0000000000f1', '49000000-0000-4000-8000-0000000000e5', 'team-test-post', current_setting('nestmate.team_owner'));

SELECT set_config('request.jwt.claims', '{"sub":"49000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-0000000000b2', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public."SearchTeamInvite") <> 1 THEN RAISE EXCEPTION 'Recipient cannot read their invitation.'; END IF;
  IF EXISTS (SELECT 1 FROM public."SearchTeam") THEN RAISE EXCEPTION 'Invite exposed team workspace before acceptance.'; END IF;
END $$;
UPDATE public."SearchTeamInvite" SET "status" = 'ACCEPTED', "acceptedAt" = now() WHERE "id" = '49000000-0000-4000-8000-0000000000f2';
INSERT INTO public."SearchTeamMember" ("teamId", "userId", "role") VALUES ('49000000-0000-4000-8000-0000000000f1', current_setting('nestmate.team_member'), 'MEMBER');
INSERT INTO public."SearchTeamVote" ("teamId", "postId", "userId", "choice") VALUES ('49000000-0000-4000-8000-0000000000f1', 'team-test-post', current_setting('nestmate.team_member'), 'YES');
INSERT INTO public."SearchTeamComment" ("id", "teamId", "postId", "authorId", "body") VALUES ('49000000-0000-4000-8000-0000000000f3', '49000000-0000-4000-8000-0000000000f1', 'team-test-post', current_setting('nestmate.team_member'), 'Looks good for our shortlist.');
DO $$ BEGIN
  IF (SELECT count(*) FROM public."SearchTeam") <> 1 OR (SELECT count(*) FROM public."SearchTeamMember") <> 2 THEN RAISE EXCEPTION 'Accepted member cannot read team membership.'; END IF;
  IF (SELECT count(*) FROM public."SearchTeamListing") <> 1 OR (SELECT count(*) FROM public."SearchTeamVote") <> 1 OR (SELECT count(*) FROM public."SearchTeamComment") <> 1 THEN RAISE EXCEPTION 'Member cannot use shared listing collaboration.'; END IF;
  IF (SELECT count(*) FROM public."SearchTeamVisit") <> 1 THEN RAISE EXCEPTION 'Member cannot read privacy-safe shared visit.'; END IF;
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"49000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."SearchTeam") OR EXISTS (SELECT 1 FROM public."SearchTeamMember") OR EXISTS (SELECT 1 FROM public."SearchTeamListing") OR EXISTS (SELECT 1 FROM public."SearchTeamComment") OR EXISTS (SELECT 1 FROM public."SearchTeamVisit") THEN
    RAISE EXCEPTION 'Outsider can read private team data.';
  END IF;
  BEGIN
    INSERT INTO public."SearchTeamVote" ("teamId", "postId", "userId", "choice") VALUES ('49000000-0000-4000-8000-0000000000f1', 'team-test-post', current_setting('nestmate.team_outsider'), 'YES');
  EXCEPTION WHEN insufficient_privilege THEN denied := TRUE;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Outsider can vote in a private team.'; END IF;
END $$;

RESET ROLE;
INSERT INTO public."UserBlock" ("blockerId", "blockedId") VALUES (current_setting('nestmate.team_member'), current_setting('nestmate.team_author'));
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"49000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-0000000000b2', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public."SearchTeamListing") OR EXISTS (SELECT 1 FROM public."SearchTeamVote") OR EXISTS (SELECT 1 FROM public."SearchTeamComment") OR EXISTS (SELECT 1 FROM public."SearchTeamVisit") THEN
    RAISE EXCEPTION 'Blocked listing content remained visible inside Team Mode.';
  END IF;
END $$;

ROLLBACK;
