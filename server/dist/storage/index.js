import { loadConfig } from "../config.js";
import { createStorageProviderFromConfig } from "./provider-registry.js";
import { createStorageService } from "./service.js";
let cachedStorageService = null;
let cachedSignature = null;
function signatureForConfig(config) {
    return JSON.stringify({
        provider: config.storageProvider,
        localDisk: config.storageLocalDiskBaseDir,
        s3Bucket: config.storageS3Bucket,
        s3Region: config.storageS3Region,
        s3Endpoint: config.storageS3Endpoint,
        s3Prefix: config.storageS3Prefix,
        s3ForcePathStyle: config.storageS3ForcePathStyle,
    });
}
export function createStorageServiceFromConfig(config) {
    return createStorageService(createStorageProviderFromConfig(config));
}
export function getStorageService() {
    const config = loadConfig();
    const signature = signatureForConfig(config);
    if (!cachedStorageService || cachedSignature !== signature) {
        cachedStorageService = createStorageServiceFromConfig(config);
        cachedSignature = signature;
    }
    return cachedStorageService;
}
//# sourceMappingURL=index.js.map