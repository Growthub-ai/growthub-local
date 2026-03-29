import type { Request, Response, NextFunction } from "express";
export interface ErrorContext {
    error: {
        message: string;
        stack?: string;
        name?: string;
        details?: unknown;
        raw?: unknown;
    };
    method: string;
    url: string;
    reqBody?: unknown;
    reqParams?: unknown;
    reqQuery?: unknown;
}
export declare function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void;
//# sourceMappingURL=error-handler.d.ts.map