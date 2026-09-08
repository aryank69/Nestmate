import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";
import { normalizeNotification } from "@/lib/notifications";
import { ensureUserProfile } from "@/lib/profile-data";
import { loadReminderData } from "@/lib/reminder-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/types/notification";

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/login?next=/notifications");
  }

  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });

  const { data: rows, error: notificationError } = await supabase
    .from("Notification")
    .select("id,type,title,body,href,resourceId,readAt,createdAt")
    .order("createdAt", { ascending: false })
    .limit(100);
  const reminderData = await loadReminderData(claims.sub, user.id);

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <section className="content-shell py-8 sm:py-12">
          <NotificationsPanel
            initialNotifications={((rows ?? []) as NotificationRow[]).map(
              normalizeNotification,
            )}
            initialError={
              notificationError
                ? "We could not load your notifications. Please try again."
                : ""
            }
            initialReminderCount={reminderData.activeCount}
          />
        </section>
      </main>
    </>
  );
}
