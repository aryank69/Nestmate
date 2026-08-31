import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getSafeNextPath } from "@/lib/auth";
import { getPublicAuthSettings } from "@/lib/supabase/auth-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = getSafeNextPath(params.next);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    redirect(nextPath);
  }

  const authSettings = await getPublicAuthSettings();

  return (
    <AuthForm
      mode="login"
      nextPath={nextPath}
      error={params.error}
      notice={params.message}
      googleEnabled={authSettings.googleEnabled}
    />
  );
}
