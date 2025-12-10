import { getSession, logout } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Users, BookOpen, Video, Settings, School } from "lucide-react";

export default async function AdminDashboard() {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') redirect('/');

    const adminCards = [
        {
            title: 'ユーザー管理',
            description: 'アカウントとグループの管理',
            icon: Users,
            href: '/admin/users',
            color: 'text-blue-600',
        },
        {
            title: '教室管理',
            description: '教室の追加・削除',
            icon: School,
            href: '/admin/classrooms',
            color: 'text-indigo-600',
        },

        {
            title: 'カリキュラム管理',
            description: 'Unit、CoreProblem、Problemの管理',
            icon: BookOpen,
            href: '/admin/curriculum',
            color: 'text-green-600',
        },
        {
            title: 'システム設定',
            description: '出題ロジックとパラメータの設定',
            icon: Settings,
            href: '/admin/settings',
            color: 'text-orange-600',
        },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 py-12">
                <header className="mb-10">
                    <h1 className="text-4xl font-extrabold text-gray-900">
                        管理者ダッシュボード
                    </h1>
                    <p className="mt-2 text-gray-600">
                        ようこそ、{session.name}さん（管理者）
                    </p>
                </header>

                <div className="grid gap-6 md:grid-cols-2">
                    {adminCards.map((card) => {
                        const Icon = card.icon;
                        return (
                            <Link href={card.href} key={card.title} className="block">
                                <Card className="h-full transition-all hover:shadow-lg hover:border-gray-400 cursor-pointer group">
                                    <CardHeader>
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-lg bg-gray-100 ${card.color}`}>
                                                <Icon className="h-8 w-8" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-2xl group-hover:text-blue-600 transition-colors">
                                                    {card.title}
                                                </CardTitle>
                                                <CardDescription className="mt-2">
                                                    {card.description}
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-gray-500">クリックして管理</p>
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
