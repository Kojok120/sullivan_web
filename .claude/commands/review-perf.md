---
description: Sullivan 固有のパフォーマンス観点でリポジトリをレビューする
argument-hint: "[path?]"
allowed-tools: Read, Glob, Grep, Bash(git diff:*), Bash(git log:*), Bash(npm run lint:*), Bash(npm run type-check:*)
---

Sullivan（Next.js 16 + Prisma + Supabase LMS）のパフォーマンス観点でリポジトリをレビューする。**指摘のみ。コード修正はしない。**

## スコープ

- 引数 `$1` が空: `src/app/`, `src/lib/`, `src/components/` を中心にリポジトリ全体をスキャン
- 引数 `$1` がある: そのパス配下のみ対象

## 重要度区分

`CLAUDE.md` の `## レビュー方針` に揃える。

- **Critical**: 本番でユーザー影響が出る性能劣化（タイムアウト、OOM、N+1 で線形劣化）
- **Major**: 明確な無駄な往復・全件取得・非同期直列、`"use client"` の過剰拡張
- **Minor**: 改善余地はあるが体感影響が小さい
- **Trivial**: 出さない

## チェック項目

`CLAUDE.md` の `## 公式ベストプラクティス`（React / Prisma）と `## Sullivan での具体的判断基準` を前提に、以下を確認する。

### 1. Prisma クエリ

- `findMany` / `findFirst` / `findUnique` で `select` / `include` の理由が説明できるか（`CLAUDE.md` の Prisma 規約）
- `include` がリレーションを深くたどっていて N+1 を避けるためなのか、惰性で広げているのか
- ループ内で `findUnique` / `findFirst` を呼んでいないか（典型的 N+1）
- 一覧画面で `take` / `skip` 無しの全件取得をしていないか
  - 重点: `src/app/dashboard/`, `src/app/admin/`, `src/app/teacher/students/`
  - 参考: 既に pagination を実装している例があれば再利用提案

### 2. 重い処理

- `src/lib/print-pdf/` の Puppeteer インスタンスのライフサイクル（毎回起動 vs 共有）
- `src/lib/grading-service.ts`、`src/lib/guidance-summary-job.ts` の Gemini API 呼び出しにタイムアウト・リトライ・並列上限が設定されているか
- `src/lib/realtime-events.ts` の Supabase Realtime 購読の解除漏れ（`useEffect` の cleanup 関数）

### 3. `"use client"` 境界

- 親ツリーが丸ごと Client 化されていないか（Server Component で済むのに Client 化していないか）
- 派生値が state にミラーされていないか（`React: You Might Not Need an Effect` 違反）
- props を state に複製して同期 `useEffect` を貼っていないか

### 4. キャッシュ・再検証

- Server Action 後の `revalidatePath` / `revalidateTag` が
  - 過剰でないか（不要に広い範囲を invalidate）
  - 不足でないか（更新したのに UI が古いまま）
- `cache()` / `unstable_cache` の利用が一貫しているか

### 5. シーケンシャル待ち

- 独立した `await` が直列に並んでいて `Promise.all` 化できる箇所
- ただし「片方の失敗が他方の正常完了を意味のない状態にする」場合は直列のままが正解 — 単純に並列化を勧めない

### 6. 静的解析

- 引数なしで実行している場合、最後に `npm run lint` と `npm run type-check` を読み取り専用で走らせて、性能に影響しそうな警告（unused imports、`react-hooks/exhaustive-deps`、未到達コードなど）を拾う
- 重大なエラーが多数出る場合は最初の 5 件だけ要約して残りは件数のみ報告

## 対象外

- マイクロベンチ、ビルドサイズ最適化、Web Vitals 計測（Lighthouse 別運用）
- インフラ層（Cloud Run のスペック、PostgreSQL のインデックス設計は別途）
- 命名・コメント

## 出力フォーマット

重要度ごとに見出しを立て、各項目を以下の体裁で出す:

```
- `path/to/file.ts:42` — <一行要約>
  抜粋: `<該当コード短い抜粋>`
  影響: <なぜ性能問題か 1〜2 行>
  対処: <推奨アクション 1〜2 行>
```

## 完了報告

末尾に必ず次を出す:

- 重要度別の件数（Critical / Major / Minor）
- 最初に着手すべき 1〜3 件（順序つき）
- `lint` / `type-check` の結果サマリ（実行した場合）
