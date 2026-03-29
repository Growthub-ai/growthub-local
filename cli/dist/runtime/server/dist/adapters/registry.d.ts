import type { ServerAdapterModule } from "./types.js";
export declare function getServerAdapter(type: string): ServerAdapterModule;
export declare function listAdapterModels(type: string): Promise<{
    id: string;
    label: string;
}[]>;
export declare function listServerAdapters(): ServerAdapterModule[];
export declare function findServerAdapter(type: string): ServerAdapterModule | null;
//# sourceMappingURL=registry.d.ts.map