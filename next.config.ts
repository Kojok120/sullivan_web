import fs from "fs";
import path from "path";
import { parse as parseEnv } from "dotenv";
import type { NextConfig } from "next";

const buildEnvPath = path.resolve(process.cwd(), ".env.build");
const hasBuildEnv = fs.existsSync(buildEnvPath);
console.log(`[build-env] .env.build ${hasBuildEnv ? "found" : "missing"}`);
if (hasBuildEnv) {
  const buildEnvRaw = fs.readFileSync(buildEnvPath, "utf8");
  const parsedBuildEnv = parseEnv(buildEnvRaw);
  const buildKeyLengths = {
    NEXT_PUBLIC_SUPABASE_URL: parsedBuildEnv.NEXT_PUBLIC_SUPABASE_URL?.length ?? 0,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: parsedBuildEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length ?? 0,
  };
  console.log(
    `[build-env] .env.build size=${buildEnvRaw.length} keys=${
      Object.keys(parsedBuildEnv).length
    }`
  );
  console.log(
    `[build-env] .env.build key-lengths ${JSON.stringify(buildKeyLengths)}`
  );

  const appliedKeys: string[] = [];
  for (const [key, value] of Object.entries(parsedBuildEnv)) {
    if (!value) continue;
    const current = process.env[key];
    if (!current || current.length === 0) {
      process.env[key] = value;
      appliedKeys.push(key);
    }
  }
  console.log(`[build-env] applied ${appliedKeys.length} keys`);
}
console.log(
  `[build-env] env ${JSON.stringify({
    NODE_ENV: process.env.NODE_ENV ?? "undefined",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? "set"
      : "missing",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? "set"
      : "missing",
  })}`
);

const nextConfig: NextConfig = {
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
