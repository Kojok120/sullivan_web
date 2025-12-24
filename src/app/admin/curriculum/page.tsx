export const dynamic = 'force-dynamic';

import { getSubjects } from './actions';
import { CurriculumManager } from './curriculum-manager';

export default async function CurriculumPage() {
    const { subjects, error } = await getSubjects();

    if (error || !subjects) {
        return (
            <div className="p-8 text-center text-red-600">
                エラーが発生しました: {error || 'データの取得に失敗しました'}
            </div>
        );
    }

    return (
        <div className="container mx-auto py-10">
            <h1 className="text-3xl font-bold mb-8">カリキュラム・コンテンツ管理</h1>
            <p className="text-muted-foreground mb-6">
                科目、単元、コア問題、および個々の問題と解説動画を管理します。
            </p>
            <CurriculumManager initialSubjects={subjects} />
        </div>
    );
}
