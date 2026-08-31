import { LogOut, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/auth/actions";
import { Navbar } from "@/components/navbar";
import { ProfilePage } from "@/components/profile/profile-page";
import { Button } from "@/components/ui/button";
import { ensureUserProfile, loadUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function UserProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/login?next=/profile");
  }

  const email = typeof claims.email === "string" ? claims.email : "Your account";
  const metadata = claims.user_metadata;
  const authenticatedName =
    metadata && typeof metadata.full_name === "string"
      ? metadata.full_name
      : email.split("@")[0];
  await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name: authenticatedName,
  });
  const profile = await loadUserProfile(claims.sub);

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)]">
        <section className="content-shell py-8 sm:py-12 lg:py-16">
          <div className="mx-auto mb-5 flex max-w-5xl flex-col gap-3 rounded-2xl border border-secondary bg-secondary/45 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-secondary-foreground shadow-xs">
                <ShieldCheck aria-hidden="true" className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-secondary-foreground">
                  Signed in securely
                </p>
                <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                  {email}
                </p>
              </div>
            </div>
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="outline"
                className="w-full bg-card sm:w-auto"
              >
                <LogOut aria-hidden="true" className="size-4" />
                Log out
              </Button>
            </form>
          </div>

          <ProfilePage
            initialProfile={profile}
            accountEmail={email}
          />
        </section>
      </main>
    </>
  );
}
