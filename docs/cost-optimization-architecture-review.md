# コスト最適化アーキテクチャ調査

更新日: 2026-03-09 (JST)

## 1. 結論

### 1.1 推奨順位

1. **Cloud Run継続 + Supabase(DB/Auth/Realtime/Storage) + Cloud Tasks + Prisma/Postgresロック + Gemini用途別最適化**
2. **Cloud Run + Cloud SQL + Firebase Auth + GCS + Cloud Tasks + Firestore/SSE**
3. **Cloudflare Workers/Containers + R2 + Queues + D1/Durable Objects + OpenAI/Gemini**

### 1.2 1位案を推奨する理由

- 現行コードの制約をほぼ維持したまま、**確実に削れる固定費**は `worker` の常駐費と `Drive + Upstash` の運用面コストである。
- Supabase Pro は **DB / Auth / Realtime / Storage** を 1サービスに集約でき、PoC規模では無料枠・同梱枠が厚い。
- Cloud Tasks は QStash より安く、Google Cloud Run との相性が良い。PoC規模では **最初の 100万リクエストが無料** なので、非同期キューの月額がほぼ消える。
- Supabase Storage に寄せると、Google Drive webhook 更新、watch state 管理、Redis ロックのための外部サービスが不要になる。
- Cloudflare 案は裸の従量単価だけ見ると安いが、現行の **custom server / WebSocket / Puppeteer / Prisma + Postgres** 依存と噛み合わず、移行コストが高すぎる。

### 1.3 採用しない案の理由

- **GCP集約案**:
  - 料金自体は悪くないが、`Auth` と `Realtime` を Supabase から分離するとアプリ実装の変更面が増える。
  - Cloud SQL は最小構成でも固定費が発生し、PoC規模では Supabase Pro の一体型プランに勝ち切りにくい。
- **Cloudflare低単価案**:
  - Workers Paid は安いが、現行の Node サーバー前提と Postgres 前提をほぼ作り直す必要がある。
  - コスト最適化ではなく**再プラットフォーム案件**になる。

## 2. 前提と現行観測

### 2.1 調査前提

- 規模: 小規模 PoC
- 機能: 全機能維持
- 優先軸: 将来スケール重視
- 答案取り込み: Google Drive 維持必須ではなく、アプリ直アップロードへ変更可能
- AI方針: 用途別にモデルを分けて単価最適化する

### 2.2 現行コードから見える制約

- [`server.ts`](../server.ts) は custom HTTP server で `Next.js + ws upgrade` を直接処理している。
- [`src/lib/print-pdf/browser.ts`](../src/lib/print-pdf/browser.ts) は `puppeteer-core + system Chromium` を前提にしている。
- [`worker/server.ts`](../worker/server.ts) は Cloud Run 上の独立 worker を HTTP endpoint として扱う設計で、QStash 署名検証も組み込まれている。
- [`src/lib/prisma.ts`](../src/lib/prisma.ts) は `@prisma/adapter-pg` を使っている。
- [`src/lib/curriculum-service.ts`](../src/lib/curriculum-service.ts) と [`src/lib/classroom-ranking-service.ts`](../src/lib/classroom-ranking-service.ts) には Postgres 前提の `$queryRaw` がある。

### 2.3 現行で最初に削るべきコスト

- [`deploy-grading-worker-PRODUCTION.sh`](../deploy-grading-worker-PRODUCTION.sh) では、worker が `2 vCPU / 4 GiB / concurrency=1 / min-instances=1` で常駐する。
- [`docs/deploy_runbook.md`](./deploy_runbook.md) の例では `min-instances=10` まで引き上げており、この設定を採ると待機費が一気に増える。

Cloud Run の request-based billing で公開されている idle 単価を使うと、待機費は次式になる。

```text
月額待機費
= 30日 × 24時間 × 60分 × 60秒 × (2 vCPU × $0.0000025 + 4 GiB × $0.0000025)
= 約 $38.88 / 月
```

- `min-instances=1`: 約 `$38.88 / 月`
- `min-instances=10`: 約 `$388.80 / 月`

