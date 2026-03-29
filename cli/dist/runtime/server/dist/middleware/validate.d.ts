import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
export declare function validate(schema: ZodSchema): (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=validate.d.ts.map