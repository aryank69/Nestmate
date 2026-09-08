ALTER TYPE public."VisitRequestStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TABLE public."VisitRequest" ADD COLUMN "calendarRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("calendarRevision" >= 0);
ALTER TABLE public."VisitRequest" DROP CONSTRAINT "VisitRequest_status_details_check";
ALTER TABLE public."VisitRequest" ADD CONSTRAINT "VisitRequest_status_details_check" CHECK (
 ("status"::text = 'PENDING' AND "proposedAt" IS NULL AND "scheduledAt" IS NULL AND "respondedAt" IS NULL)
 OR ("status"::text = 'PROPOSED' AND "proposedAt" IS NOT NULL AND "scheduledAt" IS NULL AND "respondedAt" IS NOT NULL)
 OR ("status"::text IN ('ACCEPTED','CANCELLED') AND "scheduledAt" IS NOT NULL AND "respondedAt" IS NOT NULL)
 OR ("status"::text = 'DECLINED' AND "scheduledAt" IS NULL AND "respondedAt" IS NOT NULL)
);

CREATE TABLE public."VisitChange" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "visitId" UUID NOT NULL REFERENCES public."VisitRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "revision" INTEGER NOT NULL,
 "actorRole" VARCHAR(16) NOT NULL CHECK ("actorRole" IN ('OWNER','REQUESTER')),
 "previousStatus" VARCHAR(16) NOT NULL,
 "status" VARCHAR(16) NOT NULL,
 "previousTime" TIMESTAMPTZ(3),
 "scheduledAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "VisitChange_visitId_revision_key" ON public."VisitChange"("visitId","revision");
ALTER TABLE public."VisitChange" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."VisitChange" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public."VisitChange" TO authenticated;
CREATE POLICY "Participants can read visit changes" ON public."VisitChange" FOR SELECT TO authenticated
 USING ((SELECT nestmate_private.can_access_visit_request("visitId")));

-- Keep the existing pending/proposed transition validator intact.
DROP TRIGGER "validate_visit_request_before_update" ON public."VisitRequest";
CREATE TRIGGER "validate_visit_request_before_update"
 BEFORE UPDATE ON public."VisitRequest" FOR EACH ROW
 WHEN (OLD."status"::text <> 'ACCEPTED')
 EXECUTE FUNCTION nestmate_private.validate_visit_request_update();

CREATE FUNCTION nestmate_private.validate_accepted_visit_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
 IF caller IS NULL OR caller NOT IN (OLD."ownerId", OLD."requesterId")
 OR NOT nestmate_private.can_access_visit_request(OLD."id") THEN
   RAISE EXCEPTION 'This visit is unavailable.' USING ERRCODE='42501';
 END IF;
 IF OLD."scheduledAt" <= CURRENT_TIMESTAMP THEN
   RAISE EXCEPTION 'Completed visits cannot be changed.' USING ERRCODE='22023';
 END IF;
 IF NEW."id" IS DISTINCT FROM OLD."id"
 OR NEW."postId" IS DISTINCT FROM OLD."postId"
 OR NEW."requesterId" IS DISTINCT FROM OLD."requesterId"
 OR NEW."ownerId" IS DISTINCT FROM OLD."ownerId"
 OR NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt"
 OR NEW."proposedAt" IS DISTINCT FROM OLD."proposedAt"
 OR NEW."note" IS DISTINCT FROM OLD."note"
 OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
   RAISE EXCEPTION 'Original visit details cannot be changed.' USING ERRCODE='42501';
 END IF;
 IF NEW."status"::text = 'CANCELLED' THEN
   NEW."scheduledAt" := OLD."scheduledAt";
 ELSIF NEW."status"::text = 'ACCEPTED' THEN
   IF NEW."scheduledAt" IS NULL OR NEW."scheduledAt" = OLD."scheduledAt"
   OR NEW."scheduledAt" < CURRENT_TIMESTAMP + interval '30 minutes'
   OR NEW."scheduledAt" > CURRENT_TIMESTAMP + interval '180 days' THEN
     RAISE EXCEPTION 'Choose a different future time within 180 days.' USING ERRCODE='22023';
   END IF;
   IF NOT EXISTS (SELECT 1 FROM public."Post" p WHERE p."id" = OLD."postId"
     AND p."status"::text = 'ACTIVE' AND p."moderationStatus"::text = 'VISIBLE'
     AND p."availabilityStatus"::text IN ('AVAILABLE','RESERVED') AND p."publishedAt" IS NOT NULL)
   OR EXISTS (SELECT 1 FROM public."UserModerationState" s
     WHERE s."userId" IN (OLD."ownerId", OLD."requesterId") AND s."status"::text = 'SUSPENDED') THEN
     RAISE EXCEPTION 'This listing is unavailable for rescheduling.' USING ERRCODE='42501';
   END IF;
 ELSE
   RAISE EXCEPTION 'Accepted visits can only be rescheduled or cancelled.' USING ERRCODE='42501';
 END IF;
 NEW."respondedAt" := CURRENT_TIMESTAMP;
 NEW."updatedAt" := CURRENT_TIMESTAMP;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION nestmate_private.validate_accepted_visit_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "validate_accepted_visit_before_update"
 BEFORE UPDATE ON public."VisitRequest" FOR EACH ROW WHEN (OLD."status"::text = 'ACCEPTED')
 EXECUTE FUNCTION nestmate_private.validate_accepted_visit_change();

