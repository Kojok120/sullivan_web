# DBセキュリティレビュー報告書

作成日: 2026-04-01

## エグゼクティブサマリー

現在の Supabase / PostgreSQL 構成は、RLS を一部導入済みではあるものの、実運用上はまだ「安全に閉じている」とは言えません。特に重大なのは、`anon` / `authenticated` ロールに全 public テーブルの DML 権限が残ったまま、複数のテーブルで RLS が無効な点です。実DBで `SET ROLE anon` を行うと、`StudentGoal`、`SurveyResponse`、`VocabularyGameScore`、`drive_watch_states` などの実データが匿名ロールから読めることを確認しました。

また、アプリの Prisma 接続は `postgres` ロールで行われており、実DBで `rolbypassrls = true` を確認しました。このため、サーバー側の DB アクセスは RLS を迂回します。加えて、ユーザー削除時に Supabase Auth 側のアカウントが失効しない実装や、固定初期パスワード + 予測可能なログインID運用も残っており、認可・認証の境界に継続的なリスクがあります。

## 対象範囲

- Prisma / Supabase Auth / Supabase Postgres / App Router API / Server Actions
- 実DB確認:
  - `relrowsecurity`
  - `pg_policies`
  - `role_table_grants`
  - `SET ROLE anon`

## Critical

### F-001: `anon` / `authenticated` から未RLSテーブルの実データを読み書きできる

