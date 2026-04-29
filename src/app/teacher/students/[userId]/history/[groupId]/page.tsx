import { SessionDetail } from "@/components/history/session-detail";

export default async function TeacherSessionDetailsPage({
    params
}: {
    params: Promise<{ userId: string; groupId: string }>
}) {
    const { userId, groupId } = await params;

    return (
        <SessionDetail
            groupId={groupId}
            userId={userId}
            isTeacherView={true}
            backUrl={`/teacher/students/${userId}/history`}
        />
    );
}
