'use client';

import { useActionState, useState, useMemo } from 'react';
import { signupAction } from './actions';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ClassroomWithGroups, GroupOption } from '@/lib/types/classroom';
import { DEFAULT_INITIAL_PASSWORD } from '@/lib/auth-constants';
import { ROLE_OPTIONS } from '@/lib/role-display';

interface RegisterFormProps {
    classrooms: ClassroomWithGroups[];
    allGroups: GroupOption[]; // All available groups in the system if needed, or derived from classrooms
}

export function RegisterForm({ classrooms, allGroups }: RegisterFormProps) {
    const [state, action, pending] = useActionState(signupAction, undefined);

    // Form state for dependent dropdowns
    const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
    const [selectedRole, setSelectedRole] = useState<string>('STUDENT');

    // Filter groups based on selected classroom
    const availableGroups = useMemo(() => {
        if (!selectedClassroomId) {
            // If no classroom selected, maybe show all groups? Or none? 
            // Based on user request "Classroom and Group selection", usually group depends on classroom.
            // If we have access to all groups, we can show all.
            // The `allGroups` prop should contain all distinct groups.
            return allGroups;
        }

        const classroom = classrooms.find(c => c.id === selectedClassroomId);
        if (!classroom) return [];

        // Filter allGroups to only those present in the classroom's group list
        // Assuming classroom.groups is an array of group names (strings).
        return allGroups.filter(g => classroom.groups.includes(g.name));
    }, [selectedClassroomId, classrooms, allGroups]);

    return (
        <div className="min-h-screen bg-background flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8">
                <div>
                    <Link href="/admin/users" className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        ユーザー一覧に戻る
                    </Link>
                    <h2 className="mt-6 text-center text-3xl font-bold text-foreground">
                        新規ユーザー登録
                    </h2>
                    <p className="mt-2 text-center text-sm text-muted-foreground">
                        Sullivan で利用する各種アカウントを作成します
                    </p>
                </div>

                <div className="mt-8 bg-card py-8 px-4 border rounded-lg sm:px-10">
                    {state?.success ? (
                        <div className="text-center">
                            <div className="mb-4 rounded-md bg-green-50 p-4 text-green-700">
                                <p className="font-bold">登録が完了しました！</p>
                                <p className="mt-2">発行されたログインID:</p>
                                <p className="text-2xl font-mono font-bold">{state.loginId}</p>
                            </div>
                            <p className="mb-6 text-sm text-muted-foreground">
                                このIDをユーザーに伝えてください。<br />
                                初期パスワードは <code>{DEFAULT_INITIAL_PASSWORD}</code> です（初回ログイン時に変更）。
                            </p>
                            <div className="flex flex-col gap-3">
                                <Button
                                    onClick={() => window.location.reload()}
                                    className="w-full"
                                >
                                    続けて登録する
                                </Button>
                                <Link href="/admin/users" className="w-full">
                                    <Button variant="outline" className="w-full">
                                        ユーザー一覧へ戻る
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <form action={action} className="space-y-6" autoComplete="off">
                            <div>
                                <label className="block text-sm font-medium text-foreground">お名前</label>
                                <input
                                    name="name"
                                    type="text"
                                    required
                                    className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-ring focus:outline-none focus:ring-ring sm:text-sm"
                                />
                            </div>
                            <div>
                                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                                    初期パスワードは <code>{DEFAULT_INITIAL_PASSWORD}</code> で固定です（初回ログイン時に変更必須）
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground">役割</label>
                                <select
                                    name="role"
                                    value={selectedRole}
                                    onChange={(e) => setSelectedRole(e.target.value)}
                                    className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-ring focus:outline-none focus:ring-ring sm:text-sm"
                                >
                                    {ROLE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>

                            {(selectedRole === 'STUDENT' || selectedRole === 'TEACHER' || selectedRole === 'HEAD_TEACHER') && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-foreground">所属教室 (必須)</label>
                                        <select
                                            name="classroomId"
                                            value={selectedClassroomId}
                                            onChange={(e) => setSelectedClassroomId(e.target.value)}
                                            required
                                            className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-ring focus:outline-none focus:ring-ring sm:text-sm"
                                        >
                                            <option value="">選択してください</option>
                                            {classrooms.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {selectedRole === 'STUDENT' && (
                                        <div>
                                            <label className="block text-sm font-medium text-foreground">グループ (任意)</label>
                                            <select
                                                name="group"
                                                className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-ring focus:outline-none focus:ring-ring sm:text-sm"
                                            >
                                                <option value="">未選択</option>
                                                {availableGroups.map((g) => (
                                                    <option key={g.id} value={g.name}>
                                                        {g.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </>
                            )}

                            {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
                            <Button
                                type="submit"
                                disabled={pending}
                                className="w-full"
                            >
                                {pending ? '作成中...' : 'ユーザーを作成'}
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
