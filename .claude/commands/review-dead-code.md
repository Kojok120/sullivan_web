---
description: Sullivan のデッドコード・冗長実装・並走している新旧実装を洗い出す
argument-hint: "[path?]"
allowed-tools: Read, Glob, Grep, Bash(git diff:*), Bash(git log:*), Bash(git show:*)
---

Sullivan（Next.js 16 + Prisma + Supabase LMS）からデッドコード・冗長実装・置き換え後に残った旧実装を洗い出す。**指摘のみ。削除や Edit は絶対にしない。**

## スコープ

- 引数 `$1` が空: `src/`, `scripts/`, `prisma/` を中心にリポジトリ全体をスキャン
- 引数 `$1` がある: そのパス配下のみ対象

## 重要度区分

`CLAUDE.md` の `## レビュー方針` に揃える。

- **Critical**: 通常出さない（削除候補は性質上 Critical にならない）
- **Major**: 並走する新旧実装が両方インポートされていて、片方が明らかに置き換え済み／責務重複でバグ温床になっているもの
- **Minor**: 未使用 export、用済みの一回限りスクリプト、`@deprecated` のまま残ったコード
- **Trivial**: 出さない

## 判定の慎重さ

**未使用判定は false positive を出しやすい。** 以下を必ず行ってから「未使用」と断定する:

- `Grep` で対象シンボルがリポジトリ全体から import / 参照されていないことを確認
- 動的 import（`import(...)`、文字列連結）や、CLI / API ルートとしてファイル名で呼ばれるパターン（Next.js の `app/` 配下、`scripts/` の `package.json` 経由実行）を見落とさない
- `package.json` の `scripts` フィールド、`.github/workflows/*.yml`、`Dockerfile`、`*.sh` から呼ばれているか確認

確証が持てない場合は **Major にせず Minor で「削除候補（要確認）」として出す**。

## チェック項目

### 1. 並走している新旧実装

最近の `git log --oneline -50` を確認し、リネーム／統合系（"統一"、"廃止"、"refactor"、"unify"）コミットの周辺を重点的に見る。具体的な疑い候補:

- `src/lib/print-document.ts` / `src/lib/print-service.ts` / `src/lib/print-view.ts` の責務重複
- `src/lib/guidance-summary.ts` vs `src/lib/guidance-summary-job.ts`（同期パスと非同期ジョブパスのどちらが現役か）
- 直近の `feat: GeoGebra 廃止 → DSL ベース図版描画` 系コミットで残った GeoGebra 参照
- 直近の `refactor: ProblemContentFormat enum と Problem.contentFormat カラムを撤廃` 系で残った旧 enum 参照

### 2. マーカー検索

リポジトリ全体で次を grep:

- `// removed`, `// deprecated`, `@deprecated`
- `legacy`, `_old`, `LegacyXxx`, `OldXxx`
- `TODO: remove`, `FIXME: remove`, `// TEMP`

ヒットしたら、該当箇所が今でも import されているか確認し、import が無ければ Minor で削除候補として出す。

### 3. 未使用 export

`src/lib/` 直下の `*.ts` で、リポジトリ全体（`src/`, `scripts/`, テスト含む）から import されていないシンボルを抽出。
代表的な怪しいユーティリティ: `src/lib/proxy.ts`, `src/lib/metadata-utils.ts`, `src/lib/runtime-utils.ts` のような汎用名のもの。

### 4. テストだけが import している実装

`*.test.ts` / `__tests__/` 配下からのみ import されているシンボル。テストは生きていても本番コードから参照されていないなら、実装ごと不要の可能性。

### 5. 使い捨てスクリプト

`scripts/` 配下で `backfill-*`, `migrate-*`, `audit-*` 系は一度走らせたら役目が終わっている可能性が高い。

判定基準:
- `package.json` の `scripts` から呼ばれていない
- README / `.github/workflows/` / Dockerfile からも参照されていない
- ファイル冒頭コメントに「一度きりの移行」「historical」等の記述がある

該当すれば Minor で「削除候補（要確認）」として出す。`feat:` で最近追加された一時調査スクリプトは、Major にせず Minor 以下で問う。

### 6. CLAUDE.md の YAGNI 違反

- 使われていない props、オプション引数、未使用の `default` 値
- 「将来のため」とコメントされている拡張ポイントで実際に使われていないもの
- フィーチャーフラグで片方の分岐が常に通らないもの

## 対象外

- 未使用変数（`lint` / `tsc` で検出される）
- コメントの整理、フォーマッタ由来の差分
- 命名スタイル
- 自動削除・自動修正

## 出力フォーマット

カテゴリごとに見出しを立て、各項目を以下の体裁で出す:

```
- `path/to/file.ts:42` — <一行要約>
  根拠: <なぜ未使用／重複と判定したか。grep で 0 件、最終参照コミット、等>
  対処: <削除提案 / 要確認の理由 / 残すべき理由が見つかった場合の補足>
```

## 完了報告

末尾に必ず次を出す:

- カテゴリ別の件数（並走実装 / 未使用 export / 用済みスクリプト / マーカー / その他）
- 確証が高い削除候補の上位 1〜3 件（順序つき）
- false positive 判定で残したもの（参考用に件数のみ）
