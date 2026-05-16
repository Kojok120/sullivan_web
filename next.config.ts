import fs from "fs";
import path from "path";
import { parse as parseEnv } from "dotenv";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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
  // Cloud Run 用 Docker image を痩せさせるため standalone 出力を使う。
  // .next/standalone/node_modules には自動 trace で必要な依存だけが入る。
  output: 'standalone',
  // ローカルで親ディレクトリ群（兄弟プロジェクト含む）を monorepo と誤検知して
  // .next/standalone/<親>/<repo>/ という階層が掘られる問題を防ぐため、
  // trace root をリポジトリ直下に固定する。
  outputFileTracingRoot: path.resolve(__dirname),
  // server.ts (custom server) からしか辿れない依存は src/app からの自動 trace に
  // 引っかからないため、明示的に standalone へ同梱する。
  // - ws / dotenv: server.ts 起動時に直接使用
  // - next: custom server から `import next from 'next'` で動的に読まれる
  //   サブモジュール（dist/compiled/webpack/* 等）が `next start` 経路では trace
  //   されず欠落するため、パッケージ丸ごと含めて取りこぼしを防ぐ
  outputFileTracingIncludes: {
    '/': [
      './node_modules/ws/**/*',
      './node_modules/dotenv/**/*',
      './node_modules/next/**/*',
    ],
  },
  serverExternalPackages: ['googleapis', '@google/genai'],
  // CI では別ステップで tsc --noEmit を実行済みのため、ビルド中の重複チェックをスキップ
  // これによりビルド時のメモリ使用量と所要時間を大幅に削減できる
  // ⚠️ ローカルの npm run build では型エラーが検出されない
  //    ローカルで型チェックする場合: npm run type-check
  // 参照: .github/workflows/ci.yml の「TypeScript 型チェック」ステップ
  // TODO(perf-review-2026-08): ビルド時間とメモリ使用量を再計測し、許容範囲なら
  //   ignoreBuildErrors を false に戻す。ローカルで型エラーが見えない状態が
  //   退行検知の網を破っているため、Phase 2 の見直しタイミングで判断する。
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
      // 現在 /api/admin/problems 配下はプレビュー系のみのため、
      // 配下全体で同一オリジン iframe を許可する。
      source: '/api/admin/problems/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
      ],
    },
    {
      // それ以外のルートは従来どおり埋め込みを拒否する。
      source: '/((?!api/print/pdf|api/admin/problems).*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
      ],
    },
  ],
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
