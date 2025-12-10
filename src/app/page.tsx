import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionList } from "./dashboard/components/session-list";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">
          学習履歴
        </h1>
        <p className="text-muted-foreground">
          {session.name}さんのこれまでの学習記録です
        </p>
      </header>

      <SessionList userId={session.userId} />
    </div>
  );
}