以前の粗い試算 `$32 / $323` より、2026-03-09 時点の公開料金ではやや高い。

## 3. 機能別比較マトリクス

| 項目 | 現行ベースライン | 推奨: Supabase集約 | 代替1: GCP集約 | 代替2: Cloudflare低単価 | 所見 |
| --- | --- | --- | --- | --- | --- |
| Runtime | Cloud Run `web + worker`。`worker` は常駐設定あり | Cloud Run 継続。`worker min=0` を既定化 | Cloud Run 継続 | Workers / Containers へ再配置が必要 | Runtime は Cloud Run 継続が最も安く安全 |
| DB | Supabase Postgres | Supabase Postgres 継続 | Cloud SQL PostgreSQL | D1 / Durable Objects だと Postgres 互換が弱い | Prisma + Postgres 依存が強く、DB 置換メリットは薄い |
| Auth | Supabase Auth SSR | Supabase Auth 継続 | Firebase Auth / Identity Platform | Cloudflare Access だけでは代替不可。別 Auth 必要 | Supabase Auth 維持が最小変更 |
| Realtime | Supabase Realtime | Supabase Realtime 継続 | Firestore listener or SSE 自前 | Durable Objects / WebSocket 自前 | PoC では Supabase Realtime の同梱価値が高い |
| Queue | Upstash QStash | Cloud Tasks | Cloud Tasks | Cloudflare Queues | Cloud Tasks は安く、Cloud Run と自然に接続できる |
| Lock / State | Upstash Redis | Prisma 管理テーブル or Postgres advisory lock | Firestore / Cloud SQL lock | Durable Objects / KV | Drive を外すなら Redis は不要 |
| File Storage | Google Drive + watch/webhook | Supabase Storage + signed upload | GCS + signed URL | R2 | R2 は安いが、Supabase Storage は既存 Auth と密結合できる |
| AI | Gemini Pro preview を広く利用 | Gemini Flash / Flash-Lite / Native Audio に用途別分離 | 同上 | Gemini 継続 or OpenAI 併用 | AI はアーキテクチャよりモデル選定の影響が大きい |
| 移行難度 | - | 低 | 中 | 高 | コストパフォーマンスは「単価」ではなく「単価 × 移行難度」で決まる |

## 4. 月額モデル

### 4.1 前提シナリオ

PoC の代表値を以下で置く。

| 指標 | 仮定 |
| --- | --- |
| MAU | 300 |
| 答案アップロード数 | 1,500 件 / 月 |
| 保存中の答案データ | 平均 20 GB |
| 非同期ジョブ数 | 1,500 件 / 月 |
| 採点モデル単位 | 1件あたり `入力 1,500 tok / 出力 400 tok` |

音声 AI はプレミアム機能で利用時間の分散が大きいため、インフラ月額とは切り離し、トークン単価で別管理する。

### 4.2 固定費

| 案 | 固定費の主因 | 概算 |
| --- | --- | --- |
| 現行 | Supabase Pro `$25` + Cloud Run worker 常駐 `$38.88` | **約 `$63.88 / 月`** |
| 現行 + Drive 専用 Workspace 1席 | 上記 + Google Workspace Business Starter `$7` | **約 `$70.88 / 月`** |
| 現行 + runbook の `min=10` | Supabase Pro `$25` + worker 常駐 `$388.80` + Workspace `$7` | **約 `$420.80 / 月`** |
| 推奨 | Supabase Pro `$25` | **約 `$25 / 月`** |
| GCP集約 | Cloud SQL `db-f1-micro` 相当 `$7.67` から。`g1-small` 相当で `$25.55` | **約 `$7.67` から** |
| Cloudflare低単価 | Workers Paid `$5` | **約 `$5 / 月`** |

補足:

- Cloudflare の `$5` は**現行互換を満たす総額ではない**。Prisma/Postgres/Auth/Realtime/PDF 互換を維持するための再実装費を含んでいない。
- Cloudflare の `$5` は Browser Rendering の超過分、Durable Objects / Containers の超過分、外部 Postgres/Auth の費用も含んでいない。
- GCP集約の Cloud SQL 最小構成は安いが、現行の Supabase が担っている Auth / Realtime / Storage の一体提供を失う。

