import type { ReactNode } from 'react';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSession, isTeacherOrAdmin } from '@/lib/auth';
import { canAccessUserWithinClassroomScope } from '@/lib/authorization';
import { prisma } from '@/lib/prisma';
import { getTranslations } from 'next-intl/server';

import { StudentDetailTabs } from './student-detail-tabs';

export default async function TeacherStudentDetailLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ userId: string }>;
}) {
    const session = await getSession();
    if (!isTeacherOrAdmin(session)) {
        redirect('/login');
    }
    const t = await getTranslations('TeacherStudentDetailLayout');

    const { userId } = await params;

    if (session.role !== 'ADMIN') {
        const canAccess = await canAccessUserWithinClassroomScope({
            actorUserId: session.userId,
            actorRole: session.role,
            targetUserId: userId,
        });

        if (!canAccess) {
            redirect('/teacher');
        }
    }

    const student = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            role: true,
            name: true,
            loginId: true,
            group: true,
        },
    });

    if (!student || student.role !== 'STUDENT') {
        notFound();
    }

    return (
        <div className="container mx-auto space-y-6 px-4 py-6 sm:space-y-8 sm:py-8">
            <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/teacher" aria-label={t('back')} title={t('back')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <div className="min-w-0">
                    <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold sm:text-3xl">
                        {student.name || student.loginId}
                        {student.group ? <Badge variant="outline">{student.group}</Badge> : null}
                    </h1>
                    <p className="text-muted-foreground">{t('description')}</p>
                </div>
            </div>

            <div className="space-y-4">
                <StudentDetailTabs userId={student.id} />
                {children}
            </div>
        </div>
    );
}
