# Sullivan

Sullivan は、AI による個別最適化と講師の伴走支援を組み合わせた学習管理システム（LMS）です。  
プリント学習を起点に、問題選定、採点、復習優先度更新、学習履歴可視化、講師による支援記録までを一気通貫で扱います。

## プロダクトの狙い

Sullivan が解いている中心課題は、次の悪循環です。

- 基礎未定着で授業がわからない
- 失敗体験の蓄積で自己効力感が下がる
- その場しのぎの学習行動に寄る
- さらに基礎未定着が進む

この循環を断ち切るため、役割を明確に分けています。

- AI: 出題最適化、採点、誤答分析、復習提案、目標草案生成
- 人: 見守り、声かけ、面談、習慣化支援、学習背景の把握

## 主要機能

### 学習サイクル

- 生徒ごとの状態に応じて問題を自動選出して印刷
- 問題セットを QR コードで出力し、生徒 ID と紐付け
- Google Drive に投入された答案を検知して採点キューへ連携

### AI 採点と学習最適化

- Gemini による A/B/C/D 評価と日本語フィードバック
- `LearningHistory`、`UserProblemState`、`UserCoreProblemState` を更新
- 忘却曲線と回答履歴をもとに再出題優先度を計算
- 条件達成時に次単元を自動アンロック

### 学習順序の制御

- 単元に講義動画がある場合、未視聴なら印刷をブロック
- `unit-focus` 画面へ誘導して先に講義視聴を促進

### 講師支援

- 生徒プロフィール・講師メモの管理
- 指導記録（面談、指導、その他）の登録
- 担当教室内での生徒進捗確認
- 学習目標の作成、マイルストーン設計、AI による草案生成

### 生徒向け体験

- 学習履歴、ランキング、実績、連続学習日数の可視化
- 90 日ごとの非認知アンケート
- PREMIUM 教室向け AI 家庭教師
  - チャット: `/api/tutor-chat`
  - 音声: `/api/gemini-live/token` + `/ws`

### 管理・外部連携

- 管理画面でのユーザー、教室、カリキュラム、問題管理
- Drive Watch のセットアップ/更新 API
- iOS 向け API
  - `/api/ios/goals`
  - `/api/ios/rankings`
  - `/api/ios/vocabulary`
  - `/api/ios/vocabulary-scores`

## ロール

- `STUDENT`: 学習、履歴、復習、印刷、ランキング、AI フィードバック閲覧
- `TEACHER`: 担当教室の生徒管理、印刷支援、指導記録、目標管理
- `HEAD_TEACHER`: `TEACHER` 権限 + 講師ユーザー作成
- `ADMIN`: 全体管理（ユーザー、教室、教材、問題、分析）
- `PARENT`: スキーマ上は定義済み。現時点の専用 UI は限定的

## システム構成

### Web サービス

- Next.js 16 App Router ベースの UI / API サービス
- カスタムサーバー `server.ts` で起動
- Drive Webhook 受信
- Cloud Tasks ジョブ発行
- Gemini Live 用 WebSocket `/ws` を中継
- PDF 出力用ブラウザのウォームアップを起動時に実行

### Worker サービス

- 採点専用の HTTP サーバー `worker/server.ts` で起動
- `/api/queue/grading` と `/api/queue/drive-check` を処理
- Cloud Run IAM で保護された private service として運用

### 主な外部サービス

- Supabase Auth
- PostgreSQL + Prisma
- Google Gemini
- Google Drive API
- Google Cloud Tasks
- Supabase Realtime

## 技術スタック

- フレームワーク: Next.js 16, React 19, TypeScript
- UI: Tailwind CSS v4, shadcn/ui, Radix UI, Recharts
- ORM: Prisma 7
- 認証: `@supabase/ssr`
- AI: `@google/genai`
- リアルタイム/外部連携: Supabase Realtime, Google Drive API, Google Cloud Tasks
- テスト: Vitest, Playwright
- デプロイ: Google Cloud Run（Web / Worker 分離）

## セットアップ

### 前提

- Node.js 20 以上
- npm
- PostgreSQL
- Supabase プロジェクト
- Gemini API キー
- ffmpeg
  - macOS: `brew install ffmpeg`
  - Ubuntu / Debian: `sudo apt-get install ffmpeg`
  - Windows (Chocolatey): `choco install ffmpeg`
- Python 3
  - QR のローカル解析を使う場合は OpenCV (`cv2`) が必要

### 1. 依存関係をインストール

```bash
npm install
```

`postinstall` で Prisma Client は自動生成されます。スキーマ変更後に明示的に再生成したい場合は `npx prisma generate` を実行してください。

### 2. 環境変数を用意

ローカル開発は `.env.local` を使います。デプロイスクリプトでは `.env.DEV` / `.env.PRODUCTION` を参照します。

最小構成:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

NEXT_PUBLIC_SUPABASE_URL="https://...supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."

GEMINI_API_KEY="..."
GEMINI_MODEL="gemini-3.1-pro-preview"
GEMINI_CHAT_MODEL="gemini-3.1-pro-preview"
GEMINI_CHAT_FALLBACK_MODEL="gemini-3.1-pro-preview"
FFMPEG_PATH="/absolute/path/to/ffmpeg" # PATH 上にない場合のみ
```

プリント採点フローまで使う場合:

```env
APP_URL="http://localhost:3000"
GRADING_WORKER_URL="http://localhost:8080"
INTERNAL_API_SECRET="..."

