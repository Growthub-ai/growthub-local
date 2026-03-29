export declare const CURRENT_USER_REDACTION_TOKEN = "[]";
interface CurrentUserRedactionOptions {
    replacement?: string;
    userNames?: string[];
    homeDirs?: string[];
}
export declare function redactCurrentUserText(input: string, opts?: CurrentUserRedactionOptions): string;
export declare function redactCurrentUserValue<T>(value: T, opts?: CurrentUserRedactionOptions): T;
export {};
//# sourceMappingURL=log-redaction.d.ts.map