- 重大度: Critical
- 影響: 匿名公開キーまたは認証済み Supabase クライアントから、生徒目標、アンケート回答、語彙ゲームスコア、Drive watch 状態などを直接参照・改ざんできます。
- 根拠コード:
  - [prisma/migrations/20260217141902_enable_rls_all/migration.sql](/Users/kojok/Desktop/sakanoue/sullivan-web/prisma/migrations/20260217141902_enable_rls_all/migration.sql#L1)
  - [prisma/migrations/20260220193000_add_survey_tables/migration.sql](/Users/kojok/Desktop/sakanoue/sullivan-web/prisma/migrations/20260220193000_add_survey_tables/migration.sql#L15)
  - [prisma/migrations/20260226010000_add_student_goals/migration.sql](/Users/kojok/Desktop/sakanoue/sullivan-web/prisma/migrations/20260226010000_add_student_goals/migration.sql#L4)
  - [prisma/migrations/20260226200000_add_vocabulary_game_scores/migration.sql](/Users/kojok/Desktop/sakanoue/sullivan-web/prisma/migrations/20260226200000_add_vocabulary_game_scores/migration.sql#L1)
  - [prisma/migrations/20260309120000_add_distributed_locks_and_drive_watch_state/migration.sql](/Users/kojok/Desktop/sakanoue/sullivan-web/prisma/migrations/20260309120000_add_distributed_locks_and_drive_watch_state/migration.sql#L1)
  - [prisma/schema.prisma](/Users/kojok/Desktop/sakanoue/sullivan-web/prisma/schema.prisma#L121)
  - [prisma/schema.prisma](/Users/kojok/Desktop/sakanoue/sullivan-web/prisma/schema.prisma#L142)
  - [prisma/schema.prisma](/Users/kojok/Desktop/sakanoue/sullivan-web/prisma/schema.prisma#L207)
  - [prisma/schema.prisma](/Users/kojok/Desktop/sakanoue/sullivan-web/prisma/schema.prisma#L334)
  - [prisma/schema.prisma](/Users/kojok/Desktop/sakanoue/sullivan-web/prisma/schema.prisma#L354)
  - [prisma/schema.prisma](/Users/kojok/Desktop/sakanoue/sullivan-web/prisma/schema.prisma#L361)
- 実DB確認:
  - `relrowsecurity = false` を確認したテーブル:
    - `QuestionBank`
    - `StudentGoal`
    - `StudentGoalMilestone`
    - `SurveyResponse`
    - `VocabularyGameScore`
    - `distributed_locks`
    - `drive_watch_states`
  - `information_schema.role_table_grants` で `anon` / `authenticated` に `SELECT, INSERT, UPDATE, DELETE ...` が付与されていることを確認
  - `SET ROLE anon` で実測:
    - `StudentGoal = 1`
    - `StudentGoalMilestone = 8`
    - `SurveyResponse = 2`
    - `VocabularyGameScore = 1`
    - `drive_watch_states = 1`
    - 比較用に RLS 有効テーブルの `User = 0`, `LearningHistory = 0`
- 推奨対応:
  - 緊急遮断として、未RLSテーブルに対する `anon` / `authenticated` の権限を直ちに剥奪
  - そのうえで全 public テーブルに対し `ENABLE ROW LEVEL SECURITY` と明示的 policy を追加
  - 今後の migration に「新規 public テーブル作成時は同 migration 内で RLS + policy まで必須」というガードを追加
  - `drive_watch_states` や `distributed_locks` のような内部用途テーブルは private schema へ退避するか、少なくとも public API から隔離

## High

### F-002: Prisma 接続ロールが `BYPASSRLS` を持っており、アプリの DB アクセスでは RLS が効かない

- 重大度: High
- 影響: Server Action / Route Handler / Server Component 側で認可漏れが 1 箇所でもあると、RLS では止まりません。現状の RLS は「Supabase REST / Realtime / RPC 側の露出制御」には効いても、Prisma 経由の本体アプリ保護にはなっていません。
- 根拠コード:
  - [src/lib/prisma.ts](/Users/kojok/Desktop/sakanoue/sullivan-web/src/lib/prisma.ts#L4)
- 実DB確認:
  - `current_user = postgres`
  - `rolbypassrls = true`
- 推奨対応:
  - Prisma 用接続を `postgres` ではなく、必要最小限権限のアプリ専用ロールへ切り替えることを検討
  - 少なくとも「RLS を本体アプリの認可境界として期待しない」前提を明文化し、Server Actions / API 側の認可を主防御線として監査対象にする
  - Supabase 公開 API 側の露出を最小化するため、`anon` / `authenticated` 権限は別途厳格化する

### F-003: ユーザー削除時に Supabase Auth 側が失効せず、削除済みの権限が残留する

- 重大度: High
- 影響: Prisma 上でユーザーを削除しても、Supabase Auth 側のアカウントと `app_metadata.role` が残るため、削除済みの管理者・講師が引き続きログインし、管理画面や管理 API を使える可能性があります。
- 根拠コード:
  - [src/app/admin/actions.ts](/Users/kojok/Desktop/sakanoue/sullivan-web/src/app/admin/actions.ts#L247)
  - [src/lib/auth.ts](/Users/kojok/Desktop/sakanoue/sullivan-web/src/lib/auth.ts#L20)
  - [src/proxy.ts](/Users/kojok/Desktop/sakanoue/sullivan-web/src/proxy.ts#L37)
  - [src/lib/auth-admin.ts](/Users/kojok/Desktop/sakanoue/sullivan-web/src/lib/auth-admin.ts#L205)
- 説明:
  - `deleteUser()` は Prisma の `User` 行だけ削除
  - 一方で `getSession()` / `proxy()` は Supabase の `app_metadata.role` をそのまま権限判定に使う
  - `deleteSupabaseUserByLookup()` は実装済みだが、本削除フローから呼ばれていない
- 推奨対応:
  - ユーザー削除は Prisma と Supabase Auth を一体で失効させる
  - 少なくともセッション構築時に Prisma 側ユーザーの存在確認を追加し、存在しない場合は fail closed でログアウトさせる
  - ロール変更・削除・無効化の整合を管理する単一サービス層に集約する

### F-004: 固定初期パスワード + 予測可能なログインIDにより、初期アカウントの乗っ取り余地がある

- 重大度: High
- 影響: 新規ユーザー作成直後の認証情報が `S0001` / `T0001` 形式の予測可能 ID と `password123` の固定値で組み合わされており、初回パスワード変更前のアカウントを第三者が先に取得できる可能性があります。
- 根拠コード:
  - [src/lib/auth-constants.ts](/Users/kojok/Desktop/sakanoue/sullivan-web/src/lib/auth-constants.ts#L1)
  - [src/lib/user-registration-service.ts](/Users/kojok/Desktop/sakanoue/sullivan-web/src/lib/user-registration-service.ts#L48)
  - [src/lib/user-service.ts](/Users/kojok/Desktop/sakanoue/sullivan-web/src/lib/user-service.ts#L15)
  - [src/proxy.ts](/Users/kojok/Desktop/sakanoue/sullivan-web/src/proxy.ts#L24)
- 説明:
  - `proxy.ts` により初回変更は促されるが、「最初のログイン自体」は防げません
  - つまり強制変更は事後対策であり、初期認証情報の推測耐性不足は解消していません
- 推奨対応:
  - 固定初期パスワードを廃止し、ユーザーごとにランダムなワンタイムパスワードまたは招待リンク方式へ移行
  - ログインIDが外部に見える運用なら、推測しにくい識別子へ変更
  - ログイン試行のレート制限 / ロックアウト / 監査ログも追加

### F-005: Drive watch の秘密情報が anon 可視 DB とログに残っている

- 重大度: High
- 影響: Drive webhook 検証トークンが DB とログから漏れると、Webhook 信頼境界が崩れます。今回の実DBでは `drive_watch_states` に行が存在し、`SET ROLE anon` でも可視で、かつ `token_present` を確認しています。
- 根拠コード:
  - [src/lib/drive-watch-state.ts](/Users/kojok/Desktop/sakanoue/sullivan-web/src/lib/drive-watch-state.ts#L15)
  - [prisma/schema.prisma](/Users/kojok/Desktop/sakanoue/sullivan-web/prisma/schema.prisma#L334)
- 補足:
  - `saveWatchState()` が `state` 全体を `console.log` しており、`token` もそのまま出力されます
- 推奨対応:
  - `drive_watch_states` を public から隔離し、`anon` / `authenticated` 権限を剥奪
  - `token` の平文ログ出力を即時停止
  - 可能なら token は Secret Manager など別経路で保持し、DB には参照IDのみ保存

## Medium

### F-006: Drive watch の状態確認 / 停止 API が公開 Web サービス上で無認証

- 重大度: Medium
- 影響: 本番 Web サービスは `--allow-unauthenticated` で公開されており、`GET /api/drive/watch/setup` は状態情報を返し、`DELETE /api/drive/watch/renew` は watch を停止できます。可用性低下や内部状態の露出につながります。
- 根拠コード:
  - [deploy-web-PRODUCTION.sh](/Users/kojok/Desktop/sakanoue/sullivan-web/deploy-web-PRODUCTION.sh#L191)
  - [src/app/api/drive/watch/setup/route.ts](/Users/kojok/Desktop/sakanoue/sullivan-web/src/app/api/drive/watch/setup/route.ts#L81)
  - [src/app/api/drive/watch/renew/route.ts](/Users/kojok/Desktop/sakanoue/sullivan-web/src/app/api/drive/watch/renew/route.ts#L110)
- 注意:
  - `POST` 側は `INTERNAL_API_SECRET` で保護されていますが、`GET` / `DELETE` には同等の保護がありません
- 推奨対応:
  - これらのエンドポイントを本番から外すか、`verifyInternalApiAuthorization()` を適用
  - もしくは worker/private service 側へ寄せて公開 Web から切り離す

## 参考メモ

- `.env*` は Git 追跡されていませんでした
- Worker サービス自体は [deploy-grading-worker-PRODUCTION.sh](/Users/kojok/Desktop/sakanoue/sullivan-web/deploy-grading-worker-PRODUCTION.sh#L141) で `--no-allow-unauthenticated` になっており、Cloud Tasks OIDC を前提にしています
- そのため、`/api/queue/grading` / `/api/queue/drive-check` の本番 worker 呼び出しは主に Cloud Run IAM 側で保護される設計です

## 優先対応順

1. `anon` / `authenticated` 権限の即時見直しと、未RLSテーブルの遮断
2. `drive_watch_states` の隔離と token ログ停止
3. 削除ユーザーの Supabase Auth 失効と、セッション時の Prisma 実在確認
4. 固定初期パスワード運用の廃止
5. Prisma 接続ロール / RLS 方針の再設計
