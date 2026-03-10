# src/lib/ コアロジック エージェント指示

## 概要

ビジネスロジック、外部サービス連携、ユーティリティをまとめたディレクトリ。

## 主要モジュールの責務

### 採点・Google Drive 連携
| ファイル | 責務 |
|--|--|
| `grading-service.ts` | 採点パイプライン全体（Drive取込→QR解析→Gemini採点→DB保存→通知） |
| `grading-job.ts` | Cloud Tasks ジョブの発行 |
| `grading-lock.ts` | Postgres lease による重複採点ロック |
| `drive-client.ts` | Google Drive API クライアント |
| `drive-webhook-manager.ts` | Drive Watch の登録・停止 |
| `drive-watch-state.ts` | Watch 状態の DB 保存 |
| `cloud-tasks.ts` | Cloud Tasks push/OIDC の組み立て |
| `qr-utils.ts` | QR コード解析（Python/Gemini フォールバック） |

### 学習ロジック
| ファイル | 責務 |
|--|--|
| `print-algo.ts` | 出題選定アルゴリズム（忘却曲線ベース） |
| `print-service.ts` | プリント生成サービス |
| `progression.ts` | 単元アンロック判定ロジック |
| `analytics.ts` | 学習分析・統計 |
| `gamification-service.ts` | XP、連続学習、実績管理 |
| `stamp-service.ts` | スタンプカード |

### 認証・ユーザー
| ファイル | 責務 |
|--|--|
| `auth.ts` | セッション取得ヘルパ（`getCurrentUser()`） |
| `auth-admin.ts` | Supabase Admin API（ユーザー作成等） |
| `user-service.ts` | ユーザー情報取得 |
| `user-registration-service.ts` | ユーザー登録フロー |
| `password-service.ts` | パスワード管理 |

### データ・設定
| ファイル | 責務 |
|--|--|
| `prisma.ts` | Prisma シングルトンクライアント |
| `subject-config.ts` | 教科マスタ設定 |
| `tsv-parser.ts` | TSV ファイルパーサー |
| `utils.ts` | 汎用ユーティリティ |

### 外部サービス
| ファイル | 責務 |
|--|--|
| `gemini-socket-proxy.ts` | Gemini Live API WebSocket プロキシ |
| `audio-streamer.ts` | 音声ストリーミング |
| `youtube.ts` | YouTube Data API |
| `realtime-events.ts` | Supabase Realtime イベント発行 |
| `supabase/` | Supabase SSR クライアント（server/client/middleware） |

## 規約

- 新しいサービスは必ず **関数ベース** でエクスポートする（クラスは使わない）
- 外部 API 呼び出しには適切なエラーハンドリングとリトライを実装
- 環境変数のアクセスは `process.env.XXX` で直接参照（バリデーションは各サービスで行う）
