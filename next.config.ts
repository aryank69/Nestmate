import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl) : null;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: supabaseOrigin
      ? [
          {
            protocol: supabaseOrigin.protocol === "http:" ? "http" : "https",
            hostname: supabaseOrigin.hostname,
            port: supabaseOrigin.port,
            pathname: "/storage/v1/object/sign/listing-images/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
