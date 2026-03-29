import type { Db } from "@paperclipai/db";
import { type InstanceExperimentalSettings, type InstanceSettings, type PatchInstanceExperimentalSettings } from "@paperclipai/shared";
export declare function instanceSettingsService(db: Db): {
    get: () => Promise<InstanceSettings>;
    getExperimental: () => Promise<InstanceExperimentalSettings>;
    updateExperimental: (patch: PatchInstanceExperimentalSettings) => Promise<InstanceSettings>;
    listCompanyIds: () => Promise<string[]>;
};
//# sourceMappingURL=instance-settings.d.ts.map