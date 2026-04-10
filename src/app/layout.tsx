import type { Metadata } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import 'katex/dist/katex.min.css';
import { Toaster } from "@/components/ui/sonner";
import { MainNav } from "@/components/main-nav";
import { GradingNotifier } from "@/components/grading-notifier";
import { LevelUpModal } from "@/components/gamification/level-up-modal";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sullivan",
  description: "Sullivan Learning System",
};

import { getSession } from "@/lib/auth";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html lang="ja" className={`${inter.variable} ${notoSansJP.variable} ${GeistMono.variable}`}>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        <MainNav role={session?.role} />
        {children}
        {session && session.role === 'STUDENT' && (
          <>
            <GradingNotifier />
            <LevelUpModal />
          </>
        )}
        <Toaster />
      </body>
    </html>
  );
}
