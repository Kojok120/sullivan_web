import { getSubjects, getSubject } from "./actions";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { subject: selectedSubjectId } = await searchParams;

  // If no subject is selected, show subject selection
  if (!selectedSubjectId) {
    const subjects = await getSubjects();

    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12 max-w-5xl">
          <header className="mb-12 text-center">
            <h1 className="text-4xl font-bold text-foreground tracking-tight mb-4">
              科目を選択
            </h1>
            <p className="text-lg text-muted-foreground">
              ようこそ、<span className="font-medium text-foreground">{session.name}</span>さん
            </p>
          </header>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {subjects.map((subject) => (
              <Link href={`/?subject=${subject.id}`} key={subject.id} className="block group">
                <Card className="h-full transition-all hover:shadow-lg hover:border-primary/50 cursor-pointer group-hover:-translate-y-1">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-2xl group-hover:text-primary transition-colors">
                      {subject.name}
                      <ArrowRight className="h-6 w-6 text-primary opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                    </CardTitle>
                    <CardDescription>
                      {subject.name}の学習を始めましょう
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-primary/80 transition-colors">
                      <BookOpen className="h-4 w-4" />
                      <span>Unitを選択</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // If subject is selected, show units and core problems
  const currentSubject = await getSubject(selectedSubjectId);
  const coreProblems = currentSubject?.coreProblems || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <header className="mb-12 text-center sm:text-left">
          <div className="flex items-center gap-4 mb-4 justify-center sm:justify-start">
            <Link href="/" className="text-primary hover:text-primary/80 text-sm font-medium flex items-center gap-1 transition-colors">
              <ArrowRight className="rotate-180 h-4 w-4" /> 科目選択に戻る
            </Link>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
            {currentSubject?.name || '学習コンテンツ'}
          </h1>
          <p className="mt-3 text-muted-foreground text-lg">
            ようこそ、<span className="font-medium text-foreground">{session.name}</span>さん
          </p>
        </header>

        {coreProblems.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-muted rounded-full">
                <BookOpen size={32} className="text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold">コンテンツがありません</h3>
              <p className="text-muted-foreground">
                この科目にはまだ問題が登録されていません。
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {coreProblems.map((cp) => (
              <Link href={`/practice/${cp.id}`} key={cp.id} className="block group">
                <Card className="h-full transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group-hover:-translate-y-1">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-lg group-hover:text-primary transition-colors">
                      {cp.name}
                      <ArrowRight className="h-5 w-5 text-primary opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                    </CardTitle>
                    <CardDescription>
                      基礎を固めてステップアップ
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-primary/80 transition-colors">
                      <BookOpen className="h-4 w-4" />
                      <span>学習を始める</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
