export function firstNonEmptyLine(text) {
    return (text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) ?? "");
}
//# sourceMappingURL=utils.js.map