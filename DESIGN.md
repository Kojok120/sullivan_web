# Sullivan Design System

AI搭載学習管理システム「Sullivan」のデザインガイドライン。
Calm Design + Strategic Minimalismを基調に、生徒・講師・管理者が集中して使えるUIを定義する。

---

## 1. デザイン哲学

### 原則 1：すべての要素が学習を前進させる（Strategic Minimalism）

画面上のすべての要素は、生徒を学習目標に、講師を指導判断に近づけるために存在する。装飾的なグラデーション、不要なアイコン、飾りのイラストは排除する。余白は注意を集中させるための機能的な要素として扱い、「詰める」より「広げる」方向で判断する。

### 原則 2：AIは透明であること（Invisible AI）

SullivanはAIで問題選定・採点・フィードバック生成を行うが、AIの存在を誇示しない。「AI搭載」「AI分析中」のようなバッジやラベルは使わない。AIの提案はインターフェースに自然に溶け込み、ツール自体が賢いかのように振る舞う。チャットバブルやロボットアイコンは避ける。

### 原則 3：情報の階層はタイポグラフィで導く（Typography-driven Hierarchy）

色やアイコンではなく、文字の大きさ・太さ・濃淡で情報の優先順位を伝える。生徒の進捗、講師の指導記録、管理画面の分析データ — いずれも最も重要な情報が最初に目に入るよう、タイポグラフィで視線を自然にガイドする。

---

## 2. カラーシステム

ロゴのティール（青緑）をブランドカラーの起点とし、3層のカラーシステムで構成する。

### 2.1 ベースカラー（画面の90%以上）

温かみのあるStone系グレーを採用し、教育プロダクトとしての親しみやすさを出す。

| トークン | 用途 | HEX値 | Tailwind |
|---|---|---|---|
| `--background` | メイン背景 | `#FAFAF9` | `stone-50` |
| `--card` | カード・セクション背景 | `#FFFFFF` | `white` |
| `--muted` | ホバー・選択・サブ背景 | `#F5F5F4` | `stone-100` |
| `--border` | 区切り線・カード境界 | `#E7E5E4` | `stone-200` |
| `--foreground` | 本文・見出し | `#1C1917` | `stone-900` |
| `--muted-foreground` | 補足テキスト | `#78716C` | `stone-500` |
| テキスト tertiary | プレースホルダー・無効 | `#A8A29E` | `stone-400` |

### 2.2 セマンティックカラー（ステータス・フィードバック用）

| トークン | 用途 | HEX値 |
|---|---|---|
| `--status-success` | 正解・完了・達成 | `#16A34A`（Green 600） |
| `--status-warning` | 警告・注意・要確認 | `#D97706`（Amber 600） |
| `--status-error` | 不正解・エラー・危険 | `#DC2626`（Red 600） |
| `--status-info` | 情報・進行中 | `#2563EB`（Blue 600） |
| `--status-neutral` | 未着手・無効 | `#A8A29E`（Stone 400） |

### 2.3 アクセントカラー（ブランド + CTA用）

ロゴのティールを起点とした、落ち着きと信頼感のあるアクセントカラー。

| トークン | 用途 | HEX値 |
|---|---|---|
| `--primary` | CTAボタン、アクティブ状態、リンク | `#0D9488`（Teal 600） |
| `--primary-hover` | ホバー状態 | `#0F766E`（Teal 700） |
| `--accent` | 薄い背景（選択中の要素等） | `#F0FDFA`（Teal 50） |
| `--ring` | フォーカスリング | `#0D9488`（Teal 600） |

### 2.4 教科カラー（Subject Colors）

教科の識別に使用する固有カラー。タグ・バッジ・プリント見出しに限定して使用。

| 教科 | 背景色 | ホバー | 用途 |
|---|---|---|---|
| 英語 (E) | `#F97316`（Orange 500） | `#EA580C`（Orange 600） | 教科タグ、プリントヘッダー |
| 数学 (M) | `#3B82F6`（Blue 500） | `#2563EB`（Blue 600） | 教科タグ、プリントヘッダー |
| 国語 (J) | `#22C55E`（Green 500） | `#16A34A`（Green 600） | 教科タグ、プリントヘッダー |

