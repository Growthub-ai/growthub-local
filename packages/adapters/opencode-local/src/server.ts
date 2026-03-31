export async function execute(..._args: any[]): Promise<any> { return {}; }
export async function testEnvironment(..._args: any[]): Promise<any> { return { status: "unknown" }; }
export const sessionCodec: any = { encode: () => "", decode: () => ({}) };
export async function listOpenCodeModels(..._args: any[]): Promise<any> { return []; }
export function resetOpenCodeModelsCacheForTests(..._args: any[]): void {}
export function isOpenCodeUnknownSessionError(..._args: any[]): boolean { return false; }
export function ensureOpenCodeModelConfiguredAndAvailable(..._args: any[]): any {}
