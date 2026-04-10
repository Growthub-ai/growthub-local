export type KitComplexity = "easy" | "moderate" | "complex";
export type KitType = "self-contained" | "uses-codebase" | "workflow" | "worker" | "output" | "ui";
export type SortOption = "newest" | "oldest" | "popular" | "easy-first" | "complex-first";

export interface Kit {
  id: string;
  name: string;
  description: string;
  version: string;
  author: {
    username: string;
    displayName: string;
  };
  complexity: KitComplexity;
  type: KitType;
  featured: boolean;
  publishedAt: string;
  updatedAt: string;
  tags?: string[];
  executionMode?: string;
  activationModes?: string[];
}