CREATE FUNCTION nestmate_private.set_visit_revision() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN NEW."calendarRevision" := 0;
 ELSE
   IF NEW."id" IS DISTINCT FROM OLD."id" THEN
     RAISE EXCEPTION 'Visit identity cannot be changed.' USING ERRCODE='42501';
   END IF;
   NEW."calendarRevision" := OLD."calendarRevision" + 1;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION nestmate_private.set_visit_revision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "zz_visit_revision" BEFORE INSERT OR UPDATE ON public."VisitRequest"
 FOR EACH ROW EXECUTE FUNCTION nestmate_private.set_visit_revision();

-- Existing notifications still handle the original request/accept/propose flow.
DROP TRIGGER "notify_after_visit_request_change" ON public."VisitRequest";
CREATE TRIGGER "notify_after_visit_request_insert" AFTER INSERT ON public."VisitRequest"
 FOR EACH ROW EXECUTE FUNCTION nestmate_private.notify_visit_request();
CREATE TRIGGER "notify_after_visit_request_update" AFTER UPDATE ON public."VisitRequest"
 FOR EACH ROW WHEN (OLD."status"::text <> 'ACCEPTED')
 EXECUTE FUNCTION nestmate_private.notify_visit_request();

CREATE FUNCTION nestmate_private.record_visit_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
 IF caller IS NULL OR caller NOT IN (NEW."ownerId", NEW."requesterId")
 OR NOT nestmate_private.can_access_visit_request(NEW."id") THEN
   RAISE EXCEPTION 'Visit participant required.' USING ERRCODE='42501';
 END IF;
 INSERT INTO public."VisitChange" ("visitId","revision","actorRole","previousStatus","status","previousTime","scheduledAt")
 VALUES (NEW."id",NEW."calendarRevision",CASE WHEN caller = NEW."ownerId" THEN 'OWNER' ELSE 'REQUESTER' END,
 OLD."status"::text, NEW."status"::text, OLD."scheduledAt", NEW."scheduledAt");
 IF OLD."status"::text = 'ACCEPTED' THEN
   INSERT INTO public."Notification" ("recipientId","actorId","type","title","body","href","resourceId")
   SELECT recipient, caller, 'POST_ACTIVITY'::public."NotificationType",
     CASE WHEN NEW."status"::text = 'CANCELLED' THEN 'Property visit cancelled' ELSE 'Property visit rescheduled' END,
     'Open your visit to review the change and download the latest calendar event.',
     '/visits?visit=' || NEW."id"::text,
     'visit-change:' || NEW."id"::text || ':' || NEW."calendarRevision"::text
   FROM unnest(ARRAY[NEW."ownerId",NEW."requesterId"]) AS recipient;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION nestmate_private.record_visit_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "record_visit_after_update" AFTER UPDATE ON public."VisitRequest"
 FOR EACH ROW EXECUTE FUNCTION nestmate_private.record_visit_change();
