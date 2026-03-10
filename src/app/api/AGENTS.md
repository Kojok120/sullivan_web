# API Routes エージェント指示

## 概要

Next.js App Router の API Routes。外部サービスからの Webhook 受信やバックグラウンドジョブの処理を担当。

## エンドポイント一覧

| パス | 用途 |
|--|--|
| `/api/grading/webhook` | Google Drive Push Notification の受信 |
| `/api/drive/watch/*` | Drive Watch の管理（setup/renew） |
| `/api/core-problem-unlocks` | CoreProblem アンロック API |
| `/api/lecture-watched` | 講義動画視聴完了記録 |
| `/api/tutor-chat` | AI チューターチャット |
| `/api/events` | Realtime イベント関連 |

## 規約

- Webhook エンドポイントは `INTERNAL_API_SECRET` または `DRIVE_WEBHOOK_TOKEN` で認証する
- レスポンスは `NextResponse.json()` で返す
- エラーハンドリング: 適切な HTTP ステータスコードを返す（400, 401, 500 等）
- 長時間処理は Cloud Tasks へのキューイングで非同期化する
