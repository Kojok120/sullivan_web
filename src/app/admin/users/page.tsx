import { getUsers, getGroups, getClassroomsForAdmin } from '../actions';
import { UserList } from './user-list';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function UsersPage({
    searchParams,
}: {
    searchParams: Promise<{
        q?: string;
        page?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        role?: string;
        groupId?: string;
    }>;
}) {
    const { q, page, sortBy, sortOrder, role, groupId } = await searchParams;
    const currentPage = Number(page) || 1;
    const query = q || '';
    const limit = 50;
    const currentSortBy = sortBy || 'createdAt';
    const currentSortOrder = sortOrder || 'desc';

    // Validate role
    const roleEnum = role && ['STUDENT', 'TEACHER', 'PARENT', 'ADMIN'].includes(role) ? role as any : undefined;

    const [usersData, groupsData, classroomsData] = await Promise.all([
        getUsers(currentPage, limit, query, currentSortBy, currentSortOrder, roleEnum, groupId),
        getGroups(),
        getClassroomsForAdmin(),
    ]);

    const { users, total, error } = usersData;
    const groups = groupsData.groups || [];
    const classrooms = classroomsData.classrooms || [];

    if (error || !users) {
        return (
            <div className="p-8 text-center text-red-600">
                エラーが発生しました: {error}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">ユーザー管理</h1>
                    <Link href="/admin/users/register">
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            + 新規ユーザー登録
                        </Button>
                    </Link>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <UserList
                        initialUsers={users}
                        total={total || 0}
                        currentPage={currentPage}
                        limit={limit}
                        searchQuery={query}
                        sortBy={currentSortBy}
                        sortOrder={currentSortOrder}
                        roleFilter={roleEnum}
                        groupIdFilter={groupId}
                        groups={groups}
                        classrooms={classrooms}
                    />
                </div>
            </div>
        </div>
    );
}
