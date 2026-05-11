# scripts/_archive

役目を終えたワンショットスクリプト・完了済み移行スクリプト・使い捨ての診断スクリプトの退避先。

**ここに置かれているファイルは過去に一度実行されて本番反映済みであり、再実行は基本的に不要。** 履歴用に残しているだけで、定期運用や CI から呼ばれることは無い。新規開発時に流用しないこと（前提となるスキーマや業務フローが既に変わっている可能性が高い）。

それでも残している理由:

- 過去にどんなデータ移行を行ったかの記録
- 同種の作業をするときの実装パターンの参考
- Git 履歴より読みやすい

完全に不要と判断できた段階で削除して構わない。

## 一覧

### 完了済みデータ移行

- `migrate-archived-problems-to-draft.ts` — `ProblemStatus.ARCHIVED` enum 廃止前の退避
- `cleanup-geogebra-artifacts.ts` — GeoGebra 連携廃止に伴う物理削除
- `strip-structured-content-title.ts` — 旧スキーマ `structuredContent.title` 残骸の除去
- `cleanup-duplicate-accepted-answers.ts` — `acceptedAnswers` の正解重複削除
- `backfill-problem-revisions.ts` — 編集画面表示用 `ProblemRevision` の初期化
- `backfill-role-classroom.ts` — デモ教室の初期データ投入

### 完了済み一回限り操作

- `apply-structured-content.ts` — 単発の `structuredContent` 上書き
- `correct-english-answers-format.ts` — `--limit 100` 試走で誤生成された英語解答の一回限り是正
- `apply-english-answers.ts` — レビュー済み JSON を `Problem.answer` に反映する一回限り操作
- `strip-prefecture-tags.ts` — 英語問題末尾の「【〇〇県】」タグを除去する一回限りデータ修正

### 完了済み調査・triage

- `audit-legacy-figure-content.ts` — PR #150 の DSL 図形マイグレ可視化
- `dump-figure-hint-content.ts` — 上記 audit の二次出力（個別レビュー用）
- `dump-triage-bcd-csv.ts` — 上記 audit の triage 結果 CSV 化
- `inspect-english-problems.ts` — 「使い捨ての診断スクリプト」と自己申告
- `inspect-prefecture-tags.ts` — 英語問題末尾「【〇〇県】」タグの件数・分布調査
