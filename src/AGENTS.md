# src/ ソースコード エージェント指示

## ディレクトリ構造

```
src/
├── app/           # Next.js App Router（ページ、ルーティング、Server Actions）
│   ├── (auth)/    # 認証ページ（ログイン等）
│   ├── admin/     # 管理者機能
│   ├── teacher/   # 講師機能
│   ├── dashboard/ # 生徒ダッシュボード
│   ├── api/       # API Routes
│   └── actions.ts # 共通 Server Actions
├── components/    # UIコンポーネント
│   └── ui/        # shadcn/ui 基本コンポーネント
└── lib/           # コアビジネスロジック・ユーティリティ
```

## コンポーネント設計規約

### Server Components vs Client Components
- **デフォルトは Server Component**（`"use client"` を付けない）
- `"use client"` は以下の場合のみ使用:
  - `useState`, `useEffect` 等の React Hook を使用する場合
  - ブラウザ API にアクセスする場合
  - イベントハンドラ（`onClick` 等）を使用する場合

### Server Actions
- ファイル先頭に `"use server"` を宣言
- 必ず `getCurrentUser()` でセッション検証を行う
- ロールチェック: `user.app_metadata.role` を確認
- エラーは `try/catch` で適切に処理し、ユーザーフレンドリーなメッセージを返す

### UIコンポーネント
- shadcn/ui + Radix UI をベースに構築
- スタイリングは Tailwind CSS v4
- フォームは `react-hook-form` + `zod` バリデーション
- トースト通知は `sonner` を使用
- アニメーションは `framer-motion` を使用

### 認証フロー
- `src/lib/auth.ts` の `getCurrentUser()` でセッション取得
- `src/middleware.ts` でルート保護とセッション更新
- Supabase Auth (SSR) — `@supabase/ssr` を使用
- ロール: STUDENT, TEACHER, HEAD_TEACHER, PARENT, ADMIN