### 2.5 チャートカラー

データ可視化用。5色まで。

| トークン | HEX値 | 用途 |
|---|---|---|
| `--chart-1` | `#0D9488` | メイン指標（ブランドカラー） |
| `--chart-2` | `#16A34A` | 成功・達成系 |
| `--chart-3` | `#D97706` | 警告・注意系 |
| `--chart-4` | `#DC2626` | エラー・不正解系 |
| `--chart-5` | `#3B82F6` | 情報・比較系 |

### 2.6 カラー運用ルール

- ベースカラーが画面の90%以上を占めること
- セマンティックカラーはステータス表示のみ。装飾には使わない
- アクセントカラーはユーザーの次のアクションを示す箇所にのみ使用
- 教科カラーは教科タグ・バッジ・プリント見出しにのみ使用。広い面積に塗らない
- **色だけで情報を伝えない**。必ずテキストラベルまたはアイコンを併用（WCAG 2.2準拠）
- テキストとのコントラスト比は最低4.5:1（WCAG AA）を確保

---

## 3. タイポグラフィ

### 3.1 フォント

| 用途 | フォント | 選定理由 |
|---|---|---|
| UI全般（欧文） | **Inter** | 可読性、Tailwind互換性、Linear/Vercel等での実績 |
| UI全般（日本語） | **Noto Sans JP** | Interとの相性、ウェイトの豊富さ、無料 |
| 数値・コード | **Geist Mono** | tabular-numsで数字幅が揃う、Vercel製 |

### 3.2 タイプスケール

| レベル | サイズ | ウェイト | Tailwind | 用途 |
|---|---|---|---|---|
| Display | 30px / 1.875rem | Bold (700) | `text-3xl font-bold` | ページタイトル |
| Heading 1 | 24px / 1.5rem | Semibold (600) | `text-2xl font-semibold` | セクション見出し |
| Heading 2 | 20px / 1.25rem | Semibold (600) | `text-xl font-semibold` | カードタイトル |
| Heading 3 | 16px / 1rem | Semibold (600) | `text-base font-semibold` | サブセクション |
| Body | 14px / 0.875rem | Regular (400) | `text-sm` | 本文 |
| Caption | 12px / 0.75rem | Regular (400) | `text-xs` | 補足情報、ラベル |
| Mono | 14px / 0.875rem | Regular (400) | `text-sm font-mono` | 数値、コード |

### 3.3 タイポグラフィ運用ルール

- 見出しと本文の間には最低16px（`space-4`）のマージン
- 1行の文字数：日本語35〜45文字、英語60〜75文字
- 太字（Bold, 700）はDisplay見出しのみ。それ以下の見出しはSemibold（600）
- 本文中の強調はSemibold（600）。Boldは使わない
- 数値には`tabular-nums`を適用（`font-variant-numeric: tabular-nums`）
- 点数・正答率などの学習データは Mono フォントで表示

---

## 4. スペーシングとレイアウト

### 4.1 8pxグリッド

| トークン | 値 | 用途 |
|---|---|---|
| `space-1` | 4px | アイコンとラベルの間 |
| `space-2` | 8px | テキスト間の最小マージン |
| `space-3` | 12px | コンパクトな要素間 |
| `space-4` | 16px | カード内パディング |
| `space-5` | 24px | セクション間 |
| `space-6` | 32px | 大きなセクション区切り |
| `space-8` | 48px | ページレベルの区切り |
| `space-10` | 64px | メインコンテンツの上下余白 |

### 4.2 レスポンシブブレークポイント

| ブレークポイント | 幅 | レイアウト |
|---|---|---|
| Desktop | >= 1024px | サイドバー + メインの2カラム |
| Tablet | 768px〜1023px | サイドバー折りたたみ、1カラム |
| Mobile | < 768px | 完全1カラム、タブバーナビゲーション |

### 4.3 コンテンツ幅

