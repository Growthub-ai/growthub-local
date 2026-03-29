import { forbidden, unauthorized } from "../errors.js";
export function assertBoard(req) {
    if (req.actor.type !== "board") {
        throw forbidden("Board access required");
    }
}
export function assertCompanyAccess(req, companyId) {
    if (req.actor.type === "none") {
        throw unauthorized();
    }
    if (req.actor.type === "agent" && req.actor.companyId !== companyId) {
        throw forbidden("Agent key cannot access another company");
    }
    if (req.actor.type === "board" && req.actor.source !== "local_implicit" && !req.actor.isInstanceAdmin) {
        const allowedCompanies = req.actor.companyIds ?? [];
        if (!allowedCompanies.includes(companyId)) {
            throw forbidden("User does not have access to this company");
        }
    }
}
export function getActorInfo(req) {
    if (req.actor.type === "none") {
        throw unauthorized();
    }
    if (req.actor.type === "agent") {
        return {
            actorType: "agent",
            actorId: req.actor.agentId ?? "unknown-agent",
            agentId: req.actor.agentId ?? null,
            runId: req.actor.runId ?? null,
        };
    }
    return {
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        agentId: null,
        runId: req.actor.runId ?? null,
    };
}
//# sourceMappingURL=authz.js.map