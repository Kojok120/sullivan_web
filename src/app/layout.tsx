import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { MainNav } from "@/components/main-nav";
import { GradingNotifier } from "@/components/grading-notifier";
import { LevelUpModal } from "@/components/gamification/level-up-modal";

export const metadata: Metadata = {
  title: "Sullivan",
  description: "Sullivan Learning System",
};

import { getSession } from "@/lib/auth";

// ... imports

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html lang="en">
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
