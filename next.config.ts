import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/Node-only modules — keep them server-side only
  serverExternalPackages: ["better-sqlite3", "node-ical"],
};

export default nextConfig;
