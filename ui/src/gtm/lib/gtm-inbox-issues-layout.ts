import { createPaperclipViewLayoutStorage } from "@/lib/paperclip-view-layout";

export const GTM_INBOX_ISSUES_LAYOUT_KEY = "paperclip:gtm-inbox:issues-view";

export const GTM_INBOX_ISSUES_LAYOUT_FAVORITE_KEY = "paperclip:gtm-inbox:issues-view:favorite";

export type GtmInboxIssuesViewLayout = "list" | "kanban" | "table" | "calendar";

const inboxIssuesStorage = createPaperclipViewLayoutStorage(
  { lastKey: GTM_INBOX_ISSUES_LAYOUT_KEY, favoriteKey: GTM_INBOX_ISSUES_LAYOUT_FAVORITE_KEY },
  { fallback: "list" },
);

export function isGtmInboxIssuesViewLayout(value: string | null | undefined): value is GtmInboxIssuesViewLayout {
  return value === "list" || value === "kanban" || value === "table" || value === "calendar";
}

export function loadGtmInboxIssuesLayout(): GtmInboxIssuesViewLayout {
  return inboxIssuesStorage.loadLast() as GtmInboxIssuesViewLayout;
}

export function saveGtmInboxIssuesLayout(layout: GtmInboxIssuesViewLayout): void {
  inboxIssuesStorage.saveLast(layout);
}

export function loadGtmInboxIssuesLayoutFavorite(): GtmInboxIssuesViewLayout | null {
  return inboxIssuesStorage.loadFavorite() as GtmInboxIssuesViewLayout | null;
}

export function toggleGtmInboxIssuesLayoutFavorite(layout: GtmInboxIssuesViewLayout): GtmInboxIssuesViewLayout | null {
  return inboxIssuesStorage.toggleFavorite(layout) as GtmInboxIssuesViewLayout | null;
}

export function resolveGtmInboxIssuesLayoutWithoutUrlParam(): GtmInboxIssuesViewLayout {
  return inboxIssuesStorage.resolveWithoutUrlParam() as GtmInboxIssuesViewLayout;
}

export function normalizeGtmInboxIssuesLayoutParam(value: string | null | undefined): GtmInboxIssuesViewLayout {
  return inboxIssuesStorage.normalizeUrlParam(value) as GtmInboxIssuesViewLayout;
}
