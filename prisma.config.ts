import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrationDatasourceUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
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
