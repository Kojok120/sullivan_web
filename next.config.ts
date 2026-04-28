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
    `[build-env] .env.build size=${buildEnvRaw.length} keys=${Object.keys(parsedBuildEnv).length
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
  serverExternalPackages: ['googleapis', '@google/genai'],
  // CI では別ステップで tsc --noEmit を実行済みのため、ビルド中の重複チェックをスキップ
  // これによりビルド時のメモリ使用量と所要時間を大幅に削減できる
  // ⚠️ ローカルの npm run build では型エラーが検出されない
  //    ローカルで型チェックする場合: npm run type-check
  // 参照: .github/workflows/ci.yml の「TypeScript 型チェック」ステップ
  typescript: {
    ignoreBuildErrors: true,
  },
  // SECURITY: Add recommended security headers
  headers: async () => [
    {
      // 印刷プレビューは同一オリジン iframe で表示するため、ここだけは埋め込みを許可する。
      source: '/api/print/pdf',
      headers: [
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
      ],
    },
    {
      // それ以外のルートは従来どおり埋め込みを拒否する。
      source: '/((?!api/print/pdf).*)',
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
