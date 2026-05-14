"use client";

import { ChevronDown, Search, AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchReferenceOptions } from "@/lib/data-model/reference-options";

const EMPTY_CONTEXT = Object.freeze({});

function SearchableSelect({
  value,
  options,
  disabled,
  placeholder = "Select...",
  onChange,
  pageSize = 8,
  footer,
  loading,
  emptyHint,
  serverDriven,
  onSearchChange
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!serverDriven || !onSearchChange) return undefined;
    const handle = setTimeout(() => onSearchChange(query), 220);
    return () => clearTimeout(handle);
  }, [query, serverDriven, onSearchChange]);

  const selected = options.find((option) => option.value === String(value || ""));
  const filtered = useMemo(() => {
    if (serverDriven) return options;
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.label} ${option.value} ${option.secondaryLabel || ""}`.toLowerCase().includes(needle)
    );
  }, [options, query, serverDriven]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleOptions = filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [query, options.length]);

  return (
    <div
      className={`dm-select${open ? " open" : ""}${disabled ? " disabled" : ""}`}
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="dm-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? "" : "empty"}>{selected?.label || placeholder}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="dm-select-popover">
          <label className="dm-select-search">
            <Search size={14} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              placeholder="Search..."
              onChange={(event) => {
                const next = event.target.value;
                setQuery(next);
              }}
            />
          </label>
          {loading && <p className="dm-select-empty" style={{ padding: 8 }}>Loading…</p>}
          {!loading && (
            <div className="dm-select-list" role="listbox">
              <button
                type="button"
                className={`dm-select-option${!value ? " selected" : ""}`}
                role="option"
                aria-selected={!value}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <span>{placeholder}</span>
              </button>
              {visibleOptions.map((option) => (
                <button
                  type="button"
                  key={`${option.value}:${option.label}`}
                  className={`dm-select-option${option.value === String(value || "") ? " selected" : ""}`}
                  role="option"
                  aria-selected={option.value === String(value || "")}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                  if (serverDriven && onSearchChange) onSearchChange("");
                }}
                >
                  <span>{option.label}</span>
                  {option.secondaryLabel && <em>{option.secondaryLabel}</em>}
                </button>
              ))}
              {visibleOptions.length === 0 && (
                <p className="dm-select-empty">{emptyHint || "No matches"}</p>
              )}
            </div>
          )}
          {filtered.length > pageSize && (
            <div className="dm-select-pager">
              <button type="button" disabled={currentPage === 0} onClick={() => setPage((next) => Math.max(0, next - 1))}>Prev</button>
              <span>{currentPage + 1} / {pageCount}</span>
              <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage((next) => Math.min(pageCount - 1, next + 1))}>Next</button>
            </div>
          )}
          {footer}
        </div>
      )}
    </div>
  );
}

export function ReferencePicker({
  objectId,
  field,
  value,
  onChange,
  disabled,
  placeholder = "Select reference…",
  context = EMPTY_CONTEXT
}) {
  const [options, setOptions] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [liveQuery, setLiveQuery] = useState("");
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPage = useCallback(async ({ query, cursor, append }) => {
    if (!objectId || !field) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const payload = await fetchReferenceOptions({
        objectId,
        field,
        query: query || "",
        cursor,
        limit: 25,
        context
      });
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      const next = Array.isArray(payload.options) ? payload.options : [];
      setOptions((prev) => (append ? [...prev, ...next] : next));
      setNextCursor(payload.nextCursor || null);
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(err?.message || "Failed to load options");
      if (!append) setOptions([]);
    } finally {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setLoading(false);
    }
  }, [objectId, field, context]);

  useEffect(() => {
    loadPage({ query: liveQuery, cursor: null, append: false });
  }, [liveQuery, objectId, field, loadPage]);

  useEffect(() => {
    setLiveQuery("");
  }, [objectId, field]);

  const valueInOptions = useMemo(
    () => options.some((o) => String(o.value) === String(value || "")),
    [options, value]
  );
  const showRepair = Boolean(value) && !valueInOptions && !loading;

  return (
    <div className="dm-reference-picker">
      {error && <p className="dm-field-error" style={{ fontSize: 11 }}>{error}</p>}
      {showRepair && (
        <p className="dm-validation-banner" style={{ fontSize: 11, marginBottom: 6 }}>
          <AlertTriangle size={12} aria-hidden />
          <span>Selected reference is missing or filtered out. Pick a new row or adjust API Registry status.</span>
        </p>
      )}
      <SearchableSelect
        value={value || ""}
        options={options.map((o) => ({
          value: String(o.value),
          label: String(o.label || o.value),
          secondaryLabel: o.secondaryLabel
        }))}
        disabled={disabled}
        placeholder={placeholder}
        pageSize={10}
        loading={loading}
        emptyHint="No matches — try another search"
        onChange={onChange}
        serverDriven
        onSearchChange={setLiveQuery}
        footer={
          nextCursor ? (
            <div style={{ padding: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <button
                type="button"
                className="dm-btn-ghost"
                disabled={loading || disabled}
                onClick={() => loadPage({ query: liveQuery, cursor: nextCursor, append: true })}
              >
                Load more
              </button>
            </div>
          ) : null
        }
      />
    </div>
  );
}

export { SearchableSelect };
