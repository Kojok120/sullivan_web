# 問題出力ロジック（プリント生成 + スキャン採点）

本ドキュメントは、講師が生徒のプリントを作成し、スキャン採点まで回す際の「問題選出〜印刷表示〜採点更新」までの出力ロジックを、現行実装に基づいてまとめたものです。

## 1. 対象範囲
- 対象: 講師画面からのプリント作成フロー（問題の選出、印刷レイアウト生成、QR埋め込み）
- 対象: Google Drive 取り込み〜Gemini 採点〜状態更新〜通知までの採点フロー
- 非対象: Drive Watch 作成/更新などの運用手順やインフラ構築詳細

## 2. 全体フロー（プリント出力とスキャン採点）
### 2.1 プリント出力
1. 講師画面で生徒と科目を選択し、`/teacher/students/[userId]/print?subjectId=...` に遷移（`src/app/teacher/students/[userId]/print-problem-card.tsx`）。
2. `PrintPage` でセッションを検証し、以下を取得（`src/app/teacher/students/[userId]/print/page.tsx`）。
   - 生徒情報（氏名 / loginId）
   - 科目情報
   - 出力対象の問題一覧（`selectProblemsForPrint`）
3. 取得した問題IDを元にQRコードを生成し、`PrintLayout` に渡す。
4. `PrintLayout` が問題一覧をページ分割し、印刷用の問題ページ + 解答用紙ページを出力する（`window.print()`）。

### 2.2 スキャン/採点
1. Drive Webhook（`/api/grading/webhook`）または内部チェック（**Workerサービスの** `/api/grading/check`）で `checkDriveForNewFiles` を起動。
2. `checkDriveForNewFiles` が対象ファイルを抽出し、Cloud Tasks 経由で採点ジョブを実行。
3. `processFile` がファイルをダウンロードし、QR解析 + Gemini採点を実施。
4. 採点結果を保存し、優先度/アンロックを更新、ファイルをアーカイブ、Realtime通知を送出。

## 3. 問題選出ロジック（selectProblemsForPrint）
実装: `src/lib/print-algo.ts` / `src/lib/progression.ts`

> スコアリングの考え方や具体例は [`問題スコアリングロジック.md`](./問題スコアリングロジック.md) を参照。本セクションは実装上の正確な式と定数のリファレンスとして残す。

### 3.1 アンロック判定
- `getUnlockedCoreProblemIds(userId, subjectId)` で、解放済みCoreProblemを取得。
- `UserCoreProblemState.isUnlocked = true` を基準にし、**最初のCoreProblemは常にアンロック扱い**。

### 3.2 候補問題の抽出
- CoreProblemに紐づく問題から候補を取得。
- **「紐づくすべてのCoreProblemがアンロック済み」**の問題のみを有効候補とする。

### 3.3 スコアリング
スコアは以下のルールで算出され、降順でソートされる。

- **未着手** (`UserProblemState` が存在しない、または `lastAnsweredAt` が null):
  - `score = UNANSWERED_BASE * WEIGHT_UNANSWERED - problem.order * 0.1`
  - 既定値で `1000 * 1.5 - order*0.1 = 約1500`
- **既着手** (`lastAnsweredAt` あり):
  - 経過日数 `diffDays` から忘却スコアを算出し、`TIME_SCORE_CAP` で頭打ち
    - `timeScore = min(diffDays * FORGETTING_RATE * WEIGHT_TIME, TIME_SCORE_CAP)`
    - 既定値では 80日 (= 800) で上限に達する
  - 正解済 (`isCleared = true`): `score = timeScore - CORRECT_PENALTY`
  - 不正解 (`isCleared = false`): `score = timeScore + WEAKNESS_BONUS * WEIGHT_WEAKNESS`
- **同点時の扱い**: 同一点の問題群のみ seed 固定のシャッフルを行う
  - 1回のプレビュー生成中は順序固定
  - プレビューを新しく作り直した場合のみ再抽選

設定値（`PRINT_CONFIG`）:
- `WEIGHT_TIME = 2.0`
- `WEIGHT_WEAKNESS = 1.0`
- `WEIGHT_UNANSWERED = 1.5`
- `FORGETTING_RATE = 5.0`
- `UNANSWERED_BASE = 1000`（未着手のベーススコア）
- `TIME_SCORE_CAP = 800`（既着手の時間スコア上限。長期放置の暴走を防ぐ）
- `CORRECT_PENALTY = 150`（正解済問題のスコア減算）
- `WEAKNESS_BONUS = 100`（不正解問題のスコア加算）
- `NEW_QUOTA_RATIO = 0.4` / `NEW_QUOTA_MIN = 5`（後述のスロット分割で使用）

スコア上限の関係:
- 未着手 ≒ 1500
- 既着手・不正解の最大 = `TIME_SCORE_CAP + WEAKNESS_BONUS * WEIGHT_WEAKNESS = 900`
- 既着手・正解の最大 = `TIME_SCORE_CAP - CORRECT_PENALTY = 650`

→ 未着手 > 不正解 > 正解 が常に成立し、長期放置されただけの正解問題が未着手プールを押し出さない。

### 3.4 選抜（スロット分割）
- 出題数 `count`（既定 30）を「未着手枠」と「既着手枠」に分けて確保する。
- `newQuota = min(max(NEW_QUOTA_MIN, floor(count * NEW_QUOTA_RATIO)), count)`
  - 既定値 `count = 30` のとき `newQuota = 12`
- 選抜順序:
  1. `newSlots`: 未着手プールの上位 `newQuota` 件
  2. `reviewSlots`: 既着手プールの上位 `count - newSlots.length` 件
  3. `overflow`: 既着手が枯渇した場合、未着手の続きで残りを埋める
