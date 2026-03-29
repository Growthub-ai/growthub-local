import { Router } from "express";
import { dashboardService } from "../services/dashboard.js";
import { assertCompanyAccess } from "./authz.js";
export function dashboardRoutes(db) {
    const router = Router();
    const svc = dashboardService(db);
    router.get("/companies/:companyId/dashboard", async (req, res) => {
        const companyId = req.params.companyId;
        assertCompanyAccess(req, companyId);
        const summary = await svc.summary(companyId);
        res.json(summary);
    });
    return router;
}
//# sourceMappingURL=dashboard.js.map