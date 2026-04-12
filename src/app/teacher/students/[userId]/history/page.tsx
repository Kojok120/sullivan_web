import { SessionList } from '@/app/dashboard/components/session-list';

export default async function TeacherStudentHistoryPage({
    params,
}: {
    params: Promise<{ userId: string }>;
}) {
    const { userId } = await params;

    return <SessionList userId={userId} basePath={`/teacher/students/${userId}/history`} />;
}
