import { unprocessable } from "../errors.js";
function unavailableProvider(id, label) {
    return {
        id,
        descriptor: {
            id,
            label,
            requiresExternalRef: true,
        },
        async createVersion() {
            throw unprocessable(`${id} provider is not configured in this deployment`);
        },
        async resolveVersion() {
            throw unprocessable(`${id} provider is not configured in this deployment`);
        },
    };
}
export const awsSecretsManagerProvider = unavailableProvider("aws_secrets_manager", "AWS Secrets Manager");
export const gcpSecretManagerProvider = unavailableProvider("gcp_secret_manager", "GCP Secret Manager");
export const vaultProvider = unavailableProvider("vault", "HashiCorp Vault");
//# sourceMappingURL=external-stub-providers.js.map