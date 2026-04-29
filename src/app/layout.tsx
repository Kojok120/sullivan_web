import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Noto_Sans_JP } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import 'katex/dist/katex.min.css';
import { Toaster } from "@/components/ui/sonner";
import { MainNav } from "@/components/main-nav";
import { StudentRealtimeEvents } from "@/components/student-realtime-events";
import { getSession } from "@/lib/auth";

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

function shouldRenderGlobalChrome(pathname: string) {
  return !(
    pathname.startsWith("/admin")
    || pathname.startsWith("/materials")
    || pathname.startsWith("/login")
    || pathname.startsWith("/signup")
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pathname") ?? "";
  const chromeEnabledByPath = pathname === "" ? true : shouldRenderGlobalChrome(pathname);
  const session = chromeEnabledByPath ? await getSession() : null;
  const shouldRenderMainNav = chromeEnabledByPath && session?.role !== "MATERIAL_AUTHOR";

  return (
    <html lang="ja" className={`${inter.variable} ${notoSansJP.variable} ${GeistMono.variable}`}>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        {shouldRenderMainNav ? <MainNav role={session?.role} /> : null}
        {children}
        {chromeEnabledByPath && session?.role === 'STUDENT' && (
          <StudentRealtimeEvents />
        )}
        <Toaster />
      </body>
    </html>
  );
}