| 用途 | 最大幅 | Tailwind |
|---|---|---|
| ページコンテンツ | 1200px | `max-w-7xl` |
| フォーム・設定 | 640px | `max-w-xl` |
| ダイアログ | 480px | `max-w-md` |

---

## 5. コンポーネントスタイル

### 5.1 共通ルール

- **影（box-shadow）は使わない**。ボーダーで領域を区切る。影は視覚的な重みを生み、Calm Designに反する
- **角丸は8px（`rounded-lg`）を標準**。ボタンは6px（`rounded-md`）。丸すぎるとカジュアルになりすぎる
- **ホバー時の変化は控えめに**。背景色の微妙な変化 + ボーダー色の濃度アップ程度

### 5.2 カード

```
背景: white (--card)
ボーダー: 1px solid var(--border)
角丸: 8px (rounded-lg)
影: なし
パディング: 16px (p-4)
ホバー: bg-muted + border色をやや濃く
ステータス表示: 左端に4pxの縦ラインでステータスカラー
```

```tsx
// 基本カード
<div className="rounded-lg border bg-card p-4">
  ...
</div>

// ホバー可能なカード（リスト項目等）
<div className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted">
  ...
</div>

// ステータス付きカード
<div className="rounded-lg border bg-card p-4 border-l-4 border-l-status-success">
  ...
</div>
```

### 5.3 ボタン

| タイプ | スタイル | 用途 |
|---|---|---|
| Primary | `--primary`背景 + 白テキスト。角丸6px | 主要アクション（プリント生成、保存） |
| Secondary | 白背景 + `--border` + `--foreground` | 補助アクション（キャンセル、戻る） |
| Ghost | 背景なし + `--muted-foreground`。ホバー時`--muted`背景 | 控えめなアクション（フィルター切替） |
| Danger | `--status-error`背景 + 白テキスト | 破壊的アクション（削除）。確認ダイアログ必須 |

- ボタン高さ: 36px（標準 `h-9`）、44px（モバイルタッチターゲット `h-11`）
- アイコン付きボタン: アイコンは左配置、`gap-2`でテキストと間隔

### 5.4 テーブル

```
ヘッダー: bg-muted、text-muted-foreground、font-semibold、text-xs uppercase
行: border-b
ホバー: bg-muted/50
数値セル: font-mono、tabular-nums、右寄せ
```

### 5.5 バッジ / タグ

```
教科タグ: 教科カラー背景 + 白テキスト、rounded-md、px-2 py-0.5、text-xs font-semibold
ステータスバッジ: セマンティックカラーの薄い背景 + 濃いテキスト、rounded-md
```

### 5.6 フォーム

```
Input高さ: 40px (h-10)
背景: white
ボーダー: 1px solid var(--border)
角丸: 6px (rounded-md)
フォーカス: ring-2 ring-primary/20 border-primary
ラベル: text-sm font-medium、input上に配置、mb-1.5
エラー: border-status-error + text-status-error のメッセージ
```

### 5.7 ナビゲーション

```
サイドバー（Desktop）:
  幅: 240px
  背景: var(--background)
  ボーダー: 右辺に1px solid var(--border)
  アクティブ項目: bg-accent + text-primary font-semibold
  非アクティブ項目: text-muted-foreground、ホバー時bg-muted

モバイルボトムタブ:
  高さ: 56px + safe-area-inset-bottom
  背景: white
  アクティブ: text-primary + アイコン太め
  非アクティブ: text-muted-foreground
```

### 5.8 ダイアログ / モーダル

```
オーバーレイ: bg-black/50
コンテンツ: bg-card、rounded-lg、border、p-6
最大幅: max-w-md (480px)
タイトル: text-lg font-semibold
アクションボタン: 右下配置、gap-2
```

### 5.9 Empty State

```
テキスト中心。イラストは使わない。
構成: アイコン(24px, text-muted-foreground) + タイトル(font-semibold) + 説明(text-muted-foreground) + CTAボタン
中央寄せ、py-12
```

