export type ClassroomPlan = 'STANDARD' | 'PREMIUM';

export interface GroupOption {
    id: string;
    name: string;
}

export interface ClassroomOption {
    id: string;
    name: string;
    plan: ClassroomPlan;
}

export interface ClassroomWithGroups extends ClassroomOption {
    groups: string[];
}

export interface ClassroomUser {
    id: string;
    loginId: string;
    name: string | null;
    role: string;
    group: string | null;
}

export interface ClassroomWithUsers extends ClassroomWithGroups {
    users: ClassroomUser[];
}
