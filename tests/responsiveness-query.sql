-- Rollback-only integration test for privacy-safe response-delay aggregation.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '43000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'responsive-a@example.test', '', now(), '{}', '{"full_name":"Responsive A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '43000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'responsive-b@example.test', '', now(), '{}', '{"full_name":"Responsive B"}', now(), now());

SELECT set_config(
  'nestmate.responsive_a',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '43000000-0000-4000-8000-0000000000a1'),
  true
);
SELECT set_config(
  'nestmate.responsive_b',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '43000000-0000-4000-8000-0000000000b2'),
  true
);

INSERT INTO public."Conversation" (
  "id", "participantOneId", "participantTwoId", "updatedAt"
)
VALUES (
  '43000000-0000-4000-8000-0000000000c3',
  LEAST(current_setting('nestmate.responsive_a'), current_setting('nestmate.responsive_b')),
  GREATEST(current_setting('nestmate.responsive_a'), current_setting('nestmate.responsive_b')),
  now()
);

INSERT INTO public."Message" (
  "id", "conversationId", "senderId", "body", "createdAt"
)
VALUES
  ('43000000-0000-4000-8000-000000000101', '43000000-0000-4000-8000-0000000000c3', current_setting('nestmate.responsive_a'), 'private-a1', now() - interval '6 hours'),
  ('43000000-0000-4000-8000-000000000102', '43000000-0000-4000-8000-0000000000c3', current_setting('nestmate.responsive_b'), 'private-b1', now() - interval '5 hours'),
  ('43000000-0000-4000-8000-000000000103', '43000000-0000-4000-8000-0000000000c3', current_setting('nestmate.responsive_a'), 'private-a2', now() - interval '4 hours'),
  ('43000000-0000-4000-8000-000000000104', '43000000-0000-4000-8000-0000000000c3', current_setting('nestmate.responsive_b'), 'private-b2', now() - interval '3 hours'),
  ('43000000-0000-4000-8000-000000000105', '43000000-0000-4000-8000-0000000000c3', current_setting('nestmate.responsive_a'), 'private-a3', now() - interval '2 hours'),
  ('43000000-0000-4000-8000-000000000106', '43000000-0000-4000-8000-0000000000c3', current_setting('nestmate.responsive_b'), 'private-b3', now() - interval '1 hour');

DO $$
DECLARE
  response_count INTEGER;
  maximum_response_hours NUMERIC;
BEGIN
  WITH sequenced_messages AS (
    SELECT
      message."senderId",
      message."createdAt",
      lag(message."senderId") OVER (
        PARTITION BY message."conversationId"
        ORDER BY message."createdAt", message."id"
      ) AS previous_sender_id,
      lag(message."createdAt") OVER (
        PARTITION BY message."conversationId"
        ORDER BY message."createdAt", message."id"
      ) AS previous_message_at
    FROM public."Message" AS message
    JOIN public."Conversation" AS conversation
      ON conversation."id" = message."conversationId"
    WHERE message."createdAt" >= now() - interval '90 days'
      AND current_setting('nestmate.responsive_b') IN (
        conversation."participantOneId",
        conversation."participantTwoId"
      )
  )
  SELECT
    count(*),
    max(EXTRACT(EPOCH FROM ("createdAt" - previous_message_at)) / 3600)
  INTO response_count, maximum_response_hours
  FROM sequenced_messages
  WHERE "senderId" = current_setting('nestmate.responsive_b')
    AND previous_sender_id <> "senderId";

  IF response_count <> 3 OR maximum_response_hours <> 1 THEN
    RAISE EXCEPTION 'Response-delay aggregation returned unexpected evidence.';
  END IF;
END;
$$;

ROLLBACK;
