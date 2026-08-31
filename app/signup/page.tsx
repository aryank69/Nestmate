import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getSafeNextPath } from "@/lib/auth";
import { getPublicAuthSettings } from "@/lib/supabase/auth-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SignupPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
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
      mode="signup"
      nextPath={nextPath}
      googleEnabled={authSettings.googleEnabled}
    />
  );
}
