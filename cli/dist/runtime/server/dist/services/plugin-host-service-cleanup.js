export function createPluginHostServiceCleanup(lifecycle, disposers) {
    const runDispose = (pluginId, remove = false) => {
        const dispose = disposers.get(pluginId);
        if (!dispose)
            return;
        dispose();
        if (remove) {
            disposers.delete(pluginId);
        }
    };
    const handleWorkerStopped = ({ pluginId }) => {
        runDispose(pluginId);
    };
    const handlePluginUnloaded = ({ pluginId }) => {
        runDispose(pluginId, true);
    };
    lifecycle.on("plugin.worker_stopped", handleWorkerStopped);
    lifecycle.on("plugin.unloaded", handlePluginUnloaded);
    return {
        handleWorkerEvent(event) {
            if (event.type === "plugin.worker.crashed") {
                runDispose(event.pluginId);
            }
        },
        disposeAll() {
            for (const dispose of disposers.values()) {
                dispose();
            }
            disposers.clear();
        },
        teardown() {
            lifecycle.off("plugin.worker_stopped", handleWorkerStopped);
            lifecycle.off("plugin.unloaded", handlePluginUnloaded);
        },
    };
}
//# sourceMappingURL=plugin-host-service-cleanup.js.map