import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Users, BookOpen, School } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') redirect('/');

    const adminCards = [
        {
            title: 'ユーザー管理',
            description: 'アカウントとグループの管理',
            icon: Users,
            href: '/admin/users',
            color: 'text-primary',
        },
        {
            title: '教室管理',
            description: '教室の追加・削除',
            icon: School,
            href: '/admin/classrooms',
            color: 'text-primary',
        },

        {
            title: 'カリキュラム管理',
            description: 'Unit、CoreProblem、Problemの管理',
            icon: BookOpen,
            href: '/admin/curriculum',
            color: 'text-primary',
        },
        {
            title: '問題管理',
            description: '問題の単独管理・一括登録',
            icon: BookOpen,
            href: '/admin/problems',
            color: 'text-primary',
        },
    ];

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-6 sm:py-10">
                <header className="mb-6 sm:mb-10">
                    <h1 className="text-2xl font-bold text-foreground sm:text-4xl">
                        管理者ダッシュボード
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        ようこそ、{session.name}さん（管理者）
                    </p>
                </header>

                <div className="grid gap-6 md:grid-cols-2">
                    {adminCards.map((card) => {
                        const Icon = card.icon;
                        return (
                            <Link href={card.href} key={card.title} className="block">
                                <Card className="h-full transition-all hover:bg-muted hover:border-foreground/20 cursor-pointer group">
                                    <CardHeader>
                                        <div className="flex items-center gap-3 sm:gap-4">
                                            <div className={`p-3 rounded-lg bg-muted ${card.color}`}>
                                                <Icon className="h-6 w-6 sm:h-8 sm:w-8" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg transition-colors group-hover:text-primary sm:text-2xl">
                                                    {card.title}
                                                </CardTitle>
                                                <CardDescription className="mt-2">
                                                    {card.description}
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground">クリックして管理</p>
                                    </CardContent>
                                </Card>
                            </Link>
                        );
                    })}
                </div>


            </div>
        </div>
    );
}
