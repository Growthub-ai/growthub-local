import type { AdapterModel } from "./types.js";
type CursorModelsCommandResult = {
    status: number | null;
    stdout: string;
    stderr: string;
    hasError: boolean;
};
export declare function parseCursorModelsOutput(stdout: string, stderr: string): AdapterModel[];
export declare function listCursorModels(): Promise<AdapterModel[]>;
export declare function resetCursorModelsCacheForTests(): void;
export declare function setCursorModelsRunnerForTests(runner: (() => CursorModelsCommandResult) | null): void;
export {};
//# sourceMappingURL=cursor-models.d.ts.map