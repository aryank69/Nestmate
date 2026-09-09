CREATE TABLE nestmate_private.product_analytics_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."User"("id") ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_analytics_event_name_check CHECK (
    event_name IN (
      'SIGNUP_COMPLETED',
      'PROFILE_COMPLETED',
      'LOCALITY_SELECTED',
      'SEARCH_FILTERS_USED',
      'LISTING_VIEWED',
      'PROFILE_VIEWED',
      'LISTING_SAVED',
      'MESSAGE_STARTED',
      'VISIT_REQUESTED',
      'VISIT_COMPLETED',
      'MATCH_FINALIZED'
    )
  ),
  CONSTRAINT product_analytics_properties_object_check CHECK (
    jsonb_typeof(properties) = 'object'
    AND octet_length(properties::TEXT) <= 2048
  )
);

CREATE INDEX product_analytics_event_name_occurred_at_idx
  ON nestmate_private.product_analytics_event (event_name, occurred_at DESC);

CREATE INDEX product_analytics_user_event_occurred_at_idx
  ON nestmate_private.product_analytics_event (user_id, event_name, occurred_at DESC);

CREATE UNIQUE INDEX product_analytics_once_per_user_event_idx
  ON nestmate_private.product_analytics_event (user_id, event_name)
  WHERE event_name IN ('SIGNUP_COMPLETED', 'PROFILE_COMPLETED');

ALTER TABLE nestmate_private.product_analytics_event ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE nestmate_private.product_analytics_event
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE nestmate_private.product_analytics_event IS
  'Private, allowlisted product funnel events. Read through server-side aggregate queries only.';
