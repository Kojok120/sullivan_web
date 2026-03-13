import { describe, expect, it } from 'vitest';

import { sortStudents } from './student-list-sort';

const students = [
    {
        id: 'student-1',
        loginId: 'S10',
        stats: {
            totalProblemsSolved: 12,
            currentStreak: 3,
            lastActivity: new Date('2026-03-10T00:00:00Z'),
        },
    },
    {
        id: 'student-2',
        loginId: 'S2',
        stats: {
            totalProblemsSolved: 25,
            currentStreak: 7,
            lastActivity: new Date('2026-03-12T00:00:00Z'),
        },
    },
    {
        id: 'student-3',
        loginId: 'S1',
        stats: {
            totalProblemsSolved: 25,
            currentStreak: 1,
            lastActivity: null,
        },
    },
];

describe('student-list-sort', () => {
    it('生徒IDを自然順で並び替える', () => {
        const sorted = sortStudents(students, 'loginId', 'asc');

        expect(sorted.map((student) => student.loginId)).toEqual(['S1', 'S2', 'S10']);
    });

    it('総回答数を降順で並び替え、同値は生徒ID順にする', () => {
        const sorted = sortStudents(students, 'totalProblemsSolved', 'desc');

        expect(sorted.map((student) => student.loginId)).toEqual(['S1', 'S2', 'S10']);
    });

    it('最終学習日は null を末尾にして並び替える', () => {
        const sorted = sortStudents(students, 'lastActivity', 'desc');

        expect(sorted.map((student) => student.loginId)).toEqual(['S2', 'S10', 'S1']);
    });
});
