import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrationDatasourceUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

// db-schema パッケージ単独で prisma CLI を駆動できるよう、
// schema / migrations / seed のパスは本パッケージルートからの相対で記述する。
// `pnpm --filter @sullivan/db-schema exec prisma <cmd>` で cwd が
// packages/db-schema になり、prisma が本ファイルを自動検出する。
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Prisma 7 では generate 時に DB 接続情報が不要なため、URL未設定でも generate は通す。
  // migrate / db push を使うときだけ DIRECT_URL または DATABASE_URL が必須になる。
  ...(migrationDatasourceUrl
    ? {
        datasource: {
          url: migrationDatasourceUrl,
        },
      }
    : {}),
});
