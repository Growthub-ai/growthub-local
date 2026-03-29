export function resolveIssueGoalId(input) {
    if (!input.projectId && !input.goalId) {
        return input.defaultGoalId ?? null;
    }
    return input.goalId ?? null;
}
export function resolveNextIssueGoalId(input) {
    const projectId = input.projectId !== undefined ? input.projectId : input.currentProjectId;
    const goalId = input.goalId !== undefined ? input.goalId : input.currentGoalId;
    if (!projectId && !goalId) {
        return input.defaultGoalId ?? null;
    }
    return goalId ?? null;
}
//# sourceMappingURL=issue-goal-fallback.js.map