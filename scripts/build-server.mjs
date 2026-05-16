// custom server (server.ts) と grading worker (worker/server.ts) を esbuild で
// 単一の CJS ファイルに bundle する。本番では tsx を経由せず
// `node dist/server.js` / `node dist/worker.js` で直接起動できるようにする。
//
// npm の依存 (@prisma/client, @google/genai, ws など) はすべて external にし、
// ランタイム側の node_modules で解決する。Next.js (web) は standalone 出力側で
// trace された node_modules、worker は `pnpm prune --prod` で構築した本番依存を利用する。
//
// 一方 workspace packages (@sullivan/*) は **bundle に inline する**。
// pnpm workspace の symlink は本番 runner image では packages/ ディレクトリが
// 同梱されないため壊れる上、各 package の main / exports は `.ts` ソースを直接
// 指しており Node.js では実行できない。esbuild に TS を transpile させて
// bundle に焼き込むことで、runner stage が packages/ を持たなくても動作する。

import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const target = "node20";

const TARGETS = {
  web: {
    in: path.join(projectRoot, "server.ts"),
    out: path.join(projectRoot, "dist/server.js"),
  },
  worker: {
    in: path.join(projectRoot, "worker/server.ts"),
    out: path.join(projectRoot, "dist/worker.js"),
  },
};

// 引数なし → 全部ビルド、引数あり → 指定されたものだけビルド。
// Dockerfile (web) は `web` だけ、Dockerfile.worker は `worker` だけ指定することで
// 互いの bundle が runner image に紛れ込むのを防ぐ。
const requested = process.argv.slice(2);
const selected = requested.length === 0 ? Object.keys(TARGETS) : requested;
const unknown = selected.filter((key) => !(key in TARGETS));
if (unknown.length > 0) {
  console.error(
    `Unknown build target(s): ${unknown.join(", ")}. Valid: ${Object.keys(TARGETS).join(", ")}.`
  );
  process.exit(1);
}
const entries = selected.map((key) => TARGETS[key]);

// bare import のうち @sullivan/* 以外を external 扱いする esbuild plugin。
// @sullivan/* は workspace package の TS ソースを inline bundle に取り込む。
const markNpmExternalPlugin = {
  name: "mark-npm-external",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path === "@sullivan" || args.path.startsWith("@sullivan/")) {
        return null; // 通常解決して bundle に inline する
      }
      return { external: true };
    });
  },
};

await Promise.all(
  entries.map((entry) =>
    build({
      entryPoints: [entry.in],
      outfile: entry.out,
      bundle: true,
      platform: "node",
      target,
      format: "cjs",
      plugins: [markNpmExternalPlugin],
      sourcemap: "inline",
      legalComments: "none",
      logLevel: "info",
      // tsconfig.json の paths (`@/*` → `./src/*`) を esbuild に解決させる
      tsconfig: path.join(projectRoot, "tsconfig.json"),
    })
  )
);
