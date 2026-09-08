CREATE FUNCTION nestmate_private.prevent_check_in_after_attendance_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW."checkedInAt" IS NOT NULL
    AND (TG_OP = 'INSERT' OR OLD."checkedInAt" IS NULL)
    AND (
      NEW."confirmation" IS NOT NULL
      OR (TG_OP = 'UPDATE' AND OLD."confirmation" IS NOT NULL)
    ) THEN
    RAISE EXCEPTION 'Arrival check-in cannot be added after final attendance confirmation.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.prevent_check_in_after_attendance_confirmation()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "prevent_finalized_attendance_check_in"
BEFORE INSERT OR UPDATE OF "checkedInAt" ON public."VisitAttendance"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.prevent_check_in_after_attendance_confirmation();
