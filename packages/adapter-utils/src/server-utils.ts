export type RunProcessResult = any;

export const runningProcesses = new Map();
export const MAX_CAPTURE_BYTES = 1024 * 1024;
export const MAX_EXCERPT_BYTES = 4096;

export function parseObject(..._args: any[]): any { return {}; }
export function asString(..._args: any[]): any { return ""; }
export function asNumber(..._args: any[]): any { return 0; }
export function asBoolean(..._args: any[]): any { return false; }
export function asStringArray(..._args: any[]): any { return []; }
export function parseJson(..._args: any[]): any { return {}; }
export function appendWithCap(..._args: any[]): any { return ""; }
export function resolvePathValue(..._args: any[]): any { return ""; }
export function renderTemplate(..._args: any[]): any { return ""; }
export function redactEnvForLogs(..._args: any[]): any { return {}; }
export function buildPaperclipEnv(..._args: any[]): any { return {}; }
export function defaultPathForPlatform(..._args: any[]): any { return ""; }
export function ensurePathInEnv(..._args: any[]): any { return ""; }
export function ensureAbsoluteDirectory(..._args: any[]): any { return ""; }
export function ensureCommandResolvable(..._args: any[]): any { return true; }
export async function runChildProcess(..._args: any[]): Promise<any> { return {}; }
export function removeMaintainerOnlySkillSymlinks(..._args: any[]): any {}
export function resolvePaperclipSkillsDir(..._args: any[]): any { return ""; }
