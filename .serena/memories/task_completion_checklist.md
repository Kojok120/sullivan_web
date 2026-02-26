# タスク完了時チェック
- 変更内容に応じて `npm run lint` を実行。
- 変更内容に応じて `npm run type-check` を実行。
- 機能変更時は `npm run test`（必要なら `npm run test:e2e`）を実行。
- DBスキーマ更新時は Prisma 関連コマンドを実行し、差分を確認。
- ドキュメント変更時は README / docs の整合性を確認。