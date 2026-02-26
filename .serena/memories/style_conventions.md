# コーディング規約
- コメント/ドキュメントは日本語。
- コミットメッセージは Conventional Commits 1.0.0（日本語、絵文字なし、末尾句点なし）。
- DBアクセスは Prisma 経由。データ操作は原則 Server Actions（"use server"）。
- Server Actions ではセッション検証とロールチェック必須。
- RSC をデフォルト、必要箇所のみ "use client"。
- UI は shadcn/ui + Radix UI、フォームは react-hook-form + zod。