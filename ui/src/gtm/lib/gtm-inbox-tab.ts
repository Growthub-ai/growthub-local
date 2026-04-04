export const GTM_INBOX_LAST_TAB_KEY = "paperclip:gtm-inbox:last-tab";

export type GtmInboxTab = "recent" | "unread" | "all";

export function loadGtmLastInboxTab(): GtmInboxTab {
  try {
    const raw = localStorage.getItem(GTM_INBOX_LAST_TAB_KEY);
    if (raw === "all" || raw === "unread" || raw === "recent") return raw;
    return "recent";
  } catch {
    return "recent";
  }
}

export function saveGtmLastInboxTab(tab: GtmInboxTab): void {
  try {
    localStorage.setItem(GTM_INBOX_LAST_TAB_KEY, tab);
  } catch {
    // Ignore localStorage failures.
  }
}

export function parseGtmInboxTabFromPath(pathname: string): GtmInboxTab | null {
  const m = pathname.match(/\/inbox\/(recent|unread|all)(?:\/|$|\?|#)/);
  const s = m?.[1];
  if (s === "recent" || s === "unread" || s === "all") return s;
  return null;
}