### 5.10 AIサジェスション

```
背景: var(--muted)
左端に2pxの var(--primary) ライン
テキスト: var(--muted-foreground)（控えめ）
「AIが分析しました」のようなラベルは付けない
提案内容をそのまま表示
```

### 5.11 学習データ表示

```
正答率・点数: font-mono text-2xl font-bold tabular-nums
ラベル: text-xs text-muted-foreground uppercase
進捗バー: h-2 rounded-full bg-muted、fill部分はvar(--primary)
```

### 5.12 達成・ゲーミフィケーション要素

```
レベル表示: font-mono font-bold、控えめなサイズ
達成バッジ: ボーダー付きカード内にアイコン + テキスト。派手な装飾は避ける
XP表示: font-mono text-sm、text-muted-foreground
ストリーク: 数値 + 日数ラベル。炎アイコンはtext-muted-foregroundで控えめに
```

---

## 6. アイコン

### 6.1 ライブラリ

**Lucide Icons**（`lucide-react`）
- 1.5pxストローク幅のLinearスタイル
- React対応、オープンソース

### 6.2 運用ルール

- アイコンは必ずテキストラベルとセットで使用（ナビゲーションのツールチップ含む）
- サイズ: 16px（インライン）、20px（標準）、24px（ナビゲーション）
- カラー: `text-muted-foreground`。アクティブ時 `text-foreground`
- イラスト・装飾画像は原則使わない。Empty Stateはテキスト + アクションボタンで対応

---

## 7. アニメーションとトランジション

### 7.1 基本方針

アニメーションは「存在に気づかないレベル」で使用する。状態変化を自然に伝える目的のみ。

| 対象 | duration | easing |
|---|---|---|
| ホバー・フォーカス | 150ms | ease-out |
| 展開/折りたたみ | 200ms | ease-in-out |
| ページ遷移 | 0ms（即時） | -- |
| トースト通知 | 200ms | ease-out |

### 7.2 許容するアニメーション

- ホバー時の背景色変化（`transition-colors duration-150`）
- アコーディオンの展開/折りたたみ
- トースト通知のスライドイン
- スケルトンスクリーンのパルス（ローディング時）
- プログレスバーの幅変化

### 7.3 禁止事項

- バウンス、スプリング等のplayfulなイージング
- フェードイン/スライドインでの要素出現（即時表示）
- 回転・スケールを使ったアテンションアニメーション
- レベルアップ時の派手なエフェクト（控えめなトースト通知で十分）

---

## 8. やらないことリスト

| やらないこと | 理由 |
|---|---|
| グラデーション背景 | Calm Designに反する |
| AI/ロボットのアイコン・イラスト | AIは透明であるべき |
| 「AIが分析中」バッジ・ラベル | AIは透明であるべき |
| カード上の影（box-shadow） | 視覚的な重さを生む。ボーダーで代替 |
| 12px以上の角丸 | カジュアルすぎる。最大8px |
| 「さあ始めよう!」系のカジュアルコピー | プロフェッショナルなトーンを維持 |
| 複雑なチャート（必要時以外） | シンプルな数値表示で十分な場合が多い |
| ダークモードのネオンカラー | 開発者ツール的な印象 |
| 教科カラーの広面積使用 | タグ・バッジの識別用途に限定 |
| 点数・正答率への過度な色分け | 数値そのものが情報。色は補助 |

---

## 9. デザインリファレンス

デザイン判断に迷ったとき、以下のプロダクトを参照する。

| プロダクト | 参照ポイント |
|---|---|
| **Linear** | Calm Design全体。余白。タイポグラフィ中心の情報階層。暖かみのあるグレー |
| **Vercel** | 極限まで削ぎ落としたカラーパレット。余白の広さが生む品質感 |
| **Notion** | AIの透明な統合。機能の豊富さを感じさせないシンプルUI |
| **Stripe Dashboard** | アクセシブルなカラーシステム。数値表示のタイポグラフィ |
| **Duolingo（構造のみ）** | 学習進捗の見せ方。ただし装飾的なスタイルは参考にしない |

