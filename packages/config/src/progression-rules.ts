export const UNLOCK_ANSWER_RATE = 0.4;
export const UNLOCK_CORRECT_RATE = 0.5;

export type ProgressionRules = {
    unlockAnswerRate: number;
    unlockCorrectRate: number;
};

export const DEFAULT_PROGRESSION_RULES: ProgressionRules = {
    unlockAnswerRate: UNLOCK_ANSWER_RATE,
    unlockCorrectRate: UNLOCK_CORRECT_RATE,
};
