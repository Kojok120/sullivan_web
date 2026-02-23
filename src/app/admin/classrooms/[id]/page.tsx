import { getClassroom } from '../actions';
import { notFound, redirect } from 'next/navigation';
import { ClassroomDetail } from './classroom-detail';
import { getSession } from '@/lib/auth';

export default async function ClassroomDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
        redirect('/login');
    }

    const classroom = await getClassroom(id);
    const canEditPlan = session.role === 'ADMIN';

    if (!classroom) {
        notFound();
    }

    return (
        <div className="container mx-auto space-y-6 px-4 py-6 sm:space-y-8 sm:py-10">
            <ClassroomDetail classroom={classroom} canEditPlan={canEditPlan} />
        </div>
    );
}
