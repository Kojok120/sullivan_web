import { describe, expect, it } from 'vitest';

import { collectNewCoreProblemIds, computeRowDiff, resolveRowSubjectId } from '../diff';
import type { ParsedProblem, ResolvedCoreProblem } from '../types';

const selectedCoreProblems = [
    { id: 'cp-selected', name: '選択済み', subjectId: 's1', subjectName: '英語' },
];

describe('problem-bulk-import diff', () => {
    it('既存値と同じならhasChanges=false', () => {
        const row: ParsedProblem = {
            question: 'Q',
            answer: 'A',
            grade: '中1',
            coreProblemNames: ['文法'],
            isValid: true,
            existingProblem: {
                question: 'Q',
                answer: 'A',
                grade: '中1',
                videoUrl: null,
                coreProblems: [{ id: 'cp-selected' }, { id: 'cp-grammar' }],
            },
        };

        const resolved = new Map<string, ResolvedCoreProblem>([
            ['文法', { id: 'cp-grammar', name: '文法', subjectId: 's1', subject: { name: '英語' } }],
        ]);

        const diff = computeRowDiff(row, selectedCoreProblems, resolved);
        expect(diff.hasChanges).toBe(false);
    });

    it('CoreProblem差分があればisCpChanged=true', () => {
        const row: ParsedProblem = {
            question: 'Q',
            answer: 'A',
            isValid: true,
            existingProblem: {
                question: 'Q',
                answer: 'A',
                grade: null,
                videoUrl: null,
                coreProblems: [{ id: 'cp-old' }],
            },
        };

        const diff = computeRowDiff(row, selectedCoreProblems, new Map());
        expect(diff.isCpChanged).toBe(true);
        expect(diff.hasChanges).toBe(true);
    });

    it('resolveRowSubjectId: 複数教科候補はundefined', () => {
        const row = { coreProblemNames: ['A', 'B'] };
        const resolved = new Map<string, ResolvedCoreProblem>([
            ['A', { id: 'cp-a', name: 'A', subjectId: 's1', subject: { name: '英語' } }],
            ['B', { id: 'cp-b', name: 'B', subjectId: 's2', subject: { name: '数学' } }],
        ]);

        const subjectId = resolveRowSubjectId(row, [], resolved, 's3');
        expect(subjectId).toBeUndefined();
    });

    it('未解決CoreProblemだけなら空Setを返す', () => {
        const row = { coreProblemNames: ['未解決'] };
        const ids = collectNewCoreProblemIds(row, [], new Map());
        expect(ids.size).toBe(0);
    });
});
