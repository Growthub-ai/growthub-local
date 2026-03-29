import type { AdapterModel } from "@paperclipai/adapter-utils";
export declare function discoverOpenCodeModels(input?: {
    command?: unknown;
    cwd?: unknown;
    env?: unknown;
}): Promise<AdapterModel[]>;
export declare function discoverOpenCodeModelsCached(input?: {
    command?: unknown;
    cwd?: unknown;
    env?: unknown;
}): Promise<AdapterModel[]>;
export declare function ensureOpenCodeModelConfiguredAndAvailable(input: {
    model?: unknown;
    command?: unknown;
    cwd?: unknown;
    env?: unknown;
}): Promise<AdapterModel[]>;
export declare function listOpenCodeModels(): Promise<AdapterModel[]>;
export declare function resetOpenCodeModelsCacheForTests(): void;
//# sourceMappingURL=models.d.ts.map