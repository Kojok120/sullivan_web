import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { BulkProblemEditor } from '../../components/bulk-problem-editor';

export default async function BulkAddPage({
    params,
}: {
    params: Promise<{ coreProblemId: string }>;
}) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') redirect('/login');

    const { coreProblemId } = await params;

    const coreProblem = await prisma.coreProblem.findUnique({
        where: { id: coreProblemId },
        include: {
            subject: true
        }
    });

    if (!coreProblem) {
        notFound();
    }

    return (
        <div className="container mx-auto py-10 px-4">
            <BulkProblemEditor
                coreProblemId={coreProblem.id}
                subjectName={coreProblem.subject.name}
            />
        </div>
    );
}
