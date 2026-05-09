// custom server (server.ts) と grading worker (worker/server.ts) を esbuild で
// 単一の CJS ファイルに bundle する。本番では tsx を経由せず
// `node dist/server.js` / `node dist/worker.js` で直接起動できるようにする。
// node_modules の依存はすべて external にし、ランタイム側の node_modules で解決する。
// Next.js (web) の場合は standalone 出力側で trace された node_modules、
// worker の場合は `npm ci --omit=dev` で構築した本番依存を利用する。

import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const target = "node20";

const entries = [
  {
    in: path.join(projectRoot, "server.ts"),
    out: path.join(projectRoot, "dist/server.js"),
  },
  {
    in: path.join(projectRoot, "worker/server.ts"),
    out: path.join(projectRoot, "dist/worker.js"),
  },
];

await Promise.all(
  entries.map((entry) =>
    build({
      entryPoints: [entry.in],
      outfile: entry.out,
      bundle: true,
      platform: "node",
      target,
      format: "cjs",
      packages: "external",
      sourcemap: "inline",
      legalComments: "none",
      logLevel: "info",
      // tsconfig.json の paths (`@/*` → `./src/*`) を esbuild に解決させる
      tsconfig: path.join(projectRoot, "tsconfig.json"),
    })
  )
);
