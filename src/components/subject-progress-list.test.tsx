import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SubjectProgressList } from '@/components/subject-progress-list';

describe('SubjectProgressList', () => {
    it('横幅が狭くても教科名と進捗率がはみ出しにくいクラスを持つ', () => {
        render(
            <SubjectProgressList
                items={[
                    {
                        subjectId: 'subject-1',
                        subjectName: 'とても長い教科名の表示確認テストデータ',
                        progressPercentage: 75,
                    },
                ]}
            />
        );

        expect(screen.getByText('とても長い教科名の表示確認テストデータ')).toHaveClass('min-w-0', 'truncate');
        expect(screen.getByText('75%')).toHaveClass('shrink-0');
        expect(screen.getByRole('progressbar')).toHaveClass('w-full');
    });
});
