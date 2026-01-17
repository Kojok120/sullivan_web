import fs from "fs";
import path from "path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

const buildEnvPath = path.resolve(process.cwd(), ".env.build");
if (process.env.NODE_ENV === "production" && fs.existsSync(buildEnvPath)) {
  loadEnv({ path: buildEnvPath });
}

const nextConfig: NextConfig = {
  output: 'standalone',
  // SECURITY: Add recommended security headers
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
      ],
    },
  ],
};

export default nextConfig;
