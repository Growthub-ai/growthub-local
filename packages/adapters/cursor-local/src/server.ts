export async function execute(..._args: any[]): Promise<any> { return {}; }
export async function testEnvironment(..._args: any[]): Promise<any> { return { status: "unknown" }; }
export const sessionCodec: any = { encode: () => "", decode: () => ({}) };
export function isCursorUnknownSessionError(..._args: any[]): boolean { return false; }
export function parseCursorJsonl(..._args: any[]): any { return []; }
export function ensureCursorSkillsInjected(..._args: any[]): any {}
