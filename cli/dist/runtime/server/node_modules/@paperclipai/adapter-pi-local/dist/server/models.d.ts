import type { AdapterModel } from "@paperclipai/adapter-utils";
export declare function discoverPiModels(input?: {
    command?: unknown;
    cwd?: unknown;
    env?: unknown;
}): Promise<AdapterModel[]>;
export declare function discoverPiModelsCached(input?: {
    command?: unknown;
    cwd?: unknown;
    env?: unknown;
}): Promise<AdapterModel[]>;
export declare function ensurePiModelConfiguredAndAvailable(input: {
    model?: unknown;
    command?: unknown;
    cwd?: unknown;
    env?: unknown;
}): Promise<AdapterModel[]>;
export declare function listPiModels(): Promise<AdapterModel[]>;
export declare function resetPiModelsCacheForTests(): void;
//# sourceMappingURL=models.d.ts.map