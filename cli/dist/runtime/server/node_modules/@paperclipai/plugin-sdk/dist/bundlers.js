/**
 * Bundling presets for Paperclip plugins.
 *
 * These helpers return plain config objects so plugin authors can use them
 * with esbuild or rollup without re-implementing host contract defaults.
 */
/**
 * Build esbuild/rollup baseline configs for plugin worker, manifest, and UI bundles.
 *
 * The presets intentionally externalize host/runtime deps (`react`, SDK packages)
 * to match the Paperclip plugin loader contract.
 */
export function createPluginBundlerPresets(input = {}) {
    const uiExternal = [
        "@paperclipai/plugin-sdk/ui",
        "@paperclipai/plugin-sdk/ui/hooks",
        "react",
        "react-dom",
        "react/jsx-runtime",
    ];
    const outdir = input.outdir ?? "dist";
    const workerEntry = input.workerEntry ?? "src/worker.ts";
    const manifestEntry = input.manifestEntry ?? "src/manifest.ts";
    const uiEntry = input.uiEntry;
    const sourcemap = input.sourcemap ?? true;
    const minify = input.minify ?? false;
    const esbuildWorker = {
        entryPoints: [workerEntry],
        outdir,
        bundle: true,
        format: "esm",
        platform: "node",
        target: "node20",
        sourcemap,
        minify,
        external: ["react", "react-dom"],
    };
    const esbuildManifest = {
        entryPoints: [manifestEntry],
        outdir,
        bundle: false,
        format: "esm",
        platform: "node",
        target: "node20",
        sourcemap,
    };
    const esbuildUi = uiEntry
        ? {
            entryPoints: [uiEntry],
            outdir: `${outdir}/ui`,
            bundle: true,
            format: "esm",
            platform: "browser",
            target: "es2022",
            sourcemap,
            minify,
            external: uiExternal,
        }
        : undefined;
    const rollupWorker = {
        input: workerEntry,
        output: {
            dir: outdir,
            format: "es",
            sourcemap,
            entryFileNames: "worker.js",
        },
        external: ["react", "react-dom"],
    };
    const rollupManifest = {
        input: manifestEntry,
        output: {
            dir: outdir,
            format: "es",
            sourcemap,
            entryFileNames: "manifest.js",
        },
        external: ["@paperclipai/plugin-sdk"],
    };
    const rollupUi = uiEntry
        ? {
            input: uiEntry,
            output: {
                dir: `${outdir}/ui`,
                format: "es",
                sourcemap,
                entryFileNames: "index.js",
            },
            external: uiExternal,
        }
        : undefined;
    return {
        esbuild: {
            worker: esbuildWorker,
            manifest: esbuildManifest,
            ...(esbuildUi ? { ui: esbuildUi } : {}),
        },
        rollup: {
            worker: rollupWorker,
            manifest: rollupManifest,
            ...(rollupUi ? { ui: rollupUi } : {}),
        },
    };
}
//# sourceMappingURL=bundlers.js.map