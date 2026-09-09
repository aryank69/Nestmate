DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'nestmate_private'
      AND tablename = 'product_analytics_event'
      AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'Analytics table is missing or row security is disabled.';
  END IF;

  IF has_table_privilege(
      'anon',
      'nestmate_private.product_analytics_event',
      'SELECT'
    )
    OR has_table_privilege(
      'authenticated',
      'nestmate_private.product_analytics_event',
      'SELECT'
    )
    OR has_table_privilege(
      'service_role',
      'nestmate_private.product_analytics_event',
      'SELECT'
    )
  THEN
    RAISE EXCEPTION 'Analytics table is unexpectedly readable by an API role.';
  END IF;
END
$$;
