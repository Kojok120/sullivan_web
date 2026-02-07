
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionDetail } from "@/components/history/session-detail";

export default async function SessionDetailsPage({ params }: { params: Promise<{ groupId: string }> }) {
    const session = await getSession();
    if (!session) redirect('/login');

    const { groupId } = await params;

    return (
        <SessionDetail
            groupId={groupId}
            userId={session.userId}
            isTeacherView={false}
            backUrl="/"
        />
    );
}
