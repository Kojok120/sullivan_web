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
        <div className="container mx-auto px-4 py-6 sm:py-10">
            <h1 className="mb-6 text-2xl font-bold sm:mb-8 sm:text-3xl">Core Problem管理</h1>
            <p className="mb-6 text-sm text-muted-foreground sm:text-base">
                科目、単元、コア問題、および個々の問題と解説動画を管理します。
            </p>
            <CurriculumManager initialSubjects={subjects} />
        </div>
    );
}
