# 初回CoreProblem状態バックフィル手順

最初のCoreProblemを無条件アンロック仕様に合わせるため、既存生徒の `UserCoreProblemState` を補完する手順です。

## 1. 事前確認（DRY-RUN）

```bash
npx tsx scripts/backfill-initial-core-problem-states.ts --dry-run
```

確認ポイント:

- 対象生徒数
- 教科ごとの初回CoreProblem数
- 不足状態ありの生徒数
- 補完対象のサンプル（先頭20件）

## 2. 本実行

```bash
npx tsx scripts/backfill-initial-core-problem-states.ts
```

実行結果として、各生徒ごとの `created` 件数と総作成件数が表示されます。

## 3. 実行後確認

以下を確認してください。

- 新規生徒で初回単元がロック表示されない
- 印刷時に白紙にならない
- `UserCoreProblemState` に各教科の初回単元が作成されている

## 補足

- 本スクリプトは `createMany + skipDuplicates` を使うため再実行可能です。
- 既存レコードは上書きしません。
