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
        <div className="container mx-auto space-y-6 px-4 py-6 sm:space-y-8 sm:py-10">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">教室管理</h1>
                    <p className="text-muted-foreground">
                        教室とグループ（曜日など）の管理を行います。
                    </p>
                </div>
            </div>

            <ClassroomList initialClassrooms={classrooms} searchQuery={query} />
        </div>
    );
}
