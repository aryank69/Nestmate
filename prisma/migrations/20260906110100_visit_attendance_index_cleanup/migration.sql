-- The unique (visitId, userId) index already covers the two-row per-visit lookup.
DROP INDEX public."VisitAttendance_visitId_confirmation_idx";
