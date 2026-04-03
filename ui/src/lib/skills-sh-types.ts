export type SkillsShSearchResult = {
  id: string;
  owner: string;
  repo: string;
  skillName: string;
  summary: string;
  tags: string[];
  installCommand: string;
  skillUrl: string;
  repoUrl?: string;
  metrics?: { installs?: number; lastUpdated?: string };
};

export type SkillsShSkillSnapshot = {
  meta: SkillsShSearchResult;
  whenToUse: string;
  instructions: string;
  examples?: string[];
  rawDocsExcerpt?: string;
  fetchedAt: string;
  directoryVersion: string;
};
