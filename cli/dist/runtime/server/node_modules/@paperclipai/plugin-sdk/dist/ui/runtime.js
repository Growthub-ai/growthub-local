function getBridgeRegistry() {
    return globalThis.__paperclipPluginBridge__;
}
function missingBridgeValueError(name) {
    return new Error(`Paperclip plugin UI runtime is not initialized for "${name}". ` +
        'Ensure the host loaded the plugin bridge before rendering this UI module.');
}
export function getSdkUiRuntimeValue(name) {
    const value = getBridgeRegistry()?.sdkUi?.[name];
    if (value === undefined) {
        throw missingBridgeValueError(name);
    }
    return value;
}
export function renderSdkUiComponent(name, props) {
    const registry = getBridgeRegistry();
    const component = registry?.sdkUi?.[name];
    if (component === undefined) {
        throw missingBridgeValueError(name);
    }
    const createElement = registry?.react?.createElement;
    if (typeof createElement === "function") {
        return createElement(component, props);
    }
    if (typeof component === "function") {
        return component(props);
    }
    throw new Error(`Paperclip plugin UI component "${name}" is not callable`);
}
//# sourceMappingURL=runtime.js.map