---

## 10. 実装用デザイントークン

### 10.1 globals.css（CSS Custom Properties）

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: "Inter", "Noto Sans JP", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, SFMono-Regular, monospace;
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  --radius: 0.5rem; /* 8px */

  /* --- Base Colors (Stone) --- */
  --background: #FAFAF9;
  --foreground: #1C1917;
  --card: #FFFFFF;
  --card-foreground: #1C1917;
  --popover: #FFFFFF;
  --popover-foreground: #1C1917;
  --muted: #F5F5F4;
  --muted-foreground: #78716C;

  /* --- Accent (Teal) --- */
  --primary: #0D9488;
  --primary-foreground: #FFFFFF;
  --secondary: #FFFFFF;
  --secondary-foreground: #0D9488;
  --accent: #F0FDFA;
  --accent-foreground: #0D9488;

  /* --- Feedback --- */
  --destructive: #DC2626;
  --destructive-foreground: #FFFFFF;

  /* --- Border & Input --- */
  --border: #E7E5E4;
  --input: #E7E5E4;
  --ring: #0D9488;

  /* --- Chart --- */
  --chart-1: #0D9488;
  --chart-2: #16A34A;
  --chart-3: #D97706;
  --chart-4: #DC2626;
  --chart-5: #3B82F6;

  /* --- Sidebar --- */
  --sidebar: #FAFAF9;
  --sidebar-foreground: #1C1917;
  --sidebar-primary: #0D9488;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #F0FDFA;
  --sidebar-accent-foreground: #0D9488;
  --sidebar-border: #E7E5E4;
  --sidebar-ring: #0D9488;
}

.dark {
  --background: #1C1917;
  --foreground: #FAFAF9;
  --card: #292524;
  --card-foreground: #FAFAF9;
  --popover: #292524;
  --popover-foreground: #FAFAF9;
  --muted: #292524;
  --muted-foreground: #A8A29E;
  --primary: #2DD4BF;
  --primary-foreground: #1C1917;
  --secondary: #292524;
  --secondary-foreground: #FAFAF9;
  --accent: #292524;
  --accent-foreground: #FAFAF9;
  --destructive: #EF4444;
  --destructive-foreground: #FFFFFF;
  --border: #44403C;
  --input: #44403C;
  --ring: #2DD4BF;
  --chart-1: #2DD4BF;
  --chart-2: #4ADE80;
  --chart-3: #FBBF24;
  --chart-4: #F87171;
  --chart-5: #60A5FA;
  --sidebar: #1C1917;
  --sidebar-foreground: #FAFAF9;
  --sidebar-primary: #2DD4BF;
  --sidebar-primary-foreground: #1C1917;
  --sidebar-accent: #292524;
  --sidebar-accent-foreground: #FAFAF9;
  --sidebar-border: #44403C;
  --sidebar-ring: #2DD4BF;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground overflow-x-hidden;
  }
}

@layer utilities {
  .pt-safe {
    padding-top: env(safe-area-inset-top, 0px);
  }
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
```

### 10.2 フォント読み込み（layout.tsx）

```tsx
import { Inter } from "next/font/google";
import { Noto_Sans_JP } from "next/font/google";
import localFont from "next/font/local";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});
```

### 10.3 変更点サマリ（現行 → 新）

| 項目 | 現行 | 新 |
|---|---|---|
| アクセントカラー | Indigo 600 (`#4F46E5`) | Teal 600 (`#0D9488`) |
| ベースグレー | Gray（青寄り） | Stone（暖かい） |
| 角丸 `--radius` | 12px (`0.75rem`) | 8px (`0.5rem`) |
| フォント（欧文） | システムフォント | Inter |
| フォント（日本語） | システムフォント | Noto Sans JP |
| カード影 | `shadow-sm` | なし（ボーダーのみ） |
| 背景色 | `#F9FAFB` (Gray 50) | `#FAFAF9` (Stone 50) |
| テキスト色 | `#111827` (Gray 900) | `#1C1917` (Stone 900) |
