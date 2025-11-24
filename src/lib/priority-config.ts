export interface PriorityConfig {
    priorityAdjustmentA: number;
    priorityAdjustmentB: number;
    priorityAdjustmentC: number;
    priorityAdjustmentD: number;
    forgettingCurveRate: number;
}

export const DEFAULT_CONFIG: PriorityConfig = {
    priorityAdjustmentA: -30,
    priorityAdjustmentB: -10,
    priorityAdjustmentC: 10,
    priorityAdjustmentD: 30,
    forgettingCurveRate: 5.0,
};
