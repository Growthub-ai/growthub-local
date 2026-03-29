import { createLocalDiskStorageProvider } from "./local-disk-provider.js";
import { createS3StorageProvider } from "./s3-provider.js";
export function createStorageProviderFromConfig(config) {
    if (config.storageProvider === "local_disk") {
        return createLocalDiskStorageProvider(config.storageLocalDiskBaseDir);
    }
    return createS3StorageProvider({
        bucket: config.storageS3Bucket,
        region: config.storageS3Region,
        endpoint: config.storageS3Endpoint,
        prefix: config.storageS3Prefix,
        forcePathStyle: config.storageS3ForcePathStyle,
    });
}
//# sourceMappingURL=provider-registry.js.map