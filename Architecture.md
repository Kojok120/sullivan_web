# Architecture Documentation

Sullivan の技術アーキテクチャを、プロダクト意図（AI伴走 × 人の支援）と実装の対応で整理します。

## 1. 設計の要点

Sullivan は次の分業を前提に設計されています。

- AI が処理量の大きい個別最適化タスクを担当
  - 出題最適化
  - 採点
  - フィードバック生成
  - 音声/チャットによる学習支援
- 人（講師）が高付加価値タスクに集中
  - 見守り
  - 面談
  - 学習習慣づくり

この構造により、1対多運用でも学習品質を落としにくい構成を目指します。

## 2. ランタイム構成

### 2.1 Webサービス（Cloud Run）

- Next.js 16 App Router
- UI と通常 API を提供
- Drive Webhook 受信
- Cloud Tasks ジョブ発行
- Gemini Live 音声連携の WebSocket 中継（`/ws`）

起動エントリーポイント:

- `server.ts`（カスタムHTTPサーバー + Next ハンドラ + WebSocket upgrade）

### 2.2 Workerサービス（Cloud Run）

- 採点専用 HTTP サーバー
- `/api/queue/grading` / `/api/queue/drive-check` を処理
- Cloud Run IAM で保護された private service として採点ジョブを実行

起動エントリーポイント:

- `worker/server.ts`

### 2.3 主要外部サービス

- Supabase Auth（SSR）
- PostgreSQL（Prisma）
- Google Gemini（`@google/genai`）
- Google Drive API（答案受け取り）
- Google Cloud Tasks（ジョブキュー）
- Supabase Realtime（イベント配信）

## 3. 主要データフロー

### 3.1 プリント作成フロー

1. 生徒・教科を選択
2. `print-algo.ts` で問題をスコアリングして抽出
3. `PrintLayout` で印刷ページ生成
4. QR に生徒ID/問題セットを埋め込んで出力

### 3.2 採点フロー

1. Drive Webhook を受信
2. Web サービスが Cloud Tasks へジョブ発行
3. Worker がジョブ処理
4. QR 解析（OpenCV -> 失敗時 Gemini）
5. Gemini 採点
6. `LearningHistory` / 学習状態を更新
7. 単元解放判定
8. `realtime_events` 発行

### 3.3 AIチューターフロー

- チャット:
  - `POST /api/tutor-chat`
  - 学習文脈付きで Gemini 生成
- 音声:
  - `POST /api/gemini-live/token` で短命トークン発行
  - フロントが `/ws` 接続
  - `gemini-socket-proxy.ts` が Gemini Live と双方向中継

### 3.4 非認知アンケートフロー

1. 学習履歴画面で 90日経過判定
2. `QuestionBank` からカテゴリ別ランダム出題
3. 回答を `SurveyResponse` に保存
4. カテゴリスコアを JSON で保持

## 4. 認証・認可モデル

- セッション取得: `@supabase/ssr`
- ロール: `STUDENT`, `TEACHER`, `HEAD_TEACHER`, `PARENT`, `ADMIN`
- 権限制御:
  - 管理者は全体アクセス
  - 講師系ロールは教室スコープで生徒アクセス
  - AIチューターは `ClassroomPlan.PREMIUM` のみ許可

## 5. データモデル（主要）

- 教材:
  - `Subject` -> `CoreProblem` -> `Problem`
- 学習ログ:
  - `LearningHistory`
- 学習状態:
  - `UserProblemState`
  - `UserCoreProblemState`
- 運用:
  - `GradingJob`（冪等性/再試行管理）
  - `DistributedLock`（採点ロック）
  - `DriveWatchState`（Drive watch 状態）
  - `RealtimeEvent`
- 情意・習慣:
  - `GuidanceRecord`
  - `SurveyResponse`
- ゲーミフィケーション:
  - `Achievement`, `UserAchievement`, `DailyLearningSummary`

## 6. ディレクトリ構成（要点）

```text
src/
├── app/                    # App Router ページ/API
├── components/             # UIコンポーネント
├── lib/                    # ドメインロジック
│   ├── grading-service.ts  # 採点本体
│   ├── print-algo.ts       # 出題選定
│   ├── progression.ts      # 単元解放判定
│   ├── survey-service.ts   # 非認知アンケート
│   ├── gemini-socket-proxy.ts
│   └── ...
├── hooks/                  # フロントフック（Gemini Live 等）

server.ts                   # Webサービス起動
worker/server.ts            # Workerサービス起動
prisma/schema.prisma        # DBスキーマ
```

## 7. デプロイ前提

- Web と Worker を分離デプロイ
- `SERVICE_ROLE=web|worker` で実行責務を切替
- Drive Watch は定期更新運用（7日失効対策）

実運用手順は [docs/deploy_runbook.md](./docs/deploy_runbook.md) を参照してください。
