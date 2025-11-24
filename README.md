# Sullivan Learning App

小学4年生〜中高生向けの基礎学習定着化Webアプリケーション。
「つまずき解消」と「学習内容の定着化」を目的とし、忘却曲線に基づいた優先度アルゴリズムと、自己評価による分岐ロジックを搭載しています。

## 技術スタック

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, Shadcn/UI, Framer Motion
- **Backend**: Next.js Server Actions
- **Database**: PostgreSQL, Prisma ORM
- **AI**: Google Gemini API (自動採点・フィードバック生成)
- **Auth**: Custom JWT Auth (jose, bcryptjs)

## 実装済み機能詳細

### 1. 学習セッション (Learning Session)
- **出題ロジック**: 科目(Subject) > 単元(Unit) > 基本問題(CoreProblem) > 類題(Problem) の階層構造に基づき出題。
- **AI採点 & フィードバック**: 記述式回答をGemini APIが自動採点し、即座にフィードバックを提供。
- **自己評価フロー**:
    - 解答後に「完璧(A)」「できた(B)」「不安(C)」「不明(D)」の4段階で自己評価。
    - **A/B評価**: 優先度を下げ（-30/-10）、次の問題へ。
    - **C/D評価**: 解説動画ポップアップを表示。視聴後に優先度を上げ（+10/+30）、次の問題へ。
- **優先度アルゴリズム**: 忘却曲線（経過時間）と自己評価に基づいて、次に出題すべき問題を決定。

### 2. 生徒ダッシュボード
- 学習可能な科目・単元・基本問題の一覧を表示。
- 進捗状況の可視化。
- 弱点克服モード（優先度の高い問題を重点的に学習）。

### 3. 講師ダッシュボード
- **生徒管理**: 生徒一覧の検索・閲覧。
- **学習分析**: 生徒ごとの学習進捗、弱点単元、最近の活動履歴の詳細分析。
- **指導記録**: 生徒ごとの指導記録（面談、指導など）の作成・管理。
- **プロフィール管理**: 生徒の基本情報、志望校、部活動などの管理。

### 4. 管理者ダッシュボード
- **ユーザー管理**: 生徒・講師・保護者・管理者の作成、編集、削除、検索、フィルター。
- **カリキュラム管理**: 科目・単元・基本問題・類題の追加・編集・削除。
- **コンテンツ管理**: 解説動画や前提知識（Prerequisite）の管理。
- **システム設定**: 優先度アルゴリズムのパラメータ調整、AI採点の有効化設定。

### 5. 認証・セキュリティ
- **ロールベースアクセス制御**: ADMIN, TEACHER, STUDENT, PARENT の4つの役割。
- **セキュアな認証**: bcryptによるパスワードハッシュ化、JWTによるセッション管理。

## データ管理

データベースの内容を確認・編集するには **Prisma Studio** が便利です。

```bash
npx prisma studio
```
上記コマンドを実行すると、ブラウザ(`http://localhost:5555`)でデータの閲覧・編集が可能です。

## セットアップ手順 (最新)

1. **依存関係のインストール**:
   ```bash
   npm install
   ```

2. **データベースの準備**:
   PostgreSQL 18を使用します。
   ```bash
   # サービス起動
   brew services start postgresql@18
   
   # データベース作成
   createdb sullivan_db
   ```

3. **環境変数の設定**:
   `.env` ファイルを作成し、以下の変数を設定してください。
   ```env
   # データベース接続文字列
   DATABASE_URL="postgresql://[YOUR_USER_NAME]@localhost:5432/sullivan_db"
   
   # Google Gemini APIキー (AI採点機能用)
   GEMINI_API_KEY="your_gemini_api_key"
   
   # JWT署名用シークレット (任意、未設定時はデフォルト値使用)
   JWT_SECRET="your_secure_random_string"
   ```

4. **マイグレーションとシード**:
   ```bash
   npx prisma migrate dev
   npx prisma db seed
   ```
   ※ シードスクリプトにより、初期ユーザー（管理者、講師、生徒）と学習データ（英語、数学、国語）が投入されます。
   - 管理者: `admin` / `password123`
   - 講師: `teacher` / `password123`
   - 生徒: `student` / `password123`

5. **開発サーバーの起動**:
   ```bash
   npm run dev
   ```

## ディレクトリ構造

- `src/app`: Next.js App Router ページ
    - `(auth)`: 認証関連 (login, signup)
    - `admin`: 管理者機能
    - `teacher`: 講師機能
    - `dashboard`: 生徒ダッシュボード
- `src/components`: UIコンポーネント (Shadcn/UI)
- `src/lib`: ユーティリティ関数、Prismaクライアント、アルゴリズム、Geminiクライアント
- `prisma`: データベーススキーマとマイグレーション
