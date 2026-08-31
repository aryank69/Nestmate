type SupabaseAuthSettingsResponse = {
  disable_signup?: boolean;
  external?: {
    email?: boolean;
    google?: boolean;
  };
  mailer_autoconfirm?: boolean;
};

export type PublicAuthSettings = {
  emailEnabled: boolean;
  emailConfirmationRequired: boolean;
  googleEnabled: boolean;
};

const safeDefaults: PublicAuthSettings = {
  emailEnabled: true,
  emailConfirmationRequired: true,
  googleEnabled: false,
};

export async function getPublicAuthSettings(): Promise<PublicAuthSettings> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return safeDefaults;
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: {
        Accept: "application/json",
        apikey: publishableKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Supabase Auth settings returned ${response.status}.`);
    }

    const settings = (await response.json()) as SupabaseAuthSettingsResponse;

    return {
      emailEnabled:
        settings.disable_signup !== true && settings.external?.email === true,
      emailConfirmationRequired: settings.mailer_autoconfirm !== true,
      googleEnabled: settings.external?.google === true,
    };
  } catch (error) {
    console.error("[auth:settings] Unable to read public Auth settings", error);
    return safeDefaults;
  }
}
