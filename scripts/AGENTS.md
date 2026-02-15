# scripts/ エージェント指示

## 概要

このディレクトリには管理・メンテナンス・デバッグ用のワンオフスクリプトが格納されています。

## 実行方法

```bash
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/<スクリプト名>.ts
```

## 新規スクリプト作成時の規約

1. **Prisma クライアント**のインポート:
   ```typescript
   import { PrismaClient } from '@prisma/client'
   const prisma = new PrismaClient()
   ```

2. **環境変数**の読み込み:
   ```typescript
   import dotenv from 'dotenv'
   dotenv.config({ path: '.env.local' })
   ```

3. **後処理**を必ず実装:
   ```typescript
   async function main() {
     // メイン処理
   }
   main()
     .catch(console.error)
     .finally(() => prisma.$disconnect())
   ```

4. **破壊的操作**（delete, update）には必ず確認プロンプトまたはドライランモードを含める

5. **ファイル命名**: 用途がわかる名前を付ける（例: `check-*`, `debug-*`, `cleanup-*`, `migrate-*`）

## 主要なスクリプトカテゴリ

| プレフィックス | 用途 | 例 |
|--|--|--|
| `check-*` | データ確認・検証 | `check-db.ts`, `check_E1000.ts` |
| `debug-*` | デバッグ用 | `debug-history.ts`, `debug-env.ts` |
| `cleanup-*` | データ整理・削除 | `cleanup-subjects.ts` |
| `migrate-*` | データマイグレーション | `migrate-roles.ts` |
| `verify-*` | 検証 | `verify-prod.ts` |
| `inspect-*` | データ閲覧 | `inspect_problems.ts` |
| `deploy-*` | デプロイ関連 | `deploy-db-production.sh` |
