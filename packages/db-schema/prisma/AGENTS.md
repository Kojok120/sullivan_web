# Prisma / データベース エージェント指示

## スキーマ構造

Sullivan の DB は PostgreSQL で、Prisma ORM を使用。主要なエンティティ:

- **Subject → CoreProblem → Problem**: 教材の3階層構造
- **User**: ロール（STUDENT, TEACHER, HEAD_TEACHER, PARENT, ADMIN）で権限分離
- **LearningHistory**: 評価(A-D)とフィードバックを含む回答ログ
- **UserProblemState / UserCoreProblemState**: 個人の進捗管理
- **GradingJob**: 採点ジョブの状態管理

## 規約

### マイグレーション
- 開発環境: `pnpm run db:migrate:dev` （内部で `prisma migrate dev` を実行 / リネームしたい時は `pnpm --filter @sullivan/db-schema exec prisma migrate dev --name <変更名>`）
- 本番環境: `pnpm run db:migrate:deploy`（新しいマイグレーションは作らない）
- クライアント再生成: `pnpm run db:generate`

Prisma CLI は **`@sullivan/db-schema` パッケージ経由** で呼ぶ。root に `prisma.config.ts` は無いため、root から `pnpm exec prisma` で呼ぶと schema を見つけられない。

### スキーマ変更時の注意
- 既存データに影響するカラム追加には必ずデフォルト値を設定する
- `@unique` / `@@unique` 制約の追加は既存データの重複チェックが必要
- `onDelete: Cascade` の設定は関連データへの影響を慎重に確認
- インデックスは頻繁にクエリされるフィールドに設定（`@@index`）

### クエリのベストプラクティス
- N+1 問題を避けるため、必要な `include` / `select` を明示する
- 大量データの取得には `findMany` + `take` / `skip` でページネーション
- トランザクションが必要な場合は `prisma.$transaction()` を使用
- `prisma.ts` でシングルトンクライアントをインポートする: `import { prisma } from '@/lib/prisma'`

### seed ファイル
- `seed.ts`: 初期マスタデータ（Subject, CoreProblem, Problem）の投入
- `seed-gamification.ts`: 実績（Achievement）データの投入
- 実行: `pnpm --filter @sullivan/db-schema exec prisma db seed`
