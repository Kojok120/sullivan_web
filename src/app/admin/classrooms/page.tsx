import { getClassrooms } from './actions';
import { ClassroomList } from './classroom-list';

export default async function ClassroomsPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>;
}) {
    const { q } = await searchParams;
    const query = q || '';
    const classrooms = await getClassrooms(query);

    return (
        <div className="container mx-auto py-10 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">教室管理</h1>
                    <p className="text-muted-foreground">
                        教室とグループ（曜日など）の管理を行います。
                    </p>
                </div>
            </div>

            <ClassroomList initialClassrooms={classrooms} searchQuery={query} />
        </div>
    );
}

