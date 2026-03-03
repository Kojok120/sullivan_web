'use server';

import { addGuidanceRecordAction, deleteGuidanceRecordAction } from './actions/guidance-actions';
import {
    deleteStudentGoalActionImpl,
    generateStudentGoalDraftActionImpl,
    renameStudentGoalActionImpl,
    saveStudentGoalsActionImpl,
    updateStudentGoalDayActionImpl,
} from './actions/goal-actions';
import { updateStudentProfileAction } from './actions/profile-actions';

export async function updateStudentProfile(userId: string, formData: FormData) {
    return updateStudentProfileAction(userId, formData);
}

export async function addGuidanceRecord(userId: string, formData: FormData) {
    return addGuidanceRecordAction(userId, formData);
}

export async function deleteGuidanceRecord(recordId: string, studentId: string) {
    return deleteGuidanceRecordAction(recordId, studentId);
}

export async function saveStudentGoalsAction(userId: string, input: unknown) {
    return saveStudentGoalsActionImpl(userId, input);
}

export async function updateStudentGoalDayAction(userId: string, input: unknown) {
    return updateStudentGoalDayActionImpl(userId, input);
}

export async function renameStudentGoalAction(goalId: string, newName: string) {
    return renameStudentGoalActionImpl(goalId, newName);
}

export async function deleteStudentGoalAction(goalId: string) {
    return deleteStudentGoalActionImpl(goalId);
}

export async function generateStudentGoalDraftAction(userId: string, input: unknown) {
    return generateStudentGoalDraftActionImpl(userId, input);
}
