import {
  createPaperclipViewLayoutStorage,
  type PaperclipViewLayoutId,
} from "@/lib/paperclip-view-layout";

export const GTM_AGENTS_LAYOUT_KEY = "paperclip:gtm-agents:layout";

export const GTM_AGENTS_LAYOUT_FAVORITE_KEY = "paperclip:gtm-agents:layout:favorite";

/** Agents surface: list / kanban / table only (calendar lives on Inbox issues). */
export type GtmAgentsLayout = Exclude<PaperclipViewLayoutId, "calendar">;

const AGENTS_ALLOWED: readonly GtmAgentsLayout[] = ["list", "kanban", "table"];

const agentsStorage = createPaperclipViewLayoutStorage(
  { lastKey: GTM_AGENTS_LAYOUT_KEY, favoriteKey: GTM_AGENTS_LAYOUT_FAVORITE_KEY },
  { fallback: "list", allowed: AGENTS_ALLOWED },
);

export function isGtmAgentsLayout(value: string | null | undefined): value is GtmAgentsLayout {
  return value === "list" || value === "kanban" || value === "table";
}

export function loadGtmAgentsLayout(): GtmAgentsLayout {
  return agentsStorage.loadLast() as GtmAgentsLayout;
}

export function saveGtmAgentsLayout(layout: GtmAgentsLayout): void {
  agentsStorage.saveLast(layout);
}

export function loadGtmAgentsLayoutFavorite(): GtmAgentsLayout | null {
  return agentsStorage.loadFavorite() as GtmAgentsLayout | null;
}

export function saveGtmAgentsLayoutFavorite(layout: GtmAgentsLayout): void {
  agentsStorage.saveFavorite(layout);
}

export function clearGtmAgentsLayoutFavorite(): void {
  agentsStorage.clearFavorite();
}

export function toggleGtmAgentsLayoutFavorite(layout: GtmAgentsLayout): GtmAgentsLayout | null {
  return agentsStorage.toggleFavorite(layout) as GtmAgentsLayout | null;
}

export function resolveGtmAgentsLayoutWithoutUrlParam(): GtmAgentsLayout {
  return agentsStorage.resolveWithoutUrlParam() as GtmAgentsLayout;
}

export function normalizeGtmAgentsLayoutParam(value: string | null | undefined): GtmAgentsLayout {
  return agentsStorage.normalizeUrlParam(value) as GtmAgentsLayout;
}

export const GTM_AGENTS_LAYOUTS = AGENTS_ALLOWED;
