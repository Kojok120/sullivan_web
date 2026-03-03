import type { Evaluation } from './types';

export function calculateNewPriority(currentPriority: number, evaluation: Evaluation): number {
    const adjustments: Record<Evaluation, number> = {
        A: -10,
        B: -5,
        C: 5,
        D: 10,
    };
    return currentPriority + adjustments[evaluation];
}
