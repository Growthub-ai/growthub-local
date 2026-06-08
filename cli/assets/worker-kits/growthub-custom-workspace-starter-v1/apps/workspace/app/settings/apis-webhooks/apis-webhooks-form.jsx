"use client";

import { Eye, EyeOff, Link as LinkIcon, Plus, X } from "lucide-react";
import { useState } from "react";

const PAGE_SIZE = 10;

function blankRef(kind) {
  return {
    id: kind === "webhook" ? "webhook-ref" : "api-ref",
    kind,
    endpointRef: "",
    value: "",
    url: "",
    showValue: false,
    showUrl: false,
    hasSecret: false,
    status: "not-configured"
  };
}

function normalizeRef(item, index) {
  const kind = item.kind === "webhook" ? "webhook" : "api";
  return {
    id: item.id || `${kind}-ref-${index + 1}`,
    kind,
    endpointRef: item.endpointRef || "",
    value: "",
    url: item.url || "",
    showValue: false,
    showUrl: Boolean(item.url),
    hasSecret: item.hasSecret === true,
    status: item.status || "not-configured"
  };
}

function displayKind(kind) {
  return kind === "webhook" ? "Webhook" : "API";
}

function SecretValue({ item, onChange, onToggle }) {
  const hiddenValue = item.hasSecret && !item.showValue;
  return <div className="workspace-secret-field">
    <input
      aria-label={`${displayKind(item.kind)} value`}
      autoComplete="off"
      placeholder={item.hasSecret ? "••••••••••••" : "Value"}
      type={hiddenValue ? "password" : "text"}
      value={hiddenValue ? "************" : item.value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => {
        if (hiddenValue) onToggle(true);
      }}
    />
    <button type="button" aria-label={item.showValue ? "Hide value" : "Show value"} onClick={() => onToggle(!item.showValue)}>
      {item.showValue ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  </div>;
}

function ConfigRow({ item, index, copiedKey, onCopyKey, onRemove, onUpdate }) {
  const configured = item.hasSecret || item.status === "configured";
  const keyText = item.endpointRef || "";
  return <article className="workspace-secret-row">
    <h3>{displayKind(item.kind)}</h3>
    <div className="workspace-secret-row-main">
      {configured && keyText ? <button
          type="button"
          className="workspace-key-field"
          data-tooltip={copiedKey === item.id ? "Copied" : "Click to copy"}
          onClick={() => onCopyKey(item)}
        >{keyText}</button>
        : <input
          aria-label={`${displayKind(item.kind)} key`}
          value={item.endpointRef}
          onChange={(event) => onUpdate(index, { endpointRef: event.target.value })}
          placeholder="Key"
        />}
      <SecretValue
        item={item}
        onChange={(value) => onUpdate(index, { value, hasSecret: Boolean(value) || item.hasSecret, showValue: true })}
        onToggle={(showValue) => onUpdate(index, { showValue })}
      />
      <button type="button" className="workspace-icon-button" aria-label={`Remove ${displayKind(item.kind)} ref`} onClick={() => onRemove(index)}>
        <X size={15} />
      </button>
    </div>
    {item.showUrl || item.url ? <label className="workspace-url-field">
      <span>{displayKind(item.kind)} URL</span>
      <input
        value={item.url}
        onChange={(event) => onUpdate(index, { url: event.target.value, showUrl: true })}
        placeholder={item.kind === "webhook" ? "Webhook URL" : "API URL"}
      />
    </label> : <button type="button" className="workspace-link-button" onClick={() => onUpdate(index, { showUrl: true })}>
      <LinkIcon size={13} aria-hidden="true" />
      <span>Add optional {displayKind(item.kind)} URL</span>
    </button>}
  </article>;
}

function ApisWebhooksForm({ persistence, refs }) {
  const initialRefs = refs.length ? refs.map(normalizeRef) : [blankRef("api"), blankRef("webhook")];
  const [items, setItems] = useState(initialRefs);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [page, setPage] = useState(0);
  const canSave = persistence?.canSave !== false;
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount - 1);
  const visibleItems = items.slice(activePage * PAGE_SIZE, activePage * PAGE_SIZE + PAGE_SIZE);

  function updateItem(index, patch) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function removeItem(index) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function copyKey(item) {
    const value = item.endpointRef || "";
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    setCopiedKey(item.id);
    window.setTimeout(() => setCopiedKey(""), 1400);
  }

  async function save(event) {
    event.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/apis-webhooks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          refs: items.map((item) => ({
            id: item.id,
            kind: item.kind,
            endpointRef: item.endpointRef,
            url: item.url,
            value: item.value || "",
            status: item.endpointRef || item.value ? "configured" : "not-configured",
            hasSecret: Boolean(item.value) || item.hasSecret
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.guidance || payload.error || "Failed to save API/Webhook refs");
      setItems(payload.refs.length ? payload.refs.map(normalizeRef) : [blankRef("api"), blankRef("webhook")]);
      const envCount = Array.isArray(payload.envWritten) ? payload.envWritten.length : 0;
      setMessage(envCount > 0
        ? `Saved. ${envCount} secret(s) written to .env.local (restart dev server if keys were new).`
        : "Saved.");
    } catch (error) {
      setMessage(error.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="workspace-settings-card" onSubmit={save}>
    <div className="workspace-settings-card-heading">
      <div>
        <h2>APIs & Webhooks</h2>
        <p>Save secret references for this workspace. Values are hidden after save.</p>
      </div>
      <div className="workspace-settings-top-actions">
        <button type="button" className="workspace-secondary-button" onClick={() => setItems((current) => [...current, blankRef("api")])}>
          <Plus size={13} aria-hidden="true" />
          <span>Add API key</span>
        </button>
        <button type="button" className="workspace-secondary-button" onClick={() => setItems((current) => [...current, blankRef("webhook")])}>
          <Plus size={13} aria-hidden="true" />
          <span>Add webhook key</span>
        </button>
        <button type="submit" disabled={!canSave || saving}>{saving ? "Saving..." : "Save"}</button>
      </div>
    </div>

    <section className="workspace-settings-section">
      <div className="workspace-secret-list">
        {visibleItems.map((item, visibleIndex) => {
          const index = activePage * PAGE_SIZE + visibleIndex;
          return <ConfigRow
          copiedKey={copiedKey}
          index={index}
          item={item}
          key={`${item.id}:${index}`}
          onCopyKey={copyKey}
          onRemove={removeItem}
          onUpdate={updateItem}
        />;
        })}
      </div>
      {pageCount > 1 ? <div className="workspace-pagination">
        <button type="button" disabled={activePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
        <span>{activePage + 1} / {pageCount}</span>
        <button type="button" disabled={activePage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</button>
      </div> : null}
    </section>

    {message ? <p className="workspace-settings-message">{message}</p> : null}
  </form>;
}

export {
  ApisWebhooksForm
};
