import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // The agent scripts live outside the dashboard/ directory (in /scripts).
  // Lift the tracing root to the repo so Vercel includes them when bundling
  // the /api/agents/run route for in-process execution.
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
  outputFileTracingIncludes: {
    "/api/agents/run": ["../scripts/**/*"],
  },
  // Headers de seguridad (no rompen funcionalidad). CSP se deja fuera a
  // propósito: requiere testeo cuidadoso para no romper inline styles /
  // Supabase / embeds (Looker). Se evalúa aparte.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
