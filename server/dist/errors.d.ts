export declare class HttpError extends Error {
    status: number;
    details?: unknown;
    constructor(status: number, message: string, details?: unknown);
}
export declare function badRequest(message: string, details?: unknown): HttpError;
export declare function unauthorized(message?: string): HttpError;
export declare function forbidden(message?: string): HttpError;
export declare function notFound(message?: string): HttpError;
export declare function conflict(message: string, details?: unknown): HttpError;
export declare function unprocessable(message: string, details?: unknown): HttpError;
//# sourceMappingURL=errors.d.ts.map