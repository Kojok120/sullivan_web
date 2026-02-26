# Sullivan

Sullivan は、**AI伴走 × 人の支援**で「伸び悩み層」の学習を支える学習支援プラットフォームです。  
プリント学習を基盤に、AIによる自動採点・復習最適化と、講師による情意面サポートを両立し、
**低価格でも高密度な個別最適学習**を成立させることを目指しています。

## プロダクト意図

Sullivan が解こうとしている中心課題は、次のループです。

- 基礎未定着で授業がわからない
- 恥・恐怖・比較で自己効力感が低下する
- 「明日しのぎ」の行動に最適化される
- さらに基礎未定着が進む

このループを断ち切るために、以下の分業を採用しています。

- AI: 出題最適化、採点、誤答分析、次の学習提案
- 人: 見守り、声かけ、習慣化支援、面談記録に基づく伴走

## 実装済みの主要機能

### 1. プリント学習サイクル

- 生徒ごとの状態に応じた問題を自動選出して印刷
- QRコードで「生徒ID × 問題セット」を埋め込み
- 解答後は Google Drive 連携で採点キューへ投入

### 2. AI採点・復習最適化

- Gemini による A/B/C/D 評価と日本語フィードバック
- `UserProblemState` / `UserCoreProblemState` の優先度を更新
- 忘却曲線と単元進捗に基づく再出題
- 条件達成で次単元をアンロック

### 3. 学習ゲート制御

- 単元に講義動画がある場合、未視聴状態では印刷を制御（Print Gate）
- 単元フォーカス画面へ誘導し、学習順序を担保

### 4. 人の支援を支える機能

- 指導記録（面談・指導メモ）の登録/参照
- 教室単位の生徒一覧・検索・学習状況確認

### 5. AI家庭教師（PREMIUMプラン）

- チャット相談: `/api/tutor-chat`
- 音声通話相談: Gemini Live を `/ws` 経由で中継
- 教室プランが `PREMIUM` の生徒のみ利用可能

### 6. 非認知アンケート

- 90日ごとの定期アンケート
- カテゴリ: `GRIT`, `SELF_EFFICACY`, `SELF_REGULATION`, `GROWTH_MINDSET`, `EMOTIONAL_REGULATION`
- 学習行動の背景を可視化するための基盤データを保存

### 7. ゲーミフィケーション

- XP/レベル/連続学習日数
- 実績（Achievements）
- Realtime 通知でレベルアップや採点完了を反映

## ロール

- `STUDENT`: 学習・履歴・印刷・AIフィードバック閲覧
- `TEACHER`: 担当教室の生徒管理、指導記録、印刷支援
- `HEAD_TEACHER`: `TEACHER` 権限 + 教師ユーザー作成
- `ADMIN`: 全体管理（ユーザー/教室/カリキュラム/問題）
- `PARENT`: スキーマ上定義あり（現時点で専用UIは限定的）

## 技術スタック

- フロント/アプリ: Next.js 16 (App Router), React 19, TypeScript
- UI: Tailwind CSS v4, shadcn/ui (Radix UI), Recharts
- DB: PostgreSQL + Prisma
- 認証: Supabase Auth (`@supabase/ssr`)
- AI: Google Gemini (`@google/genai`)
- 外部連携: Google Drive API, Upstash QStash, Upstash Redis, Supabase Realtime
- デプロイ: Google Cloud Run (Webサービス + Workerサービス)

## システム構成（実運用）

- `web` サービス
  - Next.js UI/API
  - Drive Webhook受信
  - QStash へのジョブ発行
  - `/ws` で Gemini Live 音声中継
- `worker` サービス
  - `/api/queue/grading`, `/api/queue/drive-check` を処理
  - 重い採点処理を分離

## クイックスタート

詳細は [環境構築.md](./環境構築.md) を参照してください。

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

Worker もローカルで検証する場合:

```bash
npm run dev:worker
```

## 主要コマンド

```bash
npm run dev             # Web 開発サーバー
npm run dev:worker      # Worker 開発サーバー
npm run build           # 本番ビルド
npm run start           # Web 本番起動
npm run start:worker    # Worker 本番起動
npm run lint            # ESLint
npm run type-check      # TypeScript 型チェック
npm run test            # Vitest
npm run test:e2e        # Playwright
```

## 主要な環境変数

### 基本（必須）

- `DATABASE_URL`, `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

### 採点/キュー/Drive（運用時）

- `DRIVE_FOLDER_ID`
- `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
- `GRADING_WORKER_URL`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `APP_URL`, `INTERNAL_API_SECRET`, `DRIVE_WEBHOOK_TOKEN`

### AI音声チューター（任意）

- `GEMINI_LIVE_SESSION_SECRET`
- `GEMINI_LIVE_MODEL`, `GEMINI_LIVE_API_VERSION`, `GEMINI_LIVE_VOICE`
- `NEXT_PUBLIC_GEMINI_SILENCE_HOLD_MS`, `NEXT_PUBLIC_GEMINI_MAX_TURN_MS`

## ドキュメント

- [機能一覧.md](./機能一覧.md)
- [Architecture.md](./Architecture.md)
- [環境構築.md](./環境構築.md)
- [デプロイ手順](./docs/deploy_runbook.md)
- [問題出力ロジック](./docs/problem-output-logic.md)

