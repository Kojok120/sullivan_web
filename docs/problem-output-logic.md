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
1. Drive Webhook（`/api/grading/webhook`）または内部チェック（`/api/grading/check`）で `checkDriveForNewFiles` を起動。
2. `checkDriveForNewFiles` が対象ファイルを抽出し、QStash もしくは同期処理で採点ジョブを実行。
3. `processFile` がファイルをダウンロードし、QR解析 + Gemini採点を実施。
4. 採点結果を保存し、優先度/アンロックを更新、ファイルをアーカイブ、SSE通知を送出。

## 3. 問題選出ロジック（selectProblemsForPrint）
実装: `src/lib/print-algo.ts` / `src/lib/progression.ts`

### 3.1 アンロック判定
- `getUnlockedCoreProblemIds(userId, subjectId)` で、解放済みCoreProblemを取得。
- `UserCoreProblemState.isUnlocked = true` を基準にし、**最初のCoreProblemは常にアンロック扱い**。

### 3.2 候補問題の抽出
- CoreProblemに紐づく問題から候補を取得。
- **「紐づくすべてのCoreProblemがアンロック済み」**の問題のみを有効候補とする。

### 3.3 スコアリング
スコアは以下の合計で算出され、降順でソートされる。

- **CoreProblem優先度**: `UserCoreProblemState.priority` の合計
  - `priorityScore = sum(priority) * WEIGHT_CORE_PRIORITY`
- **未回答ボーナス**: `UserProblemState` が存在しない場合
  - `score += 100 * WEIGHT_UNANSWERED`
  - `score -= problem.order * 0.1`（順序をわずかに優先）
- **忘却度（経過日数）**: `lastAnsweredAt` からの経過日数
  - `score += diffDays * FORGETTING_RATE * WEIGHT_TIME`

設定値（`PRINT_CONFIG`）:
- `WEIGHT_TIME = 2.0`
- `WEIGHT_WEAKNESS = 1.0`（※現状の実装では未使用）
- `WEIGHT_UNANSWERED = 1.5`
- `WEIGHT_CORE_PRIORITY = 1.0`
- `FORGETTING_RATE = 5.0`

### 3.4 選抜
- スコア上位から指定数を採用（デフォルト `count = 30`）。
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
  { "sid": "<studentId>", "pids": ["<problemId>", "..."] }
  ```
  もしくは圧縮形式:
  ```json
  { "sid": "<studentId>", "sub": "<prefix>", "nos": [1, 2] }
  ```
- いずれの形式でも後段の採点処理で「生徒ID × 問題ID群」を復元可能。

## 6. スキャン/採点ロジック詳細
実装: `src/lib/grading-service.ts` / `src/app/api/grading/webhook/route.ts` / `src/app/api/queue/grading/route.ts`

### 6.1 トリガと排他制御
- Webhook は `x-goog-channel-id` をRedis保存のWatch stateの `channelId` と照合し、`resourceState=change|update|add` のみ処理。
- 連続呼び出しを 5 秒でデバウンス（`DEBOUNCE_MS = 5000`）。
- 排他制御は `/tmp/sullivan_grading.lock` を使うファイルロック（`src/lib/grading-lock.ts`）。
- 内部手動チェック用の `/api/grading/check` は `INTERNAL_API_SECRET` が必要。

### 6.2 Driveファイル抽出とジョブ発行
- `checkDriveForNewFiles` で `DRIVE_FOLDER_ID` 配下の最新ファイルを取得。
- ファイル名が `[PROCESSED]` / `[ERROR]` で始まるものは対象外。
- `QSTASH_TOKEN` + `APP_URL` がある場合は `/api/queue/grading` へ非同期発行。無ければ同期で `processFile` 実行。

### 6.3 ファイル処理
- Drive からファイルを `/tmp` にストリーム保存。
- `gradeWithGemini` で QR解析 + 採点。
- 結果が空なら `renameFile` で `[ERROR] <fileName>` に変更。
- 成功時は `recordGradingResults` → `archiveProcessedFile` を実行し、ローカルファイルを削除。

### 6.4 QR解析
- 先頭4バイトのマジックバイトでPDF判定し、PDFはローカルQR解析をスキップ。
- ローカル解析は `scripts/qr_reader.py` を `/usr/bin/python3` で実行（画像のみ）。
- 失敗時は Gemini による QR 解析 (`scanQRWithGemini`) をフォールバック。
- QRは `{ sid, pids }` 形式で、`pids` は `Problem.id` または `Problem.customId` を許容。

### 6.5 Gemini採点
- `Problem` を `id` / `customId` で取得し、QR順にソート。
- プロンプトに `question`, `answer`, `acceptedAnswers`, `coreProblems` を渡し、JSON配列で結果を要求。
- 評価は `A/B/C/D` で、`A/B` を正解扱い。
- JSONはコードブロックや `JSON` プレフィックスを除去してパース。

### 6.6 保存・状態更新・アンロック・通知
- `LearningHistory` を `createMany` で保存し、`groupId` を生成。
- `UserProblemState` を upsert して `priority` と `lastAnsweredAt` を更新。
  - 優先度調整: A:-10 / B:-5 / C:+5 / D:+10
- `UserCoreProblemState` を upsert（正解: 関連CPに-5 / 不正解: 推定CPに+5、`isUnlocked=true`）。
- `checkProgressAndUnlock` で解放判定（解答率>=50% かつ 正答率>=60%）を満たすと次のCoreProblemを解放。
- 採点完了は SSE イベント `grading_completed` を送出（`/api/events`）。
- ゲーミフィケーション更新がある場合は `gamification_update` を送出。

### 6.7 アーカイブとリネーム
- `archiveProcessedFile` が `採点済/<教室>/<年>/<月>/<日>/` に移動・リネーム。
- 新ファイル名は `教室名_生徒名_科目_YYYYMMDD-HHMMSS.<ext>`。
- アーカイブ失敗時は `[PROCESSED] (Archive Failed)` にリネーム。

## 7. 現状の注意点
- `WEIGHT_WEAKNESS` は定義済みだが、現行ロジックでは未使用。
- `ScoredProblem.reason` は全て `'new'` で固定されており、用途未実装。
- 出題数（`count`）はUIから変更できず、コード上のデフォルトに依存。
- ローカルQR解析は `/usr/bin/python3` と `scripts/qr_reader.py` に依存し、PDFは必ずGemini解析にフォールバック。
- `checkDriveForNewFiles` は最新10件のみ対象で、失敗時は `[ERROR]` リネームのみ行うため運用側で再処理が必要。
- 3分超の未処理ファイルは `[ERROR] (Timeout)` にリネームされる。
