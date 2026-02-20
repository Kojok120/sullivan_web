import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrationDatasourceUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: migrationDatasourceUrl
    ? {
        url: migrationDatasourceUrl,
      }
    : undefined,
});