DRIVE_FOLDER_ID="..."
DRIVE_WEBHOOK_TOKEN="..."
DRIVE_WEBHOOK_CHANNEL_ID="..." # 任意
DRIVE_WEBHOOK_CHANNEL_ID_FIXED="false" # 任意
DRIVE_WATCH_STATE_KEY="sullivan:drive:watch:state"
DRIVE_WATCH_RENEW_THRESHOLD_HOURS="18"

GOOGLE_CLOUD_PROJECT_ID="..."
CLOUD_TASKS_LOCATION="asia-northeast1"
GRADING_TASK_QUEUE="sullivan-grading"
DRIVE_CHECK_TASK_QUEUE="sullivan-drive-check"
CLOUD_TASKS_CALLER_SERVICE_ACCOUNT="..."
GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json" # ローカルで必要な場合のみ
```

Gemini Live 音声チューターを使う場合:

```env
GEMINI_LIVE_SESSION_SECRET="..."
GEMINI_LIVE_MODEL="..."
GEMINI_LIVE_API_VERSION="..."
GEMINI_LIVE_VOICE="..."
NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS="..."
NEXT_PUBLIC_GEMINI_MAX_TURN_MS="..."
```

補足:

- `DIRECT_URL` は Prisma マイグレーション用です。未設定なら `DATABASE_URL` が使われます
- `FFMPEG_PATH` は面談録音要約で使う `ffmpeg` 実行ファイルのパスです。Unix 系は `export FFMPEG_PATH=/path/to/ffmpeg`、Windows PowerShell は `$env:FFMPEG_PATH="C:\\ffmpeg\\bin\\ffmpeg.exe"` の形式で設定できます
- `PUPPETEER_EXECUTABLE_PATH` は PDF 出力用ブラウザの自動検出が失敗した場合のみ使います
- `PORT` と `BIND_HOST` で Web / Worker の待受先を変更できます
- 面談録音要約が 500 で失敗する場合は、`ffmpeg` が PATH に通っているか、`FFMPEG_PATH` が正しい実行ファイルを指しているか確認してください

### 3. DB をセットアップ

```bash
npx prisma migrate dev
npx prisma db seed
```

### 4. 開発サーバーを起動

Web:

```bash
npm run dev
```

Worker:

```bash
npm run dev:worker
```

デフォルトの待受先:

- Web: `http://localhost:3000`
- Worker: `http://localhost:8080`

ヘルスチェック:

- Web: `GET /healthz`
- Worker: `GET /healthz`

## 主要コマンド

```bash
npm run dev             # Web 開発サーバー
npm run dev:worker      # Worker 開発サーバー
npm run build           # Web 本番ビルド
npm run start           # Web 本番起動
npm run start:worker    # Worker 本番起動
npm run lint            # ESLint
npm run type-check      # TypeScript 型チェック
npm run test            # Vitest
npm run test:watch      # Vitest watch
npm run test:coverage   # カバレッジ付き Vitest
npm run test:e2e        # Playwright
npm run test:e2e:ui     # Playwright UI
```

## 代表的な API / エンドポイント

- `GET /api/print/pdf`: PDF 生成
- `POST /api/grading/webhook`: Drive Webhook 受信
- `POST /api/queue/grading`: 採点ジョブ処理
- `POST /api/queue/drive-check`: Drive 再確認ジョブ処理
- `GET /api/grading/check`: 手動 Drive チェック
- `POST /api/drive/watch/setup`: Drive Watch 開始
- `POST /api/drive/watch/renew`: Drive Watch 更新
- `POST /api/tutor-chat`: AI チャット家庭教師
- `POST /api/gemini-live/token`: Gemini Live 接続トークン発行
- `GET /api/rankings`: ランキング取得

## ディレクトリ構成

```text
src/
├── app/                  # App Router ページ / Route Handlers / Server Actions
├── actions/              # 共有 Server Action
├── components/           # UI コンポーネント
├── hooks/                # クライアントフック
├── lib/                  # ドメインロジック、外部 API 連携、認可、採点処理
├── prompts/              # AI 用プロンプト
└── types/                # 型定義

prisma/
├── schema.prisma         # データベーススキーマ
└── migrations/           # Prisma マイグレーション

worker/
└── server.ts             # Worker サービス起動

scripts/                  # 補助スクリプト
docs/                     # 運用・設計ドキュメント
server.ts                 # Web サービス起動
```

## デプロイ

Cloud Run に Web / Worker を分離してデプロイします。GitHub Actions による自動デプロイです。

- **DEV**: `dev` ブランチへの push で [`deploy-dev.yml`](./.github/workflows/deploy-dev.yml) が起動
- **PRODUCTION**: `main` ブランチへの push で [`deploy-production.yml`](./.github/workflows/deploy-production.yml) が起動
- 各ワークフロー内部で `deploy-web-*.sh` / `deploy-grading-worker-*.sh` を実行する。スクリプト単体での運用は前提としていない

運用時は以下も前提になります。

- Cloud Tasks キュー作成
- Secret Manager による内部シークレット管理
- Drive Watch の登録と定期更新
- Supabase Realtime publication 設定

詳細は `docs/deploy_runbook.md` を参照してください。

## 関連ドキュメント

- [Architecture.md](./Architecture.md)
- [機能一覧.md](./機能一覧.md)
- [環境構築.md](./環境構築.md)
- [docs/deploy_runbook.md](./docs/deploy_runbook.md)
- [docs/problem-output-logic.md](./docs/problem-output-logic.md)
- [docs/gcloud初期設定.md](./docs/gcloud初期設定.md)
