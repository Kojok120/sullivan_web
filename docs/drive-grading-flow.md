# Google Drive検知からAI採点までの処理フロー（Sullivan）

このドキュメントは、Google Driveに提出された解答ファイルを検知してから、AI（Gemini）で採点し、DB更新・通知・アーカイブまで行う一連の処理をまとめたものです。

## 範囲
- 対象: Google Driveのファイル検知〜AI採点〜結果保存・通知・アーカイブ
- 前提: 解答ファイルは `DRIVE_FOLDER_ID` 配下にアップロードされる

## 関連コンポーネント
- Google Drive API（Push Notifications / files.list / files.get / files.update）
- Webhook/API
  - `POST /api/grading/webhook`（Drive通知受信）
  - `GET /api/grading/check`（旧ポーリング/手動実行のフォールバック）
  - `POST /api/queue/grading`（QStash経由の採点ジョブ実行）
  - `POST /api/drive/watch/setup`（初回Watch登録）
  - `POST /api/drive/watch/renew`（Watch更新）
- Upstash QStash（キュー実行）
- Upstash Redis（Drive Watch状態保存）
- Gemini API（解答読み取り・採点 / QR読み取りフォールバック）
- Python QRリーダー（OpenCV / Pyzbar）
- Prisma + PostgreSQL（採点結果・学習状態の保存）

## 時系列フロー

### 0) Drive Watchの準備
- 初回登録: `POST /api/drive/watch/setup`
  - `APP_URL` + `/api/grading/webhook` を通知先として登録
  - `channelId`, `resourceId`, `expiration` をUpstash Redisに保存
  - `expiration` は7日後を指定（Google Driveの最大値）
- 更新: `POST /api/drive/watch/renew`（Schedulerで12時間ごとに実行を想定）
  - 期限が近い場合のみ更新（閾値: 6時間前）
  - 旧Watchを停止して再登録

### 1) ファイル検知（Webhook）
1. Google Driveが `POST /api/grading/webhook` に通知
2. Webhookは以下を検証
   - `x-goog-channel-id` がRedis保存の `channelId` と一致するか
3. `resourceState` が `change` / `update` / `add` の場合のみ処理
4. デバウンス（5秒）とロックファイルで多重処理を抑制
5. Drive APIの整合性待ちで5秒待機後、Driveチェックを実行

### 2) Driveファイル一覧の取得
- `checkDriveForNewFiles()` が `DRIVE_FOLDER_ID` を `files.list`
  - `createdTime desc` / `pageSize: 10`
  - フォルダ以外、`[PROCESSED]` / `[ERROR]` で始まらないファイルのみ対象
- 対象ファイルごとに採点ジョブを発行
  - QStashが使える場合は非同期
  - 未設定時は同期処理で実行

### 3) 採点ジョブ実行（QStash or 直接）
- `POST /api/queue/grading`
  - QStash署名を検証（キー未設定時は `INTERNAL_API_SECRET` を要求）
  - 受け取った `fileId` / `fileName` を `processFile()` に渡す

### 4) ファイルダウンロードと準備
1. Driveからファイルを `/tmp` にダウンロード
2. ヘッダ判定でPDFかどうかを判別
3. Base64化してGemini入力用に準備

### 5) QR読み取り
1. 画像の場合はローカルPythonでQR解析（`scripts/qr_reader.py`）
   - Pyzbar → OpenCV（複数手法）で読み取り
2. 失敗またはPDFの場合はGeminiでQR解析にフォールバック
3. QRデータ（例）
   - `{"sid":"S0001","pids":["E-1","E-2"]}`
   - もしくは圧縮形式 `{"sid":"S0001","sub":"E","nos":[1,2]}`
4. QRから取得した `sid` を `loginId` としてユーザー特定
   - 取得不能/ユーザー不在の場合はDriveファイルを `[ERROR]` にリネームして終了
5. ユーザー特定後、スタンプ数をインクリメント（提出の事実を先に記録）

### 6) 採点（Gemini）
1. QRの問題IDを展開し、DBから問題情報を取得
   - `Problem` の `question`, `answer`, `acceptedAnswers`, `coreProblems` を取得
2. Geminiへ以下を投入
   - 問題一覧（正解・許容解答・関連CoreProblem）
   - 解答用紙の画像/ PDF
3. GeminiはJSON配列で返却
   - `problemId`, `studentAnswer`, `evaluation` (A-D), `feedback`, `badCoreProblemIds`
4. `evaluation` が A/B なら正解、C/D なら不正解扱い

### 7) 結果保存・進捗更新
`recordGradingResults()` でトランザクション処理
- `LearningHistory` を一括保存（`groupId` 付与）
- `UserProblemState` を更新（優先度は評価に応じて増減）
- `UserCoreProblemState` を更新
  - 正解: 関連CoreProblemの優先度を -5
  - 不正解: `badCoreProblemIds` に +5
- トランザクション後に `checkProgressAndUnlock()` を実行し次の単元を解放

### 8) 通知（SSE）
- 採点完了時に `grading_completed` イベントを発火
- `GET /api/events` でSSE配信（本人のイベントのみ）

### 9) Drive側のアーカイブ
- 採点完了後、Drive上で以下を実施
  - `採点済/<教室名>/<年>/<月>/<日>/` を作成・移動
  - ファイル名を `教室名_生徒名_科目_採点時間` に変更（JST）
- 失敗時は `[PROCESSED] (Archive Failed)` でリネーム

## エラー/フォールバック
- Drive Webhookの検証に失敗 → 401で拒否
- デバウンス・ロック中 → 処理スキップ
- QStash未設定 → 同期処理へフォールバック
- QR取得失敗/ユーザー不明 → `[ERROR]` にリネーム
- GeminiのJSON不正 → `[ERROR]` にリネーム

## 主要な環境変数
- `DRIVE_FOLDER_ID`（監視対象フォルダ）
- `APP_URL`（Webhook URL作成に使用）
- `GEMINI_API_KEY`, `GEMINI_MODEL`（Gemini設定）
- `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`（Watch状態保存）
- `INTERNAL_API_SECRET`（内部API保護）
- `DRIVE_WEBHOOK_CHANNEL_ID`（固定channelIdにする場合）

## 主要な実装ファイル
- `src/app/api/grading/webhook/route.ts`
- `src/app/api/grading/check/route.ts`
- `src/app/api/queue/grading/route.ts`
- `src/app/api/drive/watch/setup/route.ts`
- `src/app/api/drive/watch/renew/route.ts`
- `src/lib/grading-service.ts`
- `src/lib/drive-client.ts`
- `src/lib/drive-webhook-manager.ts`
- `src/lib/drive-watch-state.ts`
- `scripts/qr_reader.py`