- これにより「未着手が多すぎて復習が消える / 未着手が少なすぎて既着手で埋まる」両方を防ぐ。
- 返却は `Problem[]`（内部では `coreProblems` 付きで取得）。

## 4. 印刷レイアウト（PrintLayout）
実装: `src/app/teacher/students/[userId]/print/print-layout.tsx`

### 4.1 ページ分割
- A4想定で `MAX_PAGE_HEIGHT_PX = 900` を使用。
- **非表示の計測コンテナ**で各問題の高さを測定し、ページ内に収まるよう分割。
- 問題ページ数 + 1ページ（解答用紙）で総ページ数を計算。

### 4.2 問題ページ
- ヘッダー: 科目名、氏名、実施日、ページ番号
- 問題本文: `PrintProblemItem` で表示
  - 番号は `customId` があればそれを優先、なければ `index + 1`
  - 問題文は `problem.question` をそのまま出力
- フッター: 固定のクレジット

### 4.3 解答用紙ページ
- 問題数分の解答欄を出力（番号 + `A.` + 下線）
- QRコードを右上に配置（存在する場合）

## 5. QRコードの生成
実装: `src/lib/grading-service.ts`（`generateQRCode`）

- QR内容は以下のJSONをエンコード（可能なら圧縮形式を使用）:
  ```json
  { "s": "<studentLoginId>", "p": "<problemId>,<problemId>,..." }
  ```
  もしくは圧縮形式:
  ```json
  { "s": "<studentLoginId>", "c": "<prefix>|1-2" }
  ```
- いずれの形式でも後段の採点処理で「生徒ID × 問題ID群」を復元可能。

## 6. スキャン/採点ロジック詳細
実装: `src/lib/grading-service.ts` / `src/app/api/grading/webhook/route.ts` / `worker/server.ts`

### 6.1 トリガと排他制御
- Webhook は `x-goog-channel-id` をDB保存のWatch stateの `channelId` と照合し、`resourceState=change|update|add` のみ処理。
- 連続呼び出しを 5 秒でデバウンス（`DEBOUNCE_MS = 5000`）。
- 排他制御は Postgres lease（`distributed_locks`）で実施（`src/lib/grading-lock.ts`）。
- 内部手動チェック用の `/api/grading/check` は **Workerサービス** で受け付け、`INTERNAL_API_SECRET` が必要。

### 6.2 Driveファイル抽出とジョブ発行
- `checkDriveForNewFiles` で `DRIVE_FOLDER_ID` 配下の最新ファイルを取得。
- ファイル名が `[PROCESSED]` / `[ERROR]` で始まるものは対象外。
- `GRADING_WORKER_URL` + `GOOGLE_CLOUD_PROJECT_ID` + `CLOUD_TASKS_CALLER_SERVICE_ACCOUNT` が必須で、`/api/queue/grading` へ Cloud Tasks push する（Webサービスでの同期採点フォールバックは無効）。

### 6.3 ファイル処理
- Drive からファイルを `/tmp` にストリーム保存。
- `gradeWithGemini` で QR解析 + 採点。
- 結果が空なら `renameFile` で `[ERROR] <fileName>` に変更。
- 成功時は `recordGradingResults` → `archiveProcessedFile` を実行し、ローカルファイルを削除。

### 6.4 QR解析
- 先頭4バイトのマジックバイトでPDF判定し、PDFはローカルQR解析をスキップ。
- ローカル解析は `scripts/qr_reader.py` を `/usr/bin/python3` で実行（画像のみ）。
- 失敗時は Gemini による QR 解析 (`scanQRWithGemini`) をフォールバック。
- QRは短縮形式 `{ s, p }` / `{ s, c }` を使用。

### 6.5 Gemini採点
- `Problem` を `id` / `customId` で取得し、QR順にソート。
- プロンプトに `question`, `answer`, `acceptedAnswers`, `coreProblems` を渡し、JSON配列で結果を要求。
- 評価は `A/B/C/D` で、`A/B` を正解扱い。
- JSONはコードブロックや `JSON` プレフィックスを除去してパース。

### 6.6 保存・状態更新・アンロック・通知
- `LearningHistory` を `createMany` で保存し、`groupId` を生成。
- `UserProblemState` を upsert して `priority` と `lastAnsweredAt` を更新。
  - 優先度調整: A:-10 / B:-5 / C:+5 / D:+10
- `UserCoreProblemState` は解放・講義視聴状態のみを更新し、出題スコア用のポイント更新は行わない。
- `checkProgressAndUnlock` で解放判定（解答率>=50% かつ 正答率>=60%）を満たすと次のCoreProblemを解放。
- 採点完了は `realtime_events` へ `grading_completed` をINSERTし通知。
- ゲーミフィケーション更新がある場合は `gamification_update` をINSERTして通知。

### 6.7 アーカイブとリネーム
- `archiveProcessedFile` が `採点済/<教室>/<年>/<月>/<日>/` に移動・リネーム。
- 新ファイル名は `教室名_生徒名_科目_YYYYMMDD-HHMMSS.<ext>`。
- アーカイブ失敗時は `[PROCESSED] (Archive Failed)` にリネーム。

## 7. 現状の注意点
- `ScoredProblem.reason` は全て `'new'` で固定されており、用途未実装。
- 出題数（`count`）はUIから変更できず、コード上のデフォルトに依存。
- ローカルQR解析は `/usr/bin/python3` と `scripts/qr_reader.py` に依存し、PDFは必ずGemini解析にフォールバック。
- `checkDriveForNewFiles` は最新10件のみ対象で、失敗時は `[ERROR]` リネームのみ行うため運用側で再処理が必要。
- 3分超の未処理ファイルは `[ERROR] (Timeout)` にリネームされる。
