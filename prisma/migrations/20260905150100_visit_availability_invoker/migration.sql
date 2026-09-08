-- The replacement remains atomic but now executes with the authenticated
-- caller's table privileges and RLS policies instead of elevated privileges.
ALTER FUNCTION public.replace_visit_availability(JSONB) SECURITY INVOKER;