### 4.3 PoC 規模のインフラ従量

| 項目 | 現行 | 推奨 | GCP集約 | Cloudflare低単価 |
| --- | --- | --- | --- | --- |
| 1,500 async jobs / 月 | QStash 無料枠内に収まる可能性が高いが、成長時は `$1 / 100K` | Cloud Tasks 無料枠内 | Cloud Tasks 無料枠内 | Queues 無料枠内 |
| 20 GB 答案保存 | Workspace 1席の 30 GB に依存 | Supabase Pro の 100 GB に内包 | GCS Tokyo で **約 `$0.46 / 月`** | R2 は最初の 10 GB 無料、残り 10 GB で **約 `$0.15 / 月`** |
| 5M 未満の Realtime | Supabase Pro に内包 | Supabase Pro に内包 | Firestore listener 設計次第で読み取り課金 | Durable Objects / WebSocket 設計次第で CPU 課金 |

PoC 規模では、インフラ従量で大きく効くのは Storage よりも **worker 常駐費** である。

### 4.4 AI の用途別単価

#### 採点 1,000件あたり

前提: `入力 1,500 tok / 出力 400 tok`

| モデル | 概算 |
| --- | --- |
| Gemini 2.5 Pro | **約 `$5.88`** |
| Gemini 2.5 Flash | **約 `$1.45`** |
| Gemini 2.5 Flash-Lite | **約 `$0.31`** |
| GPT-5 mini | **約 `$1.18`** |

#### QR フォールバック 1,000件あたり

前提: `入力 800 tok / 出力 100 tok`

| モデル | 概算 |
| --- | --- |
| Gemini 2.5 Pro | **約 `$2.00`** |
| Gemini 2.5 Flash | **約 `$0.49`** |
| Gemini 2.5 Flash-Lite | **約 `$0.12`** |
| GPT-5 mini | **約 `$0.40`** |

#### チャット 1,000 turn あたり

前提: `入力 800 tok / 出力 250 tok`

| モデル | 概算 |
| --- | --- |
| Gemini 2.5 Pro | **約 `$3.50`** |
| Gemini 2.5 Flash | **約 `$0.87`** |
| Gemini 2.5 Flash-Lite | **約 `$0.18`** |
| GPT-5 mini | **約 `$0.70`** |

解釈:

- 現行の「高性能モデルを広く使う」構成は、PoC でも不要な従量費を生みやすい。
- 採点を `Flash` に落とすだけで、同じ 1,000 件でも **Pro 比で約 75% 削減**できる。
- `Flash-Lite` は QR フォールバックや前処理補助には有力だが、採点本体の第一候補にするには品質検証が必要。
- 音声は Gemini Live 維持が妥当。OpenAI Realtime mini はテキスト系は悪くないが、**音声入出力の単価は Gemini Native Audio より高い**。

### 4.5 成長時の増分単価と閾値

以下の queue 行は、各サービスの**公開 pay-as-you-go 単価**で比較している。無料枠の消費状況や日次偏りは別途考慮が必要。

| 増分 | 現行 | 推奨 | GCP集約 | Cloudflare低単価 |
| --- | --- | --- | --- | --- |
| +100K queue ops / 月 | QStash **約 `$1`** | Cloud Tasks **`$0`** | Cloud Tasks **`$0`** | Queues **`$0`** |
| +1M queue ops / 月 | QStash **約 `$10`** | Cloud Tasks **`$0`** | Cloud Tasks **`$0`** | Queues **`$0`** |
| +10 GB Storage / 月 | Workspace の seat 増設や追加プランで段差が出る | 100 GB を超えた分だけ **約 `$0.21`** | **約 `$0.23`** | 10 GB 無料超過後は **約 `$0.15`** |
| Realtime 5M msg 超 | Supabase Pro 超過で **`$2.50 / 1M msg`** | 同左 | Firestore 読み取り設計次第 | Durable Objects の CPU / message shape 次第 |
| Auth 100K MAU 超 | Supabase Pro 超過で **`$0.00325 / MAU`** | 同左 | Firebase Auth は 50K MAU までは no-cost tier | 別サービス選定が必要 |

PoC から中規模へ伸びる局面で重要なのは、**Queue と Storage の単価**よりも、`Supabase Pro の同梱枠内に Auth / Realtime / Storage をどれだけ収められるか` である。

## 5. 推奨アーキテクチャ

### 5.1 構成

- Runtime:
  - Cloud Run `web`
  - Cloud Run `worker`
  - `worker` は `min-instances=0` を既定
- Data / Auth / Realtime / Storage:
  - Supabase Postgres
  - Supabase Auth
  - Supabase Realtime
  - Supabase Storage
- Async:
  - Cloud Tasks
- Lock / State:
  - Prisma 管理テーブルまたは Postgres advisory lock
- AI:
  - 採点: Gemini 2.5 Flash
  - QR フォールバック: Gemini 2.5 Flash-Lite または Flash
  - チャット: Gemini 2.5 Flash
  - 音声: Gemini Live / Native Audio
  - 品質不足時のみ Pro fallback

### 5.2 この構成で残すもの

- `server.ts` ベースの custom server
- `ws` ベースの Gemini Live 中継
- `puppeteer-core` + Chromium ベースの PDF 処理
- Prisma + Postgres
- Supabase SSR Auth

### 5.3 この構成で削るもの

- Upstash QStash
- Upstash Redis
- Google Drive watch / webhook / renewal 運用
- Drive 依存の channel state 管理
- 「高単価モデルを全用途に使う」AI 設定

## 6. 推奨移行順序

1. **worker 常駐費の是正**
   - `deploy-grading-worker-PRODUCTION.sh` の `min-instances` を `0` に戻す。
   - まず最初に固定費リークを止める。
2. **QStash / Redis の撤去**
   - `publish -> signed webhook` を Cloud Tasks の push queue に置換する。
   - ファイルロックと scan lock は Postgres 側へ寄せる。
3. **Drive 撤去と Storage 直アップロード化**
   - 答案は signed URL 経由で Supabase Storage に直接アップロードする。
   - アップロード完了時にアプリが Cloud Tasks を発行する。
   - webhook renewal と watch state を削除する。
4. **Gemini の用途別最適化**
   - grading / chat / QR / voice のモデルを分離する。
   - Pro fallback は parse failure や confidence 低下時だけに限定する。

## 7. 判断メモ

- **最も安い** だけなら Cloudflare 低単価案が見えるが、これは現行アプリの互換条件を満たした総コストではない。
- Sullivan の場合、PoC で最初に効くのは `Storage 単価` ではなく **常駐 worker とサービス分散の複雑性** の削減である。
- そのため、「Supabase をやめる」より「Supabase に寄せる」ほうが、今のコードベースでは費用対効果が良い。
- Supabase を外す再評価ポイントは次の 3 条件が揃った時でよい。
  - Auth が 100K MAU を安定して超える
  - Realtime が 5M messages / 月を継続超過する
  - Storage が 100 GB を継続超過し、かつ `Drive / Upload / CDN` を別系統に分ける意味が出る

## 8. 公式料金ソース

- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Tasks pricing](https://cloud.google.com/tasks/pricing)
- [Cloud SQL pricing](https://cloud.google.com/sql/pricing)
- [Cloud Storage pricing](https://cloud.google.com/storage/pricing)
- [Google Drive API limits](https://developers.google.com/workspace/drive/api/guides/limits)
- [Google Workspace pricing](https://workspace.google.com/pricing.html)
- [Supabase pricing](https://supabase.com/pricing)
- [Firebase pricing](https://firebase.google.com/pricing)
- [Firebase Authentication limits and pricing](https://firebase.google.com/docs/auth/limits)
- [Upstash QStash pricing](https://upstash.com/pricing/qstash)
- [Upstash Redis pricing](https://upstash.com/pricing/redis)
- [Google AI pricing](https://ai.google.dev/pricing)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/)
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Browser Rendering pricing](https://developers.cloudflare.com/browser-rendering/platform/pricing/)
- [OpenAI API pricing](https://openai.com/api/pricing/)
