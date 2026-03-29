/**
 * Shared attachment content-type configuration.
 *
 * By default only image types are allowed.  Set the
 * `PAPERCLIP_ALLOWED_ATTACHMENT_TYPES` environment variable to a
 * comma-separated list of MIME types or wildcard patterns to expand the
 * allowed set.
 *
 * Examples:
 *   PAPERCLIP_ALLOWED_ATTACHMENT_TYPES=image/*,application/pdf
 *   PAPERCLIP_ALLOWED_ATTACHMENT_TYPES=image/*,application/pdf,text/*
 *
 * Supported pattern syntax:
 *   - Exact types:   "application/pdf"
 *   - Wildcards:     "image/*"  or  "application/vnd.openxmlformats-officedocument.*"
 */
export declare const DEFAULT_ALLOWED_TYPES: readonly string[];
/**
 * Parse a comma-separated list of MIME type patterns into a normalised array.
 * Returns the default image-only list when the input is empty or undefined.
 */
export declare function parseAllowedTypes(raw: string | undefined): string[];
/**
 * Check whether `contentType` matches any entry in `allowedPatterns`.
 *
 * Supports exact matches ("application/pdf") and wildcard / prefix
 * patterns ("image/*", "application/vnd.openxmlformats-officedocument.*").
 */
export declare function matchesContentType(contentType: string, allowedPatterns: string[]): boolean;
/** Convenience wrapper using the process-level allowed list. */
export declare function isAllowedContentType(contentType: string): boolean;
export declare const MAX_ATTACHMENT_BYTES: number;
//# sourceMappingURL=attachment-types.d.ts.map