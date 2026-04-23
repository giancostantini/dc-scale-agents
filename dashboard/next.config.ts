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
};

export default nextConfig;
