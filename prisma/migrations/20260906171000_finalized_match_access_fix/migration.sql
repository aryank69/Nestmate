-- The archive-aware wrapper delegates active matches to the original predicate.
-- Its private-schema execute grant is required under authenticated RLS evaluation.
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_active_finalized_document_space(UUID)
TO authenticated;
