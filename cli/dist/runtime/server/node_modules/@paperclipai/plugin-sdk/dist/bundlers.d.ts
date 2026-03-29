/**
 * Bundling presets for Paperclip plugins.
 *
 * These helpers return plain config objects so plugin authors can use them
 * with esbuild or rollup without re-implementing host contract defaults.
 */
export interface PluginBundlerPresetInput {
    pluginRoot?: string;
    manifestEntry?: string;
    workerEntry?: string;
    uiEntry?: string;
    outdir?: string;
    sourcemap?: boolean;
    minify?: boolean;
}
export interface EsbuildLikeOptions {
    entryPoints: string[];
    outdir: string;
    bundle: boolean;
    format: "esm";
    platform: "node" | "browser";
    target: string;
    sourcemap?: boolean;
    minify?: boolean;
    external?: string[];
}
export interface RollupLikeConfig {
    input: string;
    output: {
        dir: string;
        format: "es";
        sourcemap?: boolean;
        entryFileNames?: string;
    };
    external?: string[];
    plugins?: unknown[];
}
export interface PluginBundlerPresets {
    esbuild: {
        worker: EsbuildLikeOptions;
        ui?: EsbuildLikeOptions;
        manifest: EsbuildLikeOptions;
    };
    rollup: {
        worker: RollupLikeConfig;
        ui?: RollupLikeConfig;
        manifest: RollupLikeConfig;
    };
}
/**
 * Build esbuild/rollup baseline configs for plugin worker, manifest, and UI bundles.
 *
 * The presets intentionally externalize host/runtime deps (`react`, SDK packages)
 * to match the Paperclip plugin loader contract.
 */
export declare function createPluginBundlerPresets(input?: PluginBundlerPresetInput): PluginBundlerPresets;
//# sourceMappingURL=bundlers.d.ts.map