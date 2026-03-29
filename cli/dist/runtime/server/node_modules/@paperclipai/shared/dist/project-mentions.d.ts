export declare const PROJECT_MENTION_SCHEME = "project://";
export interface ParsedProjectMention {
    projectId: string;
    color: string | null;
}
export declare function buildProjectMentionHref(projectId: string, color?: string | null): string;
export declare function parseProjectMentionHref(href: string): ParsedProjectMention | null;
export declare function extractProjectMentionIds(markdown: string): string[];
//# sourceMappingURL=project-mentions.d.ts.map