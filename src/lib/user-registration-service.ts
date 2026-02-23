import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';
import { createOrUpdateSupabaseUser, deleteSupabaseUserByLookup } from '@/lib/auth-admin';
import { createUser as createPrismaUser } from '@/lib/user-service';
import { ensureInitialCoreProblemStates } from '@/lib/core-problem-entry-state';

export const DEFAULT_INITIAL_PASSWORD = 'password123';

export interface RegisterUserParams {
    name: string;
    role: Role;
    password?: string;
    group?: string;
    classroomId?: string;
}

/**
 * Prisma と Supabase Auth の両方にユーザーを登録する。
 * 途中失敗時は作成済みデータをロールバックする。
 */
export async function registerUser({
    name,
    role,
    password,
    group,
    classroomId
}: RegisterUserParams) {
    async function rollbackPrismaUser(userId: string) {
        try {
            await prisma.userCoreProblemState.deleteMany({ where: { userId } });
            await prisma.user.delete({ where: { id: userId } });
            console.log(`ユーザー ${userId} をロールバックしました。`);
        } catch (rollbackError) {
            console.error('重大: ユーザー作成ロールバックに失敗しました:', rollbackError);
        }
    }

    async function rollbackSupabaseUser(email: string, prismaUserId: string) {
        try {
            const result = await deleteSupabaseUserByLookup({ email, prismaUserId });
            if (!result.success) {
                console.error('Supabaseユーザーのロールバックに失敗しました:', result.error);
            }
        } catch (rollbackError) {
            console.error('Supabaseユーザーのロールバック中に例外が発生しました:', rollbackError);
        }
    }

    // 1. 初期パスワードは運用要件に合わせて固定値を使用
    // 引数 password が渡された場合も、初期値は統一する。
    void password;
    const finalPassword = DEFAULT_INITIAL_PASSWORD;

    // 2. Prismaにユーザーを作成
    let user;
    try {
        user = await createPrismaUser({
            name,
            role,
            group,
            classroomId
        });
    } catch (e) {
        console.error('Prismaユーザー作成に失敗しました:', e);
        return { error: 'ユーザーの作成に失敗しました(DB)' };
    }

    // 3. Supabaseに登録
    const email = `${user.loginId}@sullivan-internal.local`;

    const authResult = await createOrUpdateSupabaseUser({
        email,
        password: finalPassword,
        role: user.role,
        loginId: user.loginId,
        name: user.name || '',
        prismaUserId: user.id
    });

    if (authResult.error) {
        // Supabase登録に失敗した場合はPrisma側をロールバック
        await rollbackPrismaUser(user.id);

        console.error('Supabase登録に失敗しました:', authResult.error);
        return { error: `Auth作成失敗: ${authResult.error}` };
    }

    // 4. 初回CoreProblem状態を作成（最初の単元は無条件アンロック）
    try {
        await ensureInitialCoreProblemStates(user.id);
    } catch (e) {
        console.error('初回CoreProblem状態の初期化に失敗しました:', e);
        await rollbackSupabaseUser(email, user.id);
        await rollbackPrismaUser(user.id);
        return { error: '初期単元状態の作成に失敗しました' };
    }

    return { success: true, user, password: finalPassword };
}
