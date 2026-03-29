export function hasCursorTrustBypassArg(args) {
    return args.some((arg) => arg === "--trust" ||
        arg === "--yolo" ||
        arg === "-f" ||
        arg.startsWith("--trust="));
}
//# sourceMappingURL=trust.js.map