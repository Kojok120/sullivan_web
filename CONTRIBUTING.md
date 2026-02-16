# コントリビューションガイド

Sullivan プロジェクトへの開発参加方法と注意事項をまとめています。

## 開発フロー

1. `dev` ブランチから feature ブランチを作成
2. ローカルで開発・テスト
3. PR を作成して `dev` ブランチへマージ
4. `dev` → `main` のマージで本番デプロイが自動実行

## ローカル開発の注意事項

### ⚠️ `npm run build` では TypeScript エラーが検出されません

ビルド時間短縮のため `next.config.ts` で `ignoreBuildErrors: true` を設定しています。
TypeScript の型チェックは CI で `tsc --noEmit` として別途実行されるため、本番環境の安全性は保証されています。

**ローカルで型チェックを実行するには：**

```bash
npm run type-check
```

### PR 前チェックリスト

PR を作成する前に、以下のコマンドをローカルで実行してください：

```bash
# TypeScript 型チェック
npm run type-check

# ユニットテスト
npm test

# ESLint
npx eslint src/
```

## CI/CD パイプライン

| ワークフロー | トリガー | 内容 |
|-------------|---------|------|
| CI | `main`, `dev` への push/PR | Lint, 型チェック, テスト, ビルド |
| Deploy DEV | `dev` push | DEV 環境へ自動デプロイ |
| Deploy PRODUCTION | `main` push | 本番環境へ自動デプロイ |

> **重要**: `main` ブランチへの push は即座に本番デプロイをトリガーします。
> 必ず PR を経由し、CI が通過してからマージしてください。
