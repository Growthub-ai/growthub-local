import type { Db } from "@paperclipai/db";
import type { CompanyPortabilityExport, CompanyPortabilityExportResult, CompanyPortabilityImport, CompanyPortabilityImportResult, CompanyPortabilityPreview, CompanyPortabilityPreviewResult } from "@paperclipai/shared";
export declare function companyPortabilityService(db: Db): {
    exportBundle: (companyId: string, input: CompanyPortabilityExport) => Promise<CompanyPortabilityExportResult>;
    previewImport: (input: CompanyPortabilityPreview) => Promise<CompanyPortabilityPreviewResult>;
    importBundle: (input: CompanyPortabilityImport, actorUserId: string | null | undefined) => Promise<CompanyPortabilityImportResult>;
};
//# sourceMappingURL=company-portability.d.ts.map