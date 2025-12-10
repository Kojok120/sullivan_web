# Sullivan Learning App

小学4年生〜中高生向けの基礎学習定着化Webアプリケーション。
「つまずき解消」と「学習内容の定着化」を目的とし、忘却曲線に基づいた優先度アルゴリズムと、AI自動採点によるフィードバック機能を搭載しています。

## 技術スタック

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, Shadcn/UI, Framer Motion
- **Backend**: Next.js Server Actions
- **Database**: PostgreSQL, Prisma ORM
- **AI**: Google Gemini API (自動採点・フィードバック生成・スキャン解析)
- **Infrastructure**: Google Drive API (答案スキャン連携)
- **Auth**: Custom JWT Auth (jose, bcryptjs)

## 実装済み機能詳細

### 1. 学習カリキュラム構造
- **階層構造**: 科目(Subject) > 基本問題(CoreProblem) > 類題(Problem)
    - 以前の「単元(Unit)」は廃止され、よりシンプルな構造になりました。
    - 各CoreProblemは複数の類題(Problem)を持ち、類題を解くことでCoreProblemの理解度を判定します。

### 2. 学習フロー (プリント学習 & AIスキャン採点)
本アプリケーションは、紙のプリント学習とAI採点を中心とした学習サイクルを提供します。

- **プリント出力**: 生徒ごとに個別最適化された問題セット（QRコード付き）を印刷可能。
- **スキャン連携**: 解答用紙をスキャンしてGoogle Driveにアップロードすると、システムが自動検知。
- **AI自動採点**:
    - Gemini APIが手書き文字を認識し、正誤判定と記述評価(A-D)を行います。
    - 生徒への日本語フィードバックも自動生成。
    - **弱点分析**: 間違いの原因となった可能性があるCoreProblemをAIが推測し、関連するCoreProblemの優先度を自動的に引き上げます。

### 3. 優先度アルゴリズム (Spaced Repetition)
- **ハイブリッドロジック**:
    - **忘却曲線**: 最終学習日からの経過時間に基づく優先度上昇。
    - **成績連動**: AI採点の結果(A-D)に基づき優先度を加減。
        - 正解/高評価 → 優先度を下げる（定着済み）。
        - 不正解/低評価 → 優先度を上げる（要復習）。
    - **CoreProblem連携**: 類題の失敗が、親となるCoreProblem（概念）の優先度にも波及する仕組み。

### 4. ダッシュボード機能
- **生徒ダッシュボード**:
    - 今やるべき問題（推奨問題）の提示。
    - 学習進捗（アンロック状況）の可視化。
    - 連続学習日数（ストリーク）の表示。
- **講師ダッシュボード**:
    - **詳細分析**: 生徒ごとの弱点、進捗、最近の活動履歴を一元管理。
    - **一括管理**: 学年やグループごとの生徒検索・フィルタリング。
    - **指導記録**: 面談や指導の履歴管理。

### 5. 管理者機能
- **ユーザー管理**: 生徒・講師・保護者の作成・編集。
- **カリキュラム管理**: 
    - CSVインポートによる問題の一括登録。
    - ドラッグ＆ドロップによる順序並べ替え。
- **システム設定**: AI採点のパラメータ調整など。

## セットアップ手順 (最新)

### 1. 依存関係のインストール
```bash
npm install
```

### 2. データベースの準備
PostgreSQL 18を使用します。
```bash
brew services start postgresql@18
createdb sullivan_db
```

### 3. 環境変数の設定
`.env` ファイルを作成し、以下の変数を設定してください。

```env
# Database
DATABASE_URL="postgresql://[USER]@localhost:5432/sullivan_db"

# AI & Grading
GEMINI_API_KEY="your_gemini_api_key_here"

# Google Drive Integration (for Scan Grading)
# 答案スキャンフォルダのID
DRIVE_FOLDER_ID="your_google_drive_folder_id"

# Auth
JWT_SECRET="your_secure_random_string"
```

**Google Cloud Service Account**:
`service-account.json` をプロジェクトルートに配置してください（Google Drive APIへのアクセス権限が必要です）。

### 4. マイグレーションとシード
```bash
npx prisma migrate dev
npx prisma db seed
```
初期アカウント:
- 管理者: `admin` / `password123`
- 講師: `teacher` / `password123`
- 生徒: `student` / `password123`

### 5. 開発サーバーの起動
```bash
npm run dev
```

## ディレクトリ構造

- `src/app`: Next.js App Router
- `src/lib`:
    - `grading-service.ts`: AI採点・Google Drive連携ロジック (Lazy Init対応)
    - `priority-algo.ts`: 優先度算出ロジック
    - `analytics.ts`: 学習統計・分析ロジック
- `prisma`: スキーマ定義 (`schema.prisma`)
- `scripts`: ユーティリティスクリプト (シード、整合性チェックなど)
