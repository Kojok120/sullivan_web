// custom server (server.ts) を esbuild で単一の CJS ファイルに bundle する。
// 本番では tsx を経由せず `node dist/server.js` で直接起動できるようにする。
// node_modules の依存はすべて external にし、Next.js の standalone 出力側で
// 解決する想定。standalone trace に乗らない依存（ws / dotenv 等）は
// next.config.ts の outputFileTracingIncludes で別途同梱する。

import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const target = "node20";

await build({
  entryPoints: [path.join(projectRoot, "server.ts")],
  outfile: path.join(projectRoot, "dist/server.js"),
  bundle: true,
  platform: "node",
  target,
  format: "cjs",
  packages: "external",
  sourcemap: "inline",
  legalComments: "none",
  logLevel: "info",
});
