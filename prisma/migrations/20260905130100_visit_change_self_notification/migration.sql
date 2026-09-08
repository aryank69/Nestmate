-- The actor receives a system confirmation; existing notifications prohibit self actors.
DO $migration$
DECLARE definition TEXT;
BEGIN
 SELECT pg_get_functiondef('nestmate_private.record_visit_change()'::regprocedure) INTO definition;
 IF position('SELECT recipient, caller,' IN definition) = 0 THEN
   RAISE EXCEPTION 'Unexpected visit notification function definition';
 END IF;
 EXECUTE replace(definition, 'SELECT recipient, caller,', 'SELECT recipient, CASE WHEN recipient = caller THEN NULL ELSE caller END,');
END;
$migration$;
