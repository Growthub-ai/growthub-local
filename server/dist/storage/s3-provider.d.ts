import type { StorageProvider } from "./types.js";
interface S3ProviderConfig {
    bucket: string;
    region: string;
    endpoint?: string;
    prefix?: string;
    forcePathStyle?: boolean;
}
export declare function createS3StorageProvider(config: S3ProviderConfig): StorageProvider;
export {};
//# sourceMappingURL=s3-provider.d.ts.map