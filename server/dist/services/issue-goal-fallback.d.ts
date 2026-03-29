type MaybeId = string | null | undefined;
export declare function resolveIssueGoalId(input: {
    projectId: MaybeId;
    goalId: MaybeId;
    defaultGoalId: MaybeId;
}): string | null;
export declare function resolveNextIssueGoalId(input: {
    currentProjectId: MaybeId;
    currentGoalId: MaybeId;
    projectId?: MaybeId;
    goalId?: MaybeId;
    defaultGoalId: MaybeId;
}): string | null;
export {};
//# sourceMappingURL=issue-goal-fallback.d.ts.map