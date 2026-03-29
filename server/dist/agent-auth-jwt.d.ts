export interface LocalAgentJwtClaims {
    sub: string;
    company_id: string;
    adapter_type: string;
    run_id: string;
    iat: number;
    exp: number;
    iss?: string;
    aud?: string;
    jti?: string;
}
export declare function createLocalAgentJwt(agentId: string, companyId: string, adapterType: string, runId: string): string | null;
export declare function verifyLocalAgentJwt(token: string): LocalAgentJwtClaims | null;
//# sourceMappingURL=agent-auth-jwt.d.ts.map