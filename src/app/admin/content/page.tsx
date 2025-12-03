import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PrereqManager } from './prereq-manager';

export default async function ContentManagementPage() {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') redirect('/login');

    // Fetch Problems for Prereq Manager
    const problems = await prisma.problem.findMany({
        include: {
            coreProblem: {
                include: {
                    unit: {
                        include: {
                            subject: true,
                        },
                    },
                },
            },
        },
        orderBy: [
            { coreProblem: { unit: { subject: { order: 'asc' } } } },
            { coreProblem: { unit: { order: 'asc' } } },
            { coreProblem: { order: 'asc' } },
            { order: 'asc' },
        ],
    });

    return (
        <div className="container mx-auto py-8 px-4">
            <h1 className="text-3xl font-bold mb-8">コンテンツ管理</h1>

            <Tabs defaultValue="prereqs" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="prereqs">Prereq管理</TabsTrigger>
                </TabsList>

                <TabsContent value="prereqs">
                    <PrereqManager problems={problems} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
