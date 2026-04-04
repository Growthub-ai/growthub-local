/**
 * Paperclip / Growthub — surface-agnostic view layout identifiers for list-style pages
 * (agents, inbox issues, future DX). Persist via localStorage keys scoped per surface.
 */

export const PAPERCLIP_VIEW_LAYOUT_IDS = ["list", "kanban", "table", "calendar"] as const;

export type PaperclipViewLayoutId = (typeof PAPERCLIP_VIEW_LAYOUT_IDS)[number];

export interface PaperclipViewLayoutStorageKeys {
  /** Last-selected layout (e.g. paperclip:gtm-inbox:issues-view). */
  lastKey: string;
  /** Starred default when URL has no valid ?view= (e.g. ...:favorite). */
  favoriteKey: string;
}

export interface PaperclipViewLayoutStorageOptions {
  /** When URL/LS value is missing or disallowed. */
  fallback?: PaperclipViewLayoutId;
  /** Restrict valid layouts (e.g. agents omit calendar). When set, other values coerce to fallback. */
  allowed?: readonly PaperclipViewLayoutId[];
}

export interface PaperclipViewLayoutStorage {
  loadLast: () => PaperclipViewLayoutId;
  saveLast: (layout: PaperclipViewLayoutId) => void;
  loadFavorite: () => PaperclipViewLayoutId | null;
  saveFavorite: (layout: PaperclipViewLayoutId) => void;
  clearFavorite: () => void;
  toggleFavorite: (layout: PaperclipViewLayoutId) => PaperclipViewLayoutId | null;
  resolveWithoutUrlParam: () => PaperclipViewLayoutId;
  normalizeUrlParam: (value: string | null | undefined) => PaperclipViewLayoutId;
}

export function isPaperclipViewLayoutId(value: string | null | undefined): value is PaperclipViewLayoutId {
  return value === "list" || value === "kanban" || value === "table" || value === "calendar";
}

function allowedSet(options: PaperclipViewLayoutStorageOptions | undefined): Set<PaperclipViewLayoutId> | null {
  const a = options?.allowed;
  if (!a?.length) return null;
  return new Set(a);
}

function coerce(
  value: string | null | undefined,
  allowed: Set<PaperclipViewLayoutId> | null,
  fallback: PaperclipViewLayoutId,
): PaperclipViewLayoutId {
  if (!isPaperclipViewLayoutId(value)) return fallback;
  if (allowed && !allowed.has(value)) return fallback;
  return value;
}

export function createPaperclipViewLayoutStorage(
  keys: PaperclipViewLayoutStorageKeys,
  options?: PaperclipViewLayoutStorageOptions,
): PaperclipViewLayoutStorage {
  const allowed = allowedSet(options);
  const fallback: PaperclipViewLayoutId = options?.fallback ?? "list";

  const loadLast = (): PaperclipViewLayoutId => {
    try {
      const raw = localStorage.getItem(keys.lastKey);
      return coerce(raw, allowed, fallback);
    } catch {
      return fallback;
    }
  };

  const saveLast = (layout: PaperclipViewLayoutId): void => {
    const v = coerce(layout, allowed, fallback);
    try {
      localStorage.setItem(keys.lastKey, v);
    } catch {
      /* ignore */
    }
  };

  const loadFavorite = (): PaperclipViewLayoutId | null => {
    try {
      const raw = localStorage.getItem(keys.favoriteKey);
      if (!isPaperclipViewLayoutId(raw)) return null;
      if (allowed && !allowed.has(raw)) return null;
      return raw;
    } catch {
      return null;
    }
  };

  const saveFavorite = (layout: PaperclipViewLayoutId): void => {
    const v = coerce(layout, allowed, fallback);
    try {
      localStorage.setItem(keys.favoriteKey, v);
    } catch {
      /* ignore */
    }
  };

  const clearFavorite = (): void => {
    try {
      localStorage.removeItem(keys.favoriteKey);
    } catch {
      /* ignore */
    }
  };

  const toggleFavorite = (layout: PaperclipViewLayoutId): PaperclipViewLayoutId | null => {
    const v = coerce(layout, allowed, fallback);
    const cur = loadFavorite();
    if (cur === v) {
      clearFavorite();
      return null;
    }
    saveFavorite(v);
    return v;
  };

  const resolveWithoutUrlParam = (): PaperclipViewLayoutId => {
    const fav = loadFavorite();
    if (fav) return fav;
    return loadLast();
  };

  const normalizeUrlParam = (value: string | null | undefined): PaperclipViewLayoutId => {
    if (isPaperclipViewLayoutId(value) && (!allowed || allowed.has(value))) return value;
    return resolveWithoutUrlParam();
  };

  return {
    loadLast,
    saveLast,
    loadFavorite,
    saveFavorite,
    clearFavorite,
    toggleFavorite,
    resolveWithoutUrlParam,
    normalizeUrlParam,
  };
}
