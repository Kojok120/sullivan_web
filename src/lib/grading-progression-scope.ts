type CoreProblemLike = {
    id: string;
};

/**
 * 進行更新の対象CoreProblem集合を構築する。
 * 通常印刷時は null を返し、単元指定印刷時は
 * 「現在アンロック済み + 指定単元」のみに制限する。
 */
export function buildProgressionUpdateScope(
    unlockedCoreProblemIds: Iterable<string>,
    targetCoreProblemId?: string | null
): Set<string> | null {
    if (!targetCoreProblemId) return null;

    const scope = new Set<string>(unlockedCoreProblemIds);
    scope.add(targetCoreProblemId);
    return scope;
}

/**
 * 進行更新スコープで CoreProblem ID をフィルタする。
 * scope が null の場合は入力をそのまま返す。
 */
export function filterCoreProblemIdsByScope(
    coreProblemIds: Iterable<string>,
    scope: Set<string> | null
): string[] {
    const ids = Array.from(coreProblemIds);
    if (!scope) return ids;
    return ids.filter((id) => scope.has(id));
}

/**
 * 進行更新スコープで CoreProblem オブジェクト配列をフィルタする。
 * scope が null の場合は入力をそのまま返す。
 */
export function filterCoreProblemsByScope<T extends CoreProblemLike>(
    coreProblems: Iterable<T>,
    scope: Set<string> | null
): T[] {
    const list = Array.from(coreProblems);
    if (!scope) return list;
    return list.filter((coreProblem) => scope.has(coreProblem.id));
}
