// @sullivan/db-schema は Prisma スキーマとマイグレーションのホームパッケージ。
// 実行時の Prisma クライアントは `@prisma/client` を直接 import する。
// このパッケージは型のみ再エクスポートし、スキーマ生成物の所在を明示する。
export type { PrismaClient } from '@prisma/client';
