import { getUsers, getUserManagementMeta } from '../actions';
import { UserList } from './user-list';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Role } from '@prisma/client';

export default async function UsersPage({
    searchParams,
}: {
    searchParams: Promise<{
        q?: string;
        page?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        role?: string;
        classroomId?: string;
        groupId?: string;
    }>;
}) {
    const { q, page, sortBy, sortOrder, role, classroomId, groupId } = await searchParams;
    const currentPage = Number(page) || 1;
    const query = q || '';
    const limit = 50;
    const currentSortBy = sortBy || 'createdAt';
    const currentSortOrder = sortOrder || 'desc';
    const classroomFilter = classroomId || groupId;

    // Validate role
    const roleEnum = (Object.values(Role) as Role[]).find((value) => value === role);

    const [usersData, metadataResult] = await Promise.all([
        getUsers(currentPage, limit, query, currentSortBy, currentSortOrder, roleEnum, classroomFilter),
        getUserManagementMeta(),
    ]);

    const { users, total, error } = usersData;
    const groups = metadataResult.success ? metadataResult.groups : [];
    const classrooms = metadataResult.success ? metadataResult.classrooms : [];
    const metadataError = metadataResult.success ? undefined : metadataResult.error;

    if (error || !users || metadataError) {
        return (
            <div className="p-8 text-center text-red-600">
                エラーが発生しました: {error || metadataError}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-6 sm:py-8">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-2xl font-bold text-foreground">ユーザー管理</h1>
                    <Link href="/admin/users/register">
                        <Button className="min-h-11 w-full sm:min-h-10 sm:w-auto">
                            + 新規ユーザー登録
                        </Button>
                    </Link>
                </div>

                <div className="rounded-lg bg-card p-4 border sm:p-6">
                    <UserList
                        initialUsers={users}
                        total={total || 0}
                        currentPage={currentPage}
                        limit={limit}
                        searchQuery={query}
                        sortBy={currentSortBy}
                        sortOrder={currentSortOrder}
                        roleFilter={roleEnum}
                        classroomIdFilter={classroomFilter}
                        groups={groups}
                        classrooms={classrooms}
                    />
                </div>
            </div>
        </div>
    );
}
