import { createServer } from "node:http";
export interface StartedServer {
    server: ReturnType<typeof createServer>;
    host: string;
    listenPort: number;
    apiUrl: string;
    databaseUrl: string;
}
export declare function startServer(): Promise<StartedServer>;
//# sourceMappingURL=index.d.ts.map