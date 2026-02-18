import { getClassroom } from '../actions';
import { notFound } from 'next/navigation';
import { ClassroomDetail } from './classroom-detail';

export default async function ClassroomDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const classroom = await getClassroom(id);

    if (!classroom) {
        notFound();
    }

    return (
        <div className="container mx-auto py-10 space-y-8">
            <ClassroomDetail classroom={classroom} />
        </div>
    );
}
