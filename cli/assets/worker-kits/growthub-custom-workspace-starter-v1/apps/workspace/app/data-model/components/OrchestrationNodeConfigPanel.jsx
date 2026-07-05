"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Check, ChevronDown, Database, FileInput, KeyRound, ListTree, Webhook } from "lucide-react";
import {
  CAPABILITY_NODE_TYPES,
  detectFieldIdsFromLastResponse,
  FILTER_CONJUNCTIONS,
  FILTER_OPERATORS,
  isApiRegistryTestSuccessful,
  substituteVariables
} from "@/lib/orchestration-graph";
import { SandboxAgentAuthPanel } from "./SandboxAgentAuthPanel.jsx";
import { isSandboxLocalAgentHost } from "@/lib/sandbox-agent-auth-eligibility";
import { HOST_AUTH_CATALOG } from "@/lib/sandbox-agent-host-catalog";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const SUPABASE_DATA_OPERATIONS = ["select", "insert", "update", "upsert", "delete", "rpc"];
// Read-only V1 allowlist — mirrors STRIPE_COMMERCE_OPERATIONS in the runner.
const STRIPE_COMMERCE_OPERATIONS = ["list-payment-intents", "list-customers", "list-products", "retrieve-balance"];
const MODEL_OPTIONS = ["Claude Opus 4.6", "Claude Sonnet 4.5", "GPT-5.2", "Local agent host"];
const OUTPUT_TYPES = ["Text", "Number", "Boolean", "JSON", "Record ID"];
const LOCAL_AGENT_ADAPTERS = [
  { value: "local-process", label: "Local process" },
  { value: "local-agent-host", label: "Local agent host" },
  { value: "local-intelligence", label: "Local intelligence" }
];
const LOCAL_INTELLIGENCE_MODE_OPTIONS = [
  { value: "ollama", label: "ollama (OLLAMA_BASE_URL + /v1/chat/completions)" },
  { value: "lmstudio", label: "lmstudio (LMSTUDIO_BASE_URL)" },
  { value: "vllm", label: "vllm (VLLM_BASE_URL required)" },
  { value: "custom-openai-compatible", label: "custom (use Chat completions URL above)" }
];
const EMPTY_AGENT_AUTH_PATCH = {
  agentAuthStatus: "",
  agentAuthProvider: "",
  agentAuthLastChecked: "",
  agentAuthLastExitCode: "",
  agentAuthLastMessage: "",
  agentAuthLastLoginUrl: ""
};

function WorkflowCheckbox({ checked, disabled, onChange, children, title }) {
  return (
    <label className="dm-orchestration-config__field dm-orchestration-config__field-inline dm-workflow-check" title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span className="dm-workflow-check__box" aria-hidden="true">
        {checked ? <Check size={13} strokeWidth={2.4} /> : null}
      </span>
      <span>{children}</span>
    </label>
  );
}

function getAgentHostOptions() {
  return Object.entries(HOST_AUTH_CATALOG || {}).map(([slug, host]) => ({
    value: slug,
    label: host?.label || slug
  }));
}
function normalizeTags(tags) {
  return Array.from(new Set((Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .filter(Boolean)));
}

function inferDeltaTagsForNode(node, config) {
  const tags = [];
  const type = String(node?.type || "").trim();
  const action = String(config?.action || node?.id || "").trim();

  if (type === "thinAdapter") tags.push("model", "prompt", "routing");
  if (type === "ai-agent") tags.push("model", "prompt", "output");
  if (type === "data-action" || type === "data-trigger") tags.push("input", "output");
  if (CAPABILITY_NODE_TYPES.includes(type)) tags.push("input", "output");
  if (type === "flow-control") tags.push("routing");
  if (type === "core-action") tags.push("runtime");
  if (type === "human-input") tags.push("input");

  if (action.includes("search") || action.includes("filter") || type === "transform-filter") tags.push("evaluation", "guardrail");
  if (action.includes("delete") || config?.operation === "update" || config?.operation === "delete" || config?.confirmationRequired) tags.push("guardrail");
  if (action.includes("http") || config?.url || config?.method) tags.push("routing", "input", "output");
  if (action.includes("email")) tags.push("input", "output");
  if (action.includes("delay") || config?.duration || config?.unit) tags.push("runtime");
  if (config?.objectId || config?.fieldMap || config?.filters) tags.push("input", "output");
  if (config?.model || config?.prompt) tags.push("model", "prompt");

  return normalizeTags(tags);
}

function getDeltaTagDefaultValue(tag, node, config, sandboxRow) {
  const normalized = String(tag || "").trim().toLowerCase();
  if (normalized === "model") {
    return String(config?.model || sandboxRow?.adapter || sandboxRow?.executionAdapter || sandboxRow?.runAdapter || node?.sandbox || "").trim();
  }
  if (normalized === "prompt") {
    return String(config?.prompt || sandboxRow?.prompt || sandboxRow?.instructions || sandboxRow?.command || "").trim();
  }
  if (normalized === "routing") {
    return String(config?.inputBinding || config?.executionPolicy || config?.filterMode || config?.endpoint || config?.url || "").trim();
  }
  if (normalized === "input") {
    return String(config?.objectName || config?.objectId || config?.inputBinding || config?.bodyTemplate || config?.samplePayload ? (
      config?.objectName || config?.objectId || config?.inputBinding || "configured input"
    ) : "").trim();
  }
  if (normalized === "output") {
    return String(config?.outputKey || config?.outputVariable || config?.outputField || config?.fieldMap ? (
      config?.outputKey || config?.outputVariable || config?.outputField || "configured output"
    ) : "").trim();
  }
  if (normalized === "evaluation") {
    return String(config?.filters || config?.successStatusCodes || config?.expectedStatus ? "configured evaluation" : "").trim();
  }
  if (normalized === "guardrail") {
    return String(config?.confirmationRequired ? "confirmation required" : config?.networkPolicy || sandboxRow?.networkPolicy || "").trim();
  }
  if (normalized === "runtime") {
    return String(config?.duration || config?.unit ? `${config.duration || ""} ${config.unit || ""}`.trim() : sandboxRow?.runtime || "").trim();
  }
  return String(config?.deltaValues?.[normalized] || "").trim();
}

function getObjectFields(object) {
  return (Array.isArray(object?.fields) ? object.fields : [])
    .map((field) => ({
      id: String(field.id || field.name || field.label || "").trim(),
      label: String(field.label || field.name || field.id || "").trim(),
      type: String(field.type || field.fieldType || "text").trim()
    }))
    .filter((field) => field.id);
}

function getSelectedObject(workspaceObjects, objectId) {
  return workspaceObjects.find((object) => String(object.id) === String(objectId || "")) || null;
}

/**
 * Security boundary for stored email HTML — the invariant is "email HTML
 * only, never app-executed": the design surface re-renders stored markup via
 * innerHTML, so every assignment passes through this sanitizer (script
 * blocks, inline event handlers, and javascript: URLs are stripped). The raw
 * template the user typed lives untouched in the HTML tab's textarea and in
 * config.htmlTemplate; the governed messaging door applies the same strip
 * server-side before any send.
 */
function sanitizeEmailHtml(html) {
  return String(html || "")
    .replace(/<script\b[\s\S]*?(?:<\/script>|$)/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, "$1=$2#$2");
}

/**
 * Email body editor for the resend-email node — Design (rich text), HTML,
 * Plain text, and Preview modes over the stored templates
 * (config.htmlTemplate / config.textTemplate). Design edits a contentEditable
 * surface with a formatting toolbar and token insertion; HTML edits raw
 * markup; Text edits the plain-text alternative; Preview renders the
 * sanitized HTML at desktop/mobile widths. {{input.key}} tokens survive
 * every view.
 */
function EmailBodyEditor({ html, text, disabled, onChangeHtml, onChangeText, tokens = [] }) {
  const [mode, setMode] = useState("design");
  const [previewDevice, setPreviewDevice] = useState("desktop");
  const [tokenDraft, setTokenDraft] = useState("");
  const [imageSelected, setImageSelected] = useState(false);
  const [, setImageTick] = useState(0);
  const [fullView, setFullView] = useState(false);
  const [surfaceHeight, setSurfaceHeight] = useState(180);
  const editorRef = useRef(null);
  const selectedImageRef = useRef(null);
  const htmlAreaRef = useRef(null);
  const textAreaRef = useRef(null);
  // The in-editor selection marker (data-dm-selected) is UI-only chrome —
  // it must never reach the stored template, so every read of the surface
  // goes through this serializer instead of raw innerHTML.
  function serializeSurfaceHtml() {
    const surface = editorRef.current;
    if (!surface) return "";
    const clone = surface.cloneNode(true);
    clone.querySelectorAll("img[data-dm-selected]").forEach((img) => img.removeAttribute("data-dm-selected"));
    return clone.innerHTML;
  }
  function clearImageSelection() {
    editorRef.current?.querySelectorAll("img[data-dm-selected]").forEach((img) => img.removeAttribute("data-dm-selected"));
    selectedImageRef.current = null;
    setImageSelected(false);
  }
  // Push external value into the design surface only when it actually
  // differs — otherwise every keystroke would reset the caret. Compare the
  // SERIALIZED surface (marker stripped) so an active image selection is not
  // wiped by its own edits.
  useEffect(() => {
    if (mode !== "design" || !editorRef.current) return;
    // innerHTML re-render is the app-execution boundary — always sanitized.
    const safe = sanitizeEmailHtml(html);
    if (serializeSurfaceHtml() !== safe) {
      editorRef.current.innerHTML = safe;
      selectedImageRef.current = null;
      setImageSelected(false);
    }
    // fullView is a dep because toggling it REMOUNTS the surface (inline ↔
    // modal portal) with empty DOM — the effect must refill it.
  }, [mode, html, fullView]);
  useEffect(() => {
    if (mode !== "design") {
      selectedImageRef.current = null;
      setImageSelected(false);
    }
  }, [mode]);
  useEffect(() => {
    if (!fullView) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setFullView(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullView]);
  // Bottom-left drag grip: vertical expand of whichever writing surface is
  // active (design / HTML / text). Pointer-tracked, clamped, no layout jumps.
  function startSurfaceResize(event) {
    if (disabled) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = surfaceHeight;
    function onMove(moveEvent) {
      setSurfaceHeight(Math.min(680, Math.max(140, startHeight + (moveEvent.clientY - startY))));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function exec(command, argument = null) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    onChangeHtml(serializeSurfaceHtml());
  }
  // Automatic sizing optimization: every inserted image ships INLINE
  // email-client-safe sizing (max-width 100%, auto height, block display) —
  // the sent HTML carries it, not just the in-app CSS. Idempotent over all
  // images so pasted markup gets normalized too.
  function normalizeSurfaceImages() {
    editorRef.current?.querySelectorAll("img").forEach((img) => {
      if (!img.style.maxWidth) img.style.maxWidth = "100%";
      if (!img.style.height) img.style.height = "auto";
      if (!img.style.display) img.style.display = "block";
    });
  }
  function insertOptimizedImage(src) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand("insertImage", false, src);
    normalizeSurfaceImages();
    onChangeHtml(serializeSurfaceHtml());
  }
  function handleSurfaceClick(event) {
    const target = event.target;
    if (target && target.tagName === "IMG") {
      editorRef.current?.querySelectorAll("img[data-dm-selected]").forEach((img) => {
        if (img !== target) img.removeAttribute("data-dm-selected");
      });
      target.setAttribute("data-dm-selected", "1");
      selectedImageRef.current = target;
      setImageSelected(true);
      setImageTick((tick) => tick + 1);
      return;
    }
    clearImageSelection();
  }
  // On-click image controls: explicit width presets, alignment, alt text,
  // remove — every action writes inline styles (what email clients read),
  // then persists the serialized surface. No broken states: actions guard on
  // the image still being attached.
  function withSelectedImage(action) {
    const img = selectedImageRef.current;
    if (!img || !img.isConnected) {
      clearImageSelection();
      return;
    }
    action(img);
    normalizeSurfaceImages();
    onChangeHtml(serializeSurfaceHtml());
    setImageTick((tick) => tick + 1);
  }
  const IMAGE_WIDTH_PRESETS = [["Auto", ""], ["25%", "25%"], ["50%", "50%"], ["75%", "75%"], ["Full", "100%"]];
  const IMAGE_ALIGN_PRESETS = [["Left", "0 auto 0 0"], ["Center", "0 auto"], ["Right", "0 0 0 auto"]];
  const selectedImageWidth = selectedImageRef.current?.style?.width || "";
  const selectedImageMargin = selectedImageRef.current?.style?.margin || "";
  function insertToken(name) {
    const token = `{{input.${String(name || "").trim().replace(/[^a-zA-Z0-9_.-]/g, "") || "value"}}}`;
    if (mode === "design") {
      exec("insertText", token);
      return;
    }
    const areaRef = mode === "text" ? textAreaRef : htmlAreaRef;
    const value = mode === "text" ? String(text || "") : String(html || "");
    const setValue = mode === "text" ? onChangeText : onChangeHtml;
    const area = areaRef.current;
    const at = area && typeof area.selectionStart === "number" ? area.selectionStart : value.length;
    setValue(`${value.slice(0, at)}${token}${value.slice(at)}`);
  }
  const toolbar = [
    { id: "bold", label: "B", title: "Bold", style: { fontWeight: 700 } },
    { id: "italic", label: "I", title: "Italic", style: { fontStyle: "italic" } },
    { id: "underline", label: "U", title: "Underline", style: { textDecoration: "underline" } },
    { id: "insertUnorderedList", label: "• List", title: "Bulleted list" },
    { id: "insertOrderedList", label: "1. List", title: "Numbered list" },
  ];
  const modes = [["design", "Design"], ["html", "HTML"], ["text", "Text"], ["preview", "Preview"]];
  const previewHtml = sanitizeEmailHtml(html) || (text ? `<pre style="white-space:pre-wrap;font-family:inherit">${String(text).replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]))}</pre>` : "");
  const [variableOpen, setVariableOpen] = useState(false);
  const editorBody = (
    <>
      <div className="dm-email-editor__bar" role="toolbar" aria-label="Email editor actions">
        <div className="dm-orchestration-config__tabs dm-email-editor__tabs" role="tablist">
          {modes.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} className={mode === id ? "is-active" : ""} onClick={() => { setMode(id); setVariableOpen(false); }}>
              {label}
            </button>
          ))}
        </div>
        {mode === "design" ? (
          <>
            <i className="dm-email-editor__divider" aria-hidden="true" />
            <div className="dm-email-editor__toolbar" role="group" aria-label="Formatting">
              {toolbar.map((tool) => (
                <button key={tool.id} type="button" title={tool.title} style={tool.style} disabled={disabled} onClick={() => exec(tool.id)}>
                  {tool.label}
                </button>
              ))}
              <button
                type="button"
                title="Insert link"
                disabled={disabled}
                onClick={() => {
                  const href = window.prompt("Link URL (https://…)");
                  if (href) exec("createLink", href);
                }}
              >
                Link
              </button>
              <button
                type="button"
                title="Insert image"
                disabled={disabled}
                onClick={() => {
                  const src = window.prompt("Image URL (https://…)");
                  if (src) insertOptimizedImage(src);
                }}
              >
                Image
              </button>
              <button type="button" title="Heading" disabled={disabled} onClick={() => exec("formatBlock", "<h2>")}>H2</button>
              <button type="button" title="Paragraph" disabled={disabled} onClick={() => exec("formatBlock", "<p>")}>¶</button>
            </div>
          </>
        ) : null}
        {mode !== "preview" ? (
          <>
            <i className="dm-email-editor__divider" aria-hidden="true" />
            <div className="dm-email-editor__variable">
              <button
                type="button"
                className={variableOpen ? "is-active" : ""}
                title="Insert a {{input.*}} variable"
                disabled={disabled}
                onClick={() => setVariableOpen((open) => !open)}
              >
                {"{{…}}"} Variable
              </button>
              {variableOpen ? (
                <div className="dm-email-editor__tokens" role="menu" aria-label="Insert variable">
                  {Array.from(new Set(tokens)).slice(0, 6).map((name) => (
                    <button key={name} type="button" role="menuitem" title={`Insert {{input.${name}}}`} disabled={disabled} onClick={() => { insertToken(name); setVariableOpen(false); }}>
                      {`{{${name}}}`}
                    </button>
                  ))}
                  <input
                    value={tokenDraft}
                    placeholder="variable name"
                    disabled={disabled}
                    onChange={(event) => setTokenDraft(event.target.value)}
                  />
                  <button type="button" disabled={disabled || !tokenDraft.trim()} onClick={() => { insertToken(tokenDraft); setTokenDraft(""); setVariableOpen(false); }}>
                    Insert variable
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        {mode === "preview" ? (
          <>
            <i className="dm-email-editor__divider" aria-hidden="true" />
            <div className="dm-orchestration-config__tabs dm-email-editor__devices" role="tablist" aria-label="Preview device">
              <button type="button" role="tab" aria-selected={previewDevice === "desktop"} className={previewDevice === "desktop" ? "is-active" : ""} onClick={() => setPreviewDevice("desktop")}>Desktop</button>
              <button type="button" role="tab" aria-selected={previewDevice === "mobile"} className={previewDevice === "mobile" ? "is-active" : ""} onClick={() => setPreviewDevice("mobile")}>Mobile</button>
            </div>
          </>
        ) : null}
        <button
          type="button"
          className="dm-email-editor__expand"
          title={fullView ? "Close full view" : "Expand to full-width view"}
          aria-label={fullView ? "Close full view" : "Expand editor to full view"}
          onClick={() => setFullView((open) => !open)}
        >
          {fullView ? "✕ Close" : "⛶ Expand"}
        </button>
      </div>
      {mode === "design" && imageSelected ? (
        <div className="dm-email-editor__toolbar dm-email-editor__imgbar" role="toolbar" aria-label="Image controls">
          <span className="dm-email-editor__imgbar-label">Image</span>
          {IMAGE_WIDTH_PRESETS.map(([label, width]) => (
            <button
              key={label}
              type="button"
              title={width ? `Width ${width}` : "Natural size (capped at 100%)"}
              className={selectedImageWidth === width ? "is-active" : ""}
              disabled={disabled}
              onClick={() => withSelectedImage((img) => { img.style.width = width; })}
            >
              {label}
            </button>
          ))}
          {IMAGE_ALIGN_PRESETS.map(([label, margin]) => (
            <button
              key={label}
              type="button"
              title={`Align ${label.toLowerCase()}`}
              className={selectedImageMargin === margin ? "is-active" : ""}
              disabled={disabled}
              onClick={() => withSelectedImage((img) => { img.style.margin = margin; })}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            title="Describe the image for text-only clients"
            disabled={disabled}
            onClick={() => {
              const alt = window.prompt("Alt text (what this image shows)", selectedImageRef.current?.getAttribute("alt") || "");
              if (alt !== null) withSelectedImage((img) => img.setAttribute("alt", alt));
            }}
          >
            Alt
          </button>
          <button
            type="button"
            title="Remove image"
            disabled={disabled}
            onClick={() => {
              withSelectedImage((img) => img.remove());
              clearImageSelection();
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
      {mode === "design" ? (
        <div key="design-surface-wrap" className="dm-email-editor__surface-wrap">
          <div
            ref={editorRef}
            className="dm-email-editor__surface"
            contentEditable={!disabled}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Email body design surface"
            style={{ height: surfaceHeight }}
            onInput={() => onChangeHtml(serializeSurfaceHtml())}
            onClick={handleSurfaceClick}
          />
          <button type="button" className="dm-email-editor__resize" title="Drag to resize" aria-label="Drag to resize the editor" onPointerDown={startSurfaceResize}>⋮⋮</button>
        </div>
      ) : mode === "html" ? (
        <div className="dm-email-editor__surface-wrap">
          <textarea ref={htmlAreaRef} value={html || ""} disabled={disabled} spellCheck={false} style={{ height: surfaceHeight }} onChange={(e) => onChangeHtml(e.target.value)} />
          <button type="button" className="dm-email-editor__resize" title="Drag to resize" aria-label="Drag to resize the editor" onPointerDown={startSurfaceResize}>⋮⋮</button>
        </div>
      ) : mode === "text" ? (
        <div className="dm-email-editor__surface-wrap">
          <textarea ref={textAreaRef} value={text || ""} disabled={disabled} spellCheck={false} style={{ height: surfaceHeight }} onChange={(e) => onChangeText(e.target.value)} />
          <button type="button" className="dm-email-editor__resize" title="Drag to resize" aria-label="Drag to resize the editor" onPointerDown={startSurfaceResize}>⋮⋮</button>
        </div>
      ) : (
        <div key="preview-frame" className="dm-email-editor__frame">
          <div
            className="dm-email-editor__preview"
            aria-label={`Email preview (${previewDevice})`}
            style={{ width: previewDevice === "mobile" ? 320 : 600 }}
            // Sanitized above — the same boundary every design-surface render uses.
            dangerouslySetInnerHTML={{ __html: previewHtml || "<p style='color:#8a8f98'>Nothing to preview yet — write a body in Design, HTML, or Text.</p>" }}
          />
        </div>
      )}
    </>
  );
  return (
    <div className="dm-orchestration-config__field dm-email-editor">
      <span>Body</span>
      {fullView && typeof document !== "undefined" ? (
        <>
          <p className="dm-email-editor__fullnote">Editing in full view — changes apply to this node live.</p>
          {createPortal(
            <div className="dm-email-editor-modal" role="dialog" aria-modal="true" aria-label="Email editor full view">
              <div className="dm-email-editor-modal__backdrop" role="presentation" onClick={() => setFullView(false)} />
              <section className="dm-email-editor-modal__panel">
                <div className="dm-email-editor-modal__head">
                  <strong>Email body — full view</strong>
                  <span>Esc or ✕ Close returns to the node sidecar.</span>
                </div>
                {editorBody}
              </section>
            </div>,
            document.body,
          )}
        </>
      ) : (
        editorBody
      )}
    </div>
  );
}

/**
 * Envelope for the resend-email node — To / From / Subject / Preview text as
 * a compact breadcrumb bar, SEPARATE from the body-editing experience.
 * Editing the envelope is intentional: click a crumb (or Edit) to open the
 * fields; the bar stays collapsed while agents and humans work on content.
 * Opens automatically only while required fields are missing.
 */
function EmailEnvelope({ config, disabled, patchConfig, flagFieldClass = () => "" }) {
  const to = String(config.toTemplate || config.to || "");
  const from = String(config.fromTemplate || config.from || "");
  const subject = String(config.subjectTemplate || config.subject || "");
  const previewText = String(config.previewTextTemplate || "");
  const [open, setOpen] = useState(!(to.trim() && subject.trim()));
  const crumb = (label, value, placeholder) => (
    <button key={label} type="button" className="dm-email-envelope__crumb" title={`Edit ${label.toLowerCase()}`} onClick={() => setOpen(true)}>
      <span>{label}</span>
      <strong className={value ? "" : "is-empty"}>{value || placeholder}</strong>
    </button>
  );
  return (
    <div className="dm-email-envelope">
      <div className="dm-email-envelope__bar" role="group" aria-label="Email envelope">
        {crumb("To", to, "Set recipient")}
        <span className="dm-email-envelope__sep" aria-hidden="true">›</span>
        {crumb("From", from, "RESEND_FROM_EMAIL")}
        <span className="dm-email-envelope__sep" aria-hidden="true">›</span>
        {crumb("Subject", subject, "Set subject")}
        <span className="dm-email-envelope__sep" aria-hidden="true">›</span>
        {crumb("Preview", previewText, "Inbox preview line")}
        <button type="button" className="dm-email-envelope__toggle" onClick={() => setOpen((current) => !current)}>
          {open ? "Done" : "Edit"}
        </button>
      </div>
      {open ? (
        <div className="dm-email-envelope__fields">
          <label className={`dm-orchestration-config__field${flagFieldClass("toTemplate", "to")}`}>
            <span>To</span>
            <input
              value={to}
              placeholder="{{input.email}} or ops@yourdomain.com"
              disabled={disabled}
              onChange={(e) => patchConfig({ toTemplate: e.target.value })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>From (optional)</span>
            <input
              value={from}
              placeholder="Resolved from RESEND_FROM_EMAIL when empty"
              disabled={disabled}
              onChange={(e) => patchConfig({ fromTemplate: e.target.value })}
            />
          </label>
          <label className={`dm-orchestration-config__field${flagFieldClass("subjectTemplate", "subject")}`}>
            <span>Subject</span>
            <input
              value={subject}
              placeholder="Order {{input.id}} received"
              disabled={disabled}
              onChange={(e) => patchConfig({ subjectTemplate: e.target.value })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Preview text</span>
            <input
              value={previewText}
              placeholder="The inbox preview line shown under the subject"
              disabled={disabled}
              onChange={(e) => patchConfig({ previewTextTemplate: e.target.value })}
            />
          </label>
          <label className={`dm-orchestration-config__field${flagFieldClass("registryId", "integrationId")}`}>
            <span>Registry ID</span>
            <input value={config.registryId || "resend-email"} disabled={disabled} onChange={(e) => patchConfig({ registryId: e.target.value })} />
          </label>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Template save/reuse controls for the resend-email node — governed rows on
 * the email-templates object, written only through the messaging door
 * (one receipted save per call), listed from the door's GET. Loading a
 * template patches the draft node config; nothing is optimistic.
 */
function ResendTemplateControls({ config, disabled, patchConfig }) {
  const [templates, setTemplates] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/workspace/add-ons/resend/messaging")
      .then((response) => response.json())
      .then((body) => { if (alive && Array.isArray(body?.templates)) setTemplates(body.templates); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  async function saveTemplate() {
    const name = window.prompt("Template name");
    if (!name) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/workspace/add-ons/resend/messaging", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save-template",
          name,
          subject: config.subjectTemplate || config.subject || "",
          previewText: config.previewTextTemplate || "",
          html: config.htmlTemplate || config.html || "",
          text: config.textTemplate || config.text || "",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body?.error || `Save failed (HTTP ${response.status})`);
        return;
      }
      if (Array.isArray(body.templates)) setTemplates(body.templates);
      setMessage(`Saved "${body?.template?.name || name}" · receipt ${body?.receiptId || ""}`);
    } catch (error) {
      setMessage(error?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }
  function loadTemplate(name) {
    const template = templates.find((entry) => entry.name === name);
    if (!template) return;
    patchConfig({
      subjectTemplate: template.subject,
      previewTextTemplate: template.previewText || "",
      htmlTemplate: template.html,
      textTemplate: template.text,
    });
    setMessage(`Loaded "${template.name}"`);
  }
  return (
    <div className="dm-orchestration-config__field dm-email-templates">
      <span>Templates</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select disabled={disabled || !templates.length} defaultValue="" onChange={(event) => { if (event.target.value) loadTemplate(event.target.value); event.target.value = ""; }}>
          <option value="" disabled>{templates.length ? `Load template (${templates.length})` : "No saved templates yet"}</option>
          {templates.map((template) => (
            <option key={template.name} value={template.name}>{template.name}</option>
          ))}
        </select>
        <button type="button" className="dm-btn-outline" disabled={disabled || busy} onClick={saveTemplate}>
          {busy ? "Saving…" : "Save as template"}
        </button>
        <a
          className="dm-btn-outline"
          href={`/data-model?helper=open&prompt=${encodeURIComponent("Draft a marketing email for the resend-email workflow node: give me a subject line, preview text, and an HTML body with {{input.*}} personalization tokens. Topic: ")}`}
        >
          Draft with AI helper
        </a>
      </div>
      {message ? <p className="dm-orchestration-config__hint">{message}</p> : null}
    </div>
  );
}

/** Variable names already used across the node's send fields + defaults. */
function usedEmailTokens(config) {
  const material = [config?.toTemplate, config?.subjectTemplate, config?.htmlTemplate, config?.textTemplate]
    .map((value) => String(value || ""))
    .join(" ");
  const used = [];
  const pattern = /\{\{\s*input\.([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let match = pattern.exec(material);
  while (match) {
    used.push(match[1]);
    match = pattern.exec(material);
  }
  return Array.from(new Set([...used, "email", "name"]));
}

// Stable short hash of the node's send-shaping fields — the receipt key that
// lets a future publish contract correlate a sidecar send proof to the exact
// draft bytes it tested (workflow row + node id + this hash).
function emailDraftHash(config) {
  const material = JSON.stringify({
    to: String(config?.toTemplate || config?.to || ""),
    subject: String(config?.subjectTemplate || config?.subject || ""),
    html: String(config?.htmlTemplate || config?.html || ""),
    text: String(config?.textTemplate || config?.text || ""),
    from: String(config?.fromTemplate || config?.from || ""),
  });
  let hash = 5381;
  for (let i = 0; i < material.length; i += 1) {
    hash = ((hash << 5) + hash + material.charCodeAt(i)) >>> 0; // djb2
  }
  return hash.toString(16);
}

/**
 * Test pane for the resend-email node — the node-sidecar mirror of the
 * webhook trigger's test-event modal: derive a JSON test event, run the REAL
 * governed send through the messaging door, and show a Verified chip only on
 * a live HTTP success. Proof is stamped onto the node config (lastTest*) and
 * receipted server-side keyed by workflow row + node id + draft hash.
 *
 * HONESTY BOUNDARY: this is NODE-LEVEL proof — the workflow publish gate is
 * still owned by the full draft test / serverless binding proof contract.
 * The pane says so explicitly instead of implying publish is unlocked.
 */
function ResendEmailTestPane({ config, disabled, patchConfig, registryConnected, nodeId = "", workflowRef = "" }) {
  const [doorState, setDoorState] = useState(null);
  const [testInput, setTestInput] = useState('{\n  "email": "customer@example.com"\n}');
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/workspace/add-ons/resend/messaging")
      .then((response) => response.json())
      .then((body) => { if (alive) setDoorState(body); })
      .catch(() => { if (alive) setDoorState({ error: "messaging door unreachable" }); });
    return () => { alive = false; };
  }, []);
  let parsedInput = null;
  try {
    parsedInput = JSON.parse(testInput || "{}");
  } catch {
    parsedInput = null;
  }
  const inputPayload = parsedInput && typeof parsedInput === "object" ? parsedInput : {};
  const resolvedTo = String(sendTo || substituteVariables(String(config.toTemplate || config.to || ""), inputPayload)).trim();
  const canSend = !disabled && !sending && parsedInput !== null && /@/.test(resolvedTo);
  async function sendTestEmail() {
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/workspace/add-ons/resend/messaging", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "send-test",
          to: resolvedTo,
          subject: substituteVariables(String(config.subjectTemplate || config.subject || ""), inputPayload) || "Growthub workflow test email",
          html: substituteVariables(String(config.htmlTemplate || config.html || ""), inputPayload),
          text: substituteVariables(String(config.textTemplate || config.text || ""), inputPayload),
          from: substituteVariables(String(config.fromTemplate || config.from || ""), inputPayload),
          // Receipt correlation key: workflow row + node id + draft hash —
          // the server stamps these into the send receipt so a future
          // publish contract can verify node proof against exact draft bytes.
          context: { workflowRef, nodeId, draftHash: emailDraftHash(config) },
        }),
      });
      const body = await response.json().catch(() => ({}));
      const outcome = {
        ok: response.ok && body?.ok === true,
        httpStatus: body?.httpStatus || response.status,
        providerMessageId: body?.providerMessageId || "",
        testedAt: body?.testedAt || new Date().toISOString(),
        summary: body?.summary || body?.error || `HTTP ${response.status}`,
        receiptId: body?.receiptId || "",
      };
      setResult(outcome);
      // Stamp honest proof onto the draft node — mirrors the webhook proof
      // discipline (state derives from the real outcome, success or not).
      patchConfig({
        lastTestStatus: String(outcome.httpStatus),
        lastTestAt: outcome.testedAt,
        lastTestSummary: outcome.summary,
        lastTestDraftHash: emailDraftHash(config),
        lastTestReceiptId: outcome.receiptId || "",
        sampleResponse: JSON.stringify({ ok: outcome.ok, httpStatus: outcome.httpStatus, id: outcome.providerMessageId }, null, 2),
      });
    } catch (error) {
      setResult({ ok: false, httpStatus: 0, summary: error?.message || "send failed", testedAt: new Date().toISOString() });
    } finally {
      setSending(false);
    }
  }
  // Stale-proof honesty: a stored Verified chip only survives while the
  // send-shaping fields still match the hash that earned it.
  const storedProofFresh = String(config.lastTestStatus || "").startsWith("2")
    && String(config.lastTestDraftHash || "") === emailDraftHash(config);
  const verified = Boolean(result?.ok) || (!result && storedProofFresh);
  return (
    <div className="dm-orchestration-config__pane">
      {verified ? <span className="dm-orchestration-config__badge is-connected">Node tested · Verified {result?.httpStatus || config.lastTestStatus}</span> : null}
      <p className="dm-orchestration-config__meta">1 · Connect</p>
      <div className="dm-orchestration-config__field">
        <span>Sending lane</span>
        <code>
          RESEND_API_KEY {doorState?.envReady ? "· Configured" : doorState ? "· Missing" : "· Checking…"}
          {" — "}
          {doorState?.senderEnvRef || "RESEND_FROM_EMAIL"} {doorState?.senderReady ? "· Resolved" : "· set in runtime or From field"}
        </code>
      </div>
      {registryConnected || doorState?.productVerified ? (
        <p className="dm-orchestration-config__hint">Product installed + verified — {doorState?.syncProof || "provider proof stored on the registry row"}.</p>
      ) : (
        <p className="dm-orchestration-config__hint">Install the Resend Email product from the Add-ons Marketplace to unlock live sends.</p>
      )}
      <p className="dm-orchestration-config__meta">2 · Test event</p>
      <label className="dm-orchestration-config__field">
        <span>Test input (JSON)</span>
        <textarea rows={4} value={testInput} spellCheck={false} disabled={disabled} onChange={(e) => setTestInput(e.target.value)} />
      </label>
      {parsedInput === null ? <p className="dm-workflow-schedule-error" role="alert">Test input is not valid JSON yet — Send stays disabled until it parses.</p> : null}
      <label className="dm-orchestration-config__field">
        <span>Send to</span>
        <input value={sendTo} placeholder={resolvedTo || "qa@yourdomain.com"} disabled={disabled} onChange={(e) => setSendTo(e.target.value)} />
      </label>
      <button type="button" className="dm-btn-primary-sm" disabled={!canSend} onClick={sendTestEmail}>
        {sending ? "Sending…" : "Send test email"}
      </button>
      <p className="dm-orchestration-config__hint">
        Sends the REAL email through the governed messaging door with this node&apos;s subject and body ({"{{input.key}}"} bound from the test input). Every outcome is receipted. This proves the NODE — the workflow&apos;s full draft test still gates publish.
      </p>
      {result || config.lastTestAt ? (
        <>
          <p className="dm-orchestration-config__meta">3 · Result</p>
          <div className="dm-marketplace-config-summary">
            <div><span>Method</span><code>POST /emails</code></div>
            <div><span>HTTP status</span><code>{result?.httpStatus ?? config.lastTestStatus ?? "—"}</code></div>
            <div><span>At</span><code>{result?.testedAt || config.lastTestAt || "—"}</code></div>
            <div><span>Message id</span><code>{result?.providerMessageId || "—"}</code></div>
            <div><span>Summary</span><code>{result?.summary || config.lastTestSummary || "—"}</code></div>
            {result?.receiptId ? <div><span>Receipt</span><code>{result.receiptId}</code></div> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function KeyValueRows({ label, entries, onChange, disabled, keyPlaceholder = "Key", valuePlaceholder = "Value" }) {
  const rows = Array.isArray(entries)
    ? entries
    : Object.entries(entries && typeof entries === "object" ? entries : {}).map(([key, value]) => ({ key, value }));

  function normalize(nextRows) {
    onChange(nextRows.filter((row) => String(row.key || row.name || "").trim()));
  }

  function updateRow(index, patch) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    normalize(next);
  }

  return (
    <div className="dm-orchestration-config__fieldmap">
      <span className="dm-orchestration-config__field-label">{label}</span>
      {rows.map((row, index) => (
        <div key={index} className="dm-orchestration-config__fieldmap-row">
          <input
            placeholder={keyPlaceholder}
            value={row.key || row.name || ""}
            disabled={disabled}
            onChange={(e) => updateRow(index, { key: e.target.value })}
          />
          <input
            placeholder={valuePlaceholder}
            value={row.value == null ? "" : String(row.value)}
            disabled={disabled}
            onChange={(e) => updateRow(index, { value: e.target.value })}
          />
          <button type="button" className="dm-btn-ghost" disabled={disabled} onClick={() => normalize(rows.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="dm-btn-outline" disabled={disabled} onClick={() => normalize([...rows, { key: "", value: "" }])}>
        + Add {label.toLowerCase()}
      </button>
    </div>
  );
}

function FilterClauseList({ filters, filterMode, onChange, disabled, fieldOptions = [] }) {
  const clauses = Array.isArray(filters) ? filters : [];
  const mode = FILTER_CONJUNCTIONS.includes(filterMode) ? filterMode : "and";

  function updateClause(index, patch) {
    const next = clauses.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange(next, mode);
  }

  function addClause() {
    onChange([...clauses, { fieldId: "", operator: "eq", value: "" }], mode);
  }

  function removeClause(index) {
    onChange(clauses.filter((_, i) => i !== index), mode);
  }

  return (
    <div className="dm-orchestration-config__filters">
      <p className="dm-orchestration-config__hint">Where</p>
      <label className="dm-orchestration-config__field">
        <span>Match</span>
        <select value={mode} disabled={disabled} onChange={(e) => onChange(clauses, e.target.value)}>
          {FILTER_CONJUNCTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      {clauses.map((clause, index) => (
        <div key={index} className="dm-orchestration-config__filter-row">
          {fieldOptions.length > 0 ? (
            <select
              value={clause.fieldId || ""}
              disabled={disabled}
              onChange={(e) => updateClause(index, { fieldId: e.target.value })}
            >
              <option value="">Select field</option>
              {fieldOptions.map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          ) : (
            <input
              placeholder="field"
              value={clause.fieldId || ""}
              disabled={disabled}
              onChange={(e) => updateClause(index, { fieldId: e.target.value })}
            />
          )}
          <select
            value={clause.operator || "eq"}
            disabled={disabled}
            onChange={(e) => updateClause(index, { operator: e.target.value })}
          >
            {FILTER_OPERATORS.map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
          <input
            placeholder="value"
            value={clause.value ?? ""}
            disabled={disabled || clause.operator === "isEmpty" || clause.operator === "isNotEmpty"}
            onChange={(e) => updateClause(index, { value: e.target.value })}
          />
          <button type="button" className="dm-btn-ghost" disabled={disabled} onClick={() => removeClause(index)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="dm-btn-outline dm-orchestration-config__add-filter" disabled={disabled} onClick={addClause}>
        + Add filter rule
      </button>
    </div>
  );
}

function FieldMapRows({ fieldMap, onChange, disabled, fieldOptions = [] }) {
  const entries = Object.entries(fieldMap && typeof fieldMap === "object" ? fieldMap : {});

  function updateEntry(index, target, sourcePath) {
    const next = [...entries];
    next[index] = [target, sourcePath];
    onChange(Object.fromEntries(next.filter(([t]) => String(t).trim())));
  }

  function addEntry() {
    onChange({ ...Object.fromEntries(entries), "": "" });
  }

  function removeEntry(index) {
    const next = entries.filter((_, i) => i !== index);
    onChange(Object.fromEntries(next));
  }

  return (
    <div className="dm-orchestration-config__fieldmap">
      <span className="dm-orchestration-config__field-label">Field mapping</span>
      {entries.length === 0 && (
        <p className="dm-orchestration-config__hint">Map workspace field names to paths in the API response.</p>
      )}
      {entries.map(([target, sourcePath], index) => (
        <div key={`${target}-${index}`} className="dm-orchestration-config__fieldmap-row">
          <input
            placeholder="Output field"
            value={target}
            disabled={disabled}
            onChange={(e) => updateEntry(index, e.target.value, sourcePath)}
          />
          {fieldOptions.length > 0 ? (
            <select
              value={sourcePath || ""}
              disabled={disabled}
              onChange={(e) => updateEntry(index, target, e.target.value)}
            >
              <option value="">Source path</option>
              {fieldOptions.map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          ) : (
            <input
              placeholder="Source path"
              value={sourcePath || ""}
              disabled={disabled}
              onChange={(e) => updateEntry(index, target, e.target.value)}
            />
          )}
          <button type="button" className="dm-btn-ghost" disabled={disabled} onClick={() => removeEntry(index)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="dm-btn-outline" disabled={disabled} onClick={addEntry}>
        + Add field mapping
      </button>
    </div>
  );
}

function PayloadKeyRows({ payload, onChange, disabled, flagClassName = "" }) {
  const entries = Object.entries(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {});

  function setEntries(nextEntries) {
    onChange(Object.fromEntries(nextEntries.filter(([k]) => String(k).trim())));
  }

  return (
    <div className={`dm-orchestration-config__payload${flagClassName}`}>
      <span className="dm-orchestration-config__field-label">Test payload fields</span>
      {entries.map(([key, value], index) => (
        <div key={index} className="dm-orchestration-config__payload-row">
          <input
            placeholder="key"
            value={key}
            disabled={disabled}
            onChange={(e) => {
              const next = [...entries];
              next[index] = [e.target.value, value];
              setEntries(next);
            }}
          />
          <input
            placeholder="value"
            value={value == null ? "" : String(value)}
            disabled={disabled}
            onChange={(e) => {
              const next = [...entries];
              next[index] = [key, e.target.value];
              setEntries(next);
            }}
          />
          <button
            type="button"
            className="dm-btn-ghost"
            disabled={disabled}
            onClick={() => setEntries(entries.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="dm-btn-outline"
        disabled={disabled}
        onClick={() => setEntries([...entries, ["", ""]])}
      >
        + Add payload field
      </button>
    </div>
  );
}

function VersionDeltaControls({ node, config, sandboxRow, onChange, disabled, flaggedTags, flagSeverity = "warning" }) {
  const flagged = flaggedTags instanceof Set ? flaggedTags : new Set(Array.isArray(flaggedTags) ? flaggedTags : []);
  const explicitTags = normalizeTags(config?.deltaTags);
  const inferredTags = inferDeltaTagsForNode(node, config);
  const selectedTags = explicitTags.length > 0 ? explicitTags : inferredTags;
  const deltaValues = config?.deltaValues && typeof config.deltaValues === "object" && !Array.isArray(config.deltaValues)
    ? config.deltaValues
    : {};

  function patch(patchValue) {
    onChange?.({ ...(config || {}), ...patchValue });
  }

  function patchDeltaValue(tag, value) {
    patch({ deltaValues: { ...deltaValues, [tag]: value } });
  }

  return (
    <div className="dm-orchestration-config__section dm-version-delta">
      <label className="dm-orchestration-config__field">
        <span className="dm-version-delta__label-row">
          Delta tags
          <span
            className="dm-version-delta__info"
            title={explicitTags.length > 0 ? "Saved orchestration config tags." : "Derived from this node's real bindings."}
            aria-label={explicitTags.length > 0 ? "Saved orchestration config tags" : "Derived from this node's real bindings"}
          >
            i
          </span>
        </span>
        <input
          value={selectedTags.join(", ")}
          placeholder="routing, prompt, evaluation"
          disabled={disabled}
          onChange={(event) => patch({ deltaTags: normalizeTags(event.target.value.split(",")) })}
        />
      </label>
      {selectedTags.length > 0 && (
        <div className="dm-version-delta__tag-fields">
          {selectedTags.map((tag) => (
            <label key={tag} className={`dm-orchestration-config__field${flagged.has(tag) ? ` dm-field--readiness is-${flagSeverity}` : ""}`}>
              <span>{tag} value</span>
              <input
                value={deltaValues[tag] ?? getDeltaTagDefaultValue(tag, node, config, sandboxRow)}
                placeholder={`Set ${tag} delta value`}
                disabled={disabled}
                onChange={(event) => patchDeltaValue(tag, event.target.value)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function LocalAgentHostControls({
  sandboxRow,
  objectId,
  rowName,
  disabled,
  onSandboxRowPatch,
  adapterFlagClass = "",
  hostFlagClass = ""
}) {
  const row = sandboxRow && typeof sandboxRow === "object" ? sandboxRow : {};
  const adapter = String(row.adapter || "local-process").trim() || "local-process";
  const agentHost = String(row.agentHost || "").trim();
  const browserOn = ["true", "1", "on", "yes"].includes(String(row.browserAccess || "").trim().toLowerCase());
  const hostOptions = getAgentHostOptions();
  const canPatch = typeof onSandboxRowPatch === "function";

  function patch(fields) {
    onSandboxRowPatch?.(fields);
  }

  function patchWithClearedAgentAuth(fields) {
    patch({ ...fields, ...EMPTY_AGENT_AUTH_PATCH });
  }

  return (
    <div className="dm-orchestration-config__section dm-workflow-agent-runtime">
      <span>Local agent runtime</span>
      <p className="dm-orchestration-config__hint">
        Same runtime fields as the Data Model sandbox sidecar. Local agent host uses the Paperclip thin adapter on this machine.
      </p>
      <label className={`dm-orchestration-config__field${adapterFlagClass}`}>
        <span>Execution adapter</span>
        <select
          value={adapter}
          disabled={disabled || !canPatch}
          onChange={(event) => {
            const nextAdapter = event.target.value;
            patchWithClearedAgentAuth({
              runLocality: "local",
              adapter: nextAdapter,
              agentHost: nextAdapter === "local-agent-host" ? (agentHost || "claude_local") : ""
            });
          }}
        >
          {LOCAL_AGENT_ADAPTERS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>
      {adapter === "local-agent-host" && (
        <label className={`dm-orchestration-config__field${hostFlagClass}`}>
          <span>Agent host (Paperclip)</span>
          <select
            value={agentHost}
            disabled={disabled || !canPatch}
            onChange={(event) => patchWithClearedAgentAuth({
              runLocality: "local",
              adapter: "local-agent-host",
              agentHost: event.target.value
            })}
          >
            <option value="">Select host...</option>
            {hostOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
      )}
      {adapter === "local-agent-host" && isSandboxLocalAgentHost(row) && (
        <SandboxAgentAuthPanel
          objectId={objectId}
          rowName={rowName}
          draft={row}
          disabled={disabled || !canPatch}
          onPatchDraft={patch}
        />
      )}
      {adapter === "local-intelligence" && (
        <div className="dm-sandbox-local-intel">
          <label className="dm-orchestration-config__field">
            <span>Concrete model id</span>
            <input
              value={row.localModel || ""}
              disabled={disabled || !canPatch}
              placeholder="gemma3:4b"
              onChange={(event) => patch({ runLocality: "local", localModel: event.target.value })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Chat completions URL (optional)</span>
            <input
              value={row.localEndpoint || ""}
              disabled={disabled || !canPatch}
              placeholder="http://127.0.0.1:11434/v1/chat/completions"
              onChange={(event) => patch({ runLocality: "local", localEndpoint: event.target.value })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Resolver mode</span>
            <select
              value={String(row.intelligenceAdapterMode || "ollama").trim().toLowerCase()}
              disabled={disabled || !canPatch}
              onChange={(event) => patch({ runLocality: "local", intelligenceAdapterMode: event.target.value })}
            >
              {LOCAL_INTELLIGENCE_MODE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <p className="dm-orchestration-config__hint">
            Uses Instructions + Command as the task payload. With sandbox browser access off, tool intents stay proposals. With browser access on, browser tool intents execute through the local browser bridge before the final JSON response is returned.
          </p>
          {browserOn && (
            <p className="dm-orchestration-config__hint">
              This workflow's AI-agent nodes inherit browser access only when their node-level Network permission is enabled.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function buildNodeAgentAuthDraft(sandboxRow, config) {
  const agentHost = String(config?.agentHost || sandboxRow?.agentHost || "").trim();
  if (!agentHost) return null;
  return {
    ...(sandboxRow || {}),
    runLocality: "local",
    adapter: "local-agent-host",
    agentHost
  };
}

export function OrchestrationNodeConfigPanel({
  node,
  onConfigChange,
  onDeleteNode,
  disabled,
  registryRow,
  workspaceConfig,
  sandboxRow,
  objectId,
  rowName,
  onSandboxRowPatch,
  inputScheduleControls,
  serverlessScheduleOptionAvailable = false,
  serverlessScheduleAvailable = false,
  webhookTriggerAvailable = false,
  apiTriggerAvailable = false,
  readinessFlag,
  activeTab: controlledTab,
  onTabChange
}) {
  const [internalTab, setInternalTab] = useState("node");
  const [inputModeOpen, setInputModeOpen] = useState(false);
  const rawActiveTab = controlledTab ?? internalTab;

  function setActiveTab(tab) {
    if (controlledTab == null) setInternalTab(tab);
    onTabChange?.(tab);
  }

  const detectedFields = useMemo(
    () => detectFieldIdsFromLastResponse(registryRow?.lastResponse),
    [registryRow?.lastResponse]
  );

  if (!node) {
    return (
      <div className="dm-orchestration-config dm-orchestration-config--empty">
        <p>Select a node on the canvas to configure it in this panel.</p>
      </div>
    );
  }

  const config = node.config || {};
  const type = String(node.type || "");
  const schedulerAvailable = Boolean(serverlessScheduleOptionAvailable || serverlessScheduleAvailable);
  const inputModeOptions = [
    { value: "manual", label: "Manual", Icon: FileInput },
    { value: "record", label: "Record", Icon: Database },
    { value: "source-record", label: "Source Record", Icon: ListTree },
    ...(schedulerAvailable ? [{ value: "serverless-schedule", label: "Serverless Schedule", Icon: CalendarClock }] : []),
    // Inbound input methods are workspace-NATIVE capabilities — no external
    // account or marketplace install exists, so they are always offered. The
    // real readiness gate (signing secret / invoke token env ref) lives in the
    // trigger panel and on the server bind; both name the exact missing ref.
    { value: "webhook", label: "Webhook", Icon: Webhook },
    { value: "api-request", label: "API Request", Icon: KeyRound },
  ];
  const selectedInputMode = inputModeOptions.find((option) => option.value === (config.inputMode || "manual")) || inputModeOptions[0];
  const meta = config.requestHeadersMetadata || {};
  const workspaceObjects = (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
    .filter((object) => object?.id && object?.objectType !== "sandbox-environment" && object?.objectType !== "api-registry");
  const selectedObject = getSelectedObject(workspaceObjects, config.objectId);
  const selectedObjectFields = getObjectFields(selectedObject);
  const selectedObjectFieldIds = selectedObjectFields.map((field) => field.id);

  function patchConfig(patch) {
    onConfigChange?.({ ...config, ...patch });
  }

  // Serverless-readiness atomic field flag. The scan maps each alert to the exact
  // config / sandbox-row field(s) that must change; we fill ONLY those fields
  // light-orange (the color is the guidance — no extra copy). `row:`-prefixed
  // hints (e.g. the execution adapter) match without the prefix here too.
  const readinessSeverity = readinessFlag?.severity === "blocked" ? "blocked" : "warning";
  const readinessFieldSet = new Set([
    ...(Array.isArray(readinessFlag?.configFields) ? readinessFlag.configFields : []),
    ...(Array.isArray(readinessFlag?.rowFields) ? readinessFlag.rowFields : []),
    ...(Array.isArray(readinessFlag?.fields) ? readinessFlag.fields.map((f) => String(f).replace(/^row:/, "")) : []),
  ]);
  const readinessTagSet = new Set(Array.isArray(readinessFlag?.deltaTags) ? readinessFlag.deltaTags : []);
  function flagFieldClass(...keys) {
    return keys.some((k) => readinessFieldSet.has(k)) ? ` dm-field--readiness is-${readinessSeverity}` : "";
  }

  const tabsForType = type === "api-registry-call" || CAPABILITY_NODE_TYPES.includes(type) || type === "core-action"
    ? ["configuration", "test", "advanced"]
    : type === "input" || type === "transform-filter" || type === "data-action" || type === "data-trigger" || type === "ai-agent" || type === "flow-control" || type === "human-input"
      ? ["configuration", "advanced"]
      : ["configuration"];
  const activeTab = tabsForType.includes(rawActiveTab) ? rawActiveTab : "configuration";

  const registryConnected = isApiRegistryTestSuccessful(registryRow);
  const responseMode = config.responseMode || config.mode || "json";
  const supabaseOperation = String(config.operation || "select").trim().toLowerCase();
  const nodeAgentAuthDraft = type === "ai-agent" ? buildNodeAgentAuthDraft(sandboxRow, config) : null;
  const canPatchSandboxRow = typeof onSandboxRowPatch === "function";
  const sandboxBrowserOn = ["true", "1", "on", "yes"].includes(String(sandboxRow?.browserAccess || "").trim().toLowerCase());
  const sandboxAdapter = String(sandboxRow?.adapter || "").trim();
  const nodeAdapter = String(config.adapter || "").trim() || sandboxAdapter;
  const nodeUsesLocalIntelligence = nodeAdapter === "local-intelligence";

  function patchNodeAgentHost(agentHost) {
    const nextHost = String(agentHost || "").trim();
    patchConfig({
      agentHost: nextHost,
      ...(nextHost ? { adapter: "local-agent-host" } : {})
    });
    if (nextHost && canPatchSandboxRow) {
      onSandboxRowPatch({
        runLocality: "local",
        adapter: "local-agent-host",
        agentHost: nextHost,
        ...EMPTY_AGENT_AUTH_PATCH
      });
    }
  }

  return (
    <div className="dm-orchestration-config">
      {tabsForType.length > 1 && (
        <div className="dm-orchestration-config__tabs" role="tablist">
          {tabsForType.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={activeTab === tab ? "is-active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      )}

      {activeTab === "configuration" && type === "input" && (
        <div className="dm-orchestration-config__pane">
          <div className="dm-orchestration-config__field">
            <span>Input mode</span>
            <div className={`dm-select dm-input-mode-select${inputModeOpen ? " open" : ""}${disabled ? " disabled" : ""}`}>
              <button
                type="button"
                className="dm-select-trigger"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={inputModeOpen}
                onClick={() => setInputModeOpen((open) => !open)}
              >
                <span>{selectedInputMode.label}</span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              {inputModeOpen ? (
                <div className="dm-select-popover">
                  <div className="dm-select-list" role="listbox" aria-label="Input mode">
                    {inputModeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={option.value === selectedInputMode.value}
                        className={`dm-select-option${option.value === selectedInputMode.value ? " selected" : ""}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          patchConfig({ inputMode: option.value });
                          setInputModeOpen(false);
                        }}
                      >
                        <option.Icon size={14} aria-hidden="true" />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          {config.inputMode === "webhook" ? (
            <label className="dm-orchestration-config__field">
              <span>HTTP method</span>
              <select
                value={String(config.httpMethod || "POST").toUpperCase()}
                disabled={disabled}
                onChange={(event) => patchConfig({ httpMethod: event.target.value })}
              >
                {["POST", "PUT", "PATCH", "GET"].map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
              <small className="dm-run-setup__help">The method external senders must use against this workflow&apos;s endpoint — enforced at the destination door once published.</small>
            </label>
          ) : null}
          <PayloadKeyRows
            payload={config.samplePayload}
            disabled={disabled}
            onChange={(samplePayload) => patchConfig({ samplePayload })}
            flagClassName={flagFieldClass("samplePayload", "triggerInput")}
          />
          <p className="dm-orchestration-config__hint">
            Bind values with {"{{input.key}}"} in the API endpoint or body template.
          </p>
          {inputScheduleControls || null}
        </div>
      )}

      {activeTab === "configuration" && type === "api-registry-call" && (
        <div className="dm-orchestration-config__pane">
          {registryConnected && (
            <span className="dm-orchestration-config__badge is-connected">Connected</span>
          )}
          <label className="dm-orchestration-config__field">
            <span>Method</span>
            <select
              value={String(config.method || "GET").toUpperCase()}
              disabled={disabled}
              onChange={(e) => patchConfig({ method: e.target.value })}
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className={`dm-orchestration-config__field${flagFieldClass("endpoint")}`}>
            <span>Endpoint</span>
            <input value={config.endpoint || ""} disabled={disabled} onChange={(e) => patchConfig({ endpoint: e.target.value })} />
          </label>
          <label className={`dm-orchestration-config__field${flagFieldClass("bodyTemplate")}`}>
            <span>Body template</span>
            <textarea rows={3} value={config.bodyTemplate || ""} disabled={disabled} onChange={(e) => patchConfig({ bodyTemplate: e.target.value })} />
          </label>
          <label className={`dm-orchestration-config__field${flagFieldClass("authRef", "registryId", "integrationId")}`}>
            <span>Auth reference</span>
            <input value={config.authRef || ""} disabled={disabled} onChange={(e) => patchConfig({ authRef: e.target.value })} />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Auth header name</span>
            <input
              value={meta.authHeaderName || config.authHeaderName || ""}
              disabled={disabled}
              onChange={(e) => patchConfig({
                authHeaderName: e.target.value,
                requestHeadersMetadata: { ...meta, authHeaderName: e.target.value }
              })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Auth prefix</span>
            <input
              value={meta.authPrefix || config.authPrefix || ""}
              disabled={disabled}
              onChange={(e) => patchConfig({
                authPrefix: e.target.value,
                requestHeadersMetadata: { ...meta, authPrefix: e.target.value }
              })}
            />
          </label>
        </div>
      )}

      {activeTab === "configuration" && type === "supabase-data" && (
        <div className="dm-orchestration-config__pane">
          {registryConnected && (
            <span className="dm-orchestration-config__badge is-connected">Connected</span>
          )}
          <label className="dm-orchestration-config__field">
            <span>Operation</span>
            <select
              value={supabaseOperation}
              disabled={disabled}
              onChange={(e) => patchConfig({ operation: e.target.value })}
            >
              {SUPABASE_DATA_OPERATIONS.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </label>
          {supabaseOperation === "rpc" ? (
            <label className={`dm-orchestration-config__field${flagFieldClass("rpcFunction")}`}>
              <span>RPC function</span>
              <input value={config.rpcFunction || ""} disabled={disabled} onChange={(e) => patchConfig({ rpcFunction: e.target.value })} />
            </label>
          ) : (
            <label className={`dm-orchestration-config__field${flagFieldClass("table")}`}>
              <span>Table</span>
              <input value={config.table || ""} disabled={disabled} onChange={(e) => patchConfig({ table: e.target.value })} />
            </label>
          )}
          <label className={`dm-orchestration-config__field${flagFieldClass("query")}`}>
            <span>Query</span>
            <input
              value={config.query || ""}
              placeholder="select=id,name&status=eq.live"
              disabled={disabled}
              onChange={(e) => patchConfig({ query: e.target.value })}
            />
          </label>
          <p className="dm-orchestration-config__hint">
            PostgREST filter syntax (e.g. status=eq.live). Update and delete require a row filter here — the runner refuses filterless mutations.
          </p>
          {["insert", "upsert", "update", "rpc"].includes(supabaseOperation) && (
            <>
              <label className={`dm-orchestration-config__field${flagFieldClass("bodyTemplate")}`}>
                <span>Body template</span>
                <textarea rows={3} value={config.bodyTemplate || ""} disabled={disabled} onChange={(e) => patchConfig({ bodyTemplate: e.target.value })} />
              </label>
              <p className="dm-orchestration-config__hint">
                JSON body. Bind values with {"{{input.key}}"} — substitution also works in table and query.
              </p>
            </>
          )}
          <label className={`dm-orchestration-config__field${flagFieldClass("registryId", "integrationId")}`}>
            <span>Registry ID</span>
            <input value={config.registryId || "supabase-postgrest"} disabled={disabled} onChange={(e) => patchConfig({ registryId: e.target.value })} />
          </label>
          <WorkflowCheckbox
            checked={config.returnRepresentation !== false}
            disabled={disabled}
            onChange={(checked) => patchConfig({ returnRepresentation: checked })}
          >
            Return representation
          </WorkflowCheckbox>
        </div>
      )}

      {activeTab === "configuration" && type === "stripe-commerce" && (
        <div className="dm-orchestration-config__pane">
          {registryConnected && (
            <span className="dm-orchestration-config__badge is-connected">Connected</span>
          )}
          <label className="dm-orchestration-config__field">
            <span>Operation</span>
            <select
              value={String(config.operation || "list-payment-intents").trim().toLowerCase()}
              disabled={disabled}
              onChange={(e) => patchConfig({ operation: e.target.value })}
            >
              {STRIPE_COMMERCE_OPERATIONS.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </label>
          <label className={`dm-orchestration-config__field${flagFieldClass("queryTemplate", "query")}`}>
            <span>Query</span>
            <input
              value={config.queryTemplate || config.query || ""}
              placeholder="limit=5&customer={{input.customerId}}"
              disabled={disabled}
              onChange={(e) => patchConfig({ queryTemplate: e.target.value })}
            />
          </label>
          <p className="dm-orchestration-config__hint">
            Read-only revenue lookups against the installed Stripe product. Bind values with {"{{input.key}}"} — the runner refuses anything that mutates commerce state.
          </p>
          <label className={`dm-orchestration-config__field${flagFieldClass("registryId", "integrationId")}`}>
            <span>Registry ID</span>
            <input value={config.registryId || "stripe-payments"} disabled={disabled} onChange={(e) => patchConfig({ registryId: e.target.value })} />
          </label>
        </div>
      )}

      {activeTab === "configuration" && type === "resend-email" && (
        <div className="dm-orchestration-config__pane">
          {registryConnected && (
            <span className="dm-orchestration-config__badge is-connected">Connected</span>
          )}
          <EmailEnvelope config={config} disabled={disabled} patchConfig={patchConfig} flagFieldClass={flagFieldClass} />
          <EmailBodyEditor
            html={config.htmlTemplate || config.html || ""}
            text={config.textTemplate || config.text || ""}
            disabled={disabled}
            onChangeHtml={(htmlTemplate) => patchConfig({ htmlTemplate })}
            onChangeText={(textTemplate) => patchConfig({ textTemplate })}
            tokens={usedEmailTokens(config)}
          />
          <ResendTemplateControls config={config} disabled={disabled} patchConfig={patchConfig} />
        </div>
      )}

      {activeTab === "configuration" && type === "transform-filter" && (
        <div className="dm-orchestration-config__pane">
          {detectedFields.length > 0 && (
            <p className="dm-orchestration-config__meta">{detectedFields.length} fields detected from last API test</p>
          )}
          <label className="dm-orchestration-config__field">
            <span>Root path</span>
            <input
              value={config.rootPath || ""}
              placeholder="data.items"
              disabled={disabled}
              onChange={(e) => patchConfig({ rootPath: e.target.value })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Response mode</span>
            <select
              value={responseMode}
              disabled={disabled}
              onChange={(e) => patchConfig({ responseMode: e.target.value, mode: e.target.value })}
            >
              <option value="json">json</option>
              <option value="array">array</option>
              <option value="object">object</option>
            </select>
          </label>
          <FieldMapRows
            fieldMap={config.fieldMap}
            fieldOptions={detectedFields}
            disabled={disabled}
            onChange={(fieldMap) => patchConfig({ fieldMap })}
          />
        </div>
      )}

      {activeTab === "configuration" && type === "tool-result" && (
        <div className="dm-orchestration-config__pane">
          {registryRow?.status && (
            <span className={`dm-orchestration-config__badge is-${String(registryRow.status).toLowerCase()}`}>
              Latest registry test: {registryRow.status}
            </span>
          )}
          <WorkflowCheckbox
            checked={config.writeLastResponse !== false}
            disabled={disabled}
            onChange={(checked) => patchConfig({ writeLastResponse: checked })}
          >
            Write lastResponse on success
          </WorkflowCheckbox>
          <WorkflowCheckbox
            checked={config.writeSourceRecord !== false}
            disabled={disabled}
            onChange={(checked) => patchConfig({ writeSourceRecord: checked })}
          >
            Write source record history
          </WorkflowCheckbox>
          <label className="dm-orchestration-config__field">
            <span>Success HTTP codes</span>
            <input
              value={Array.isArray(config.successStatusCodes) ? config.successStatusCodes.join(", ") : "200"}
              disabled={disabled}
              onChange={(e) => {
                const codes = e.target.value.split(",").map((v) => Number(v.trim())).filter(Number.isFinite);
                patchConfig({ successStatusCodes: codes.length ? codes : [200] });
              }}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Output mode</span>
            <input value={config.outputMode || "normalized-json"} disabled={disabled} onChange={(e) => patchConfig({ outputMode: e.target.value })} />
          </label>
          {registryRow?.lastResponse && (
            <div className="dm-orchestration-preview">
              <span>Registry test preview</span>
              <pre>{String(registryRow.lastResponse).slice(0, 400)}{String(registryRow.lastResponse).length > 400 ? "…" : ""}</pre>
            </div>
          )}
        </div>
      )}

      {activeTab === "configuration" && type === "thinAdapter" && (
        <div className="dm-orchestration-config__pane">
          <div className="dm-orchestration-config__section">
            <label className="dm-orchestration-config__field">
              <span>Node id</span>
              <input
                value={node.id || ""}
                disabled
              />
            </label>
            <label className="dm-orchestration-config__field">
              <span>Node type</span>
              <input value="AI Model" disabled />
            </label>
            <label className="dm-orchestration-config__field">
              <span>Model reference</span>
              <input
                value={node.sandbox || ""}
                disabled={disabled}
                onChange={(event) => patchConfig({ __nodePatch: { sandbox: event.target.value } })}
              />
            </label>
            <label className="dm-orchestration-config__field">
              <span>Execution policy</span>
              <select
                value={config.executionPolicy || "sequential"}
                disabled={disabled}
                onChange={(event) => patchConfig({ executionPolicy: event.target.value })}
              >
                <option value="sequential">sequential</option>
                <option value="parallel">parallel</option>
                <option value="conditional">conditional</option>
              </select>
            </label>
            <label className="dm-orchestration-config__field">
              <span>Input binding</span>
              <input
                value={config.inputBinding || ""}
                placeholder="{{previous.output}}"
                disabled={disabled}
                onChange={(event) => patchConfig({ inputBinding: event.target.value })}
              />
            </label>
            <label className="dm-orchestration-config__field">
              <span>Output key</span>
              <input
                value={config.outputKey || ""}
                placeholder="result"
                disabled={disabled}
                onChange={(event) => patchConfig({ outputKey: event.target.value })}
              />
            </label>
          </div>

          <VersionDeltaControls node={node} config={config} sandboxRow={sandboxRow} disabled={disabled} onChange={onConfigChange} flaggedTags={readinessTagSet} flagSeverity={readinessSeverity} />

          <details className="dm-orchestration-config__advanced-json dm-orchestration-config__node-json">
            <summary>Node JSON</summary>
            <pre className="dm-orchestration-preview"><code>{JSON.stringify(node, null, 2)}</code></pre>
          </details>
        </div>
      )}

      {activeTab === "configuration" && (type === "data-action" || type === "data-trigger") && (
        <div className="dm-orchestration-config__pane">
          {config.destructive && (
            <span className="dm-orchestration-config__badge is-failed">Double confirmation required</span>
          )}
          <label className="dm-orchestration-config__field">
            <span>Workspace object</span>
            <select
              value={config.objectId || ""}
              disabled={disabled}
              onChange={(e) => {
                const selected = workspaceObjects.find((object) => String(object.id) === e.target.value);
                const objectName = String(selected?.name || selected?.label || selected?.id || "");
                patchConfig({
                  objectId: e.target.value,
                  objectType: String(selected?.objectType || ""),
                  objectName,
                  __nodePatch: {
                    subtitle: objectName || "Select workspace object"
                  }
                });
              }}
            >
              <option value="">Select object</option>
              {workspaceObjects.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name || object.label || object.id}
                </option>
              ))}
            </select>
          </label>
          <label className="dm-orchestration-config__field">
            <span>Action</span>
            <select value={config.action || node.id || ""} disabled={disabled} onChange={(e) => patchConfig({ action: e.target.value })}>
              <option value="create-record">Create Record</option>
              <option value="update-record">Update Record</option>
              <option value="delete-record">Delete Record</option>
              <option value="search-records">Search Records</option>
              <option value="upsert-record">Create or Update Record</option>
              <option value="record-created">Record is created</option>
              <option value="record-updated">Record is updated</option>
              <option value="record-deleted">Record is deleted</option>
            </select>
          </label>
          {selectedObjectFields.length > 0 && (
            <div className="dm-orchestration-config__section">
              <span>Object fields</span>
              {(config.action === "search-records" || config.action === "update-record" || config.action === "delete-record" || config.action === "upsert-record") && (
                <FilterClauseList
                  filters={config.filters}
                  filterMode={config.filterMode}
                  disabled={disabled}
                  fieldOptions={selectedObjectFieldIds}
                  onChange={(filters, filterMode) => patchConfig({ filters, filterMode })}
                />
              )}
              {(config.action === "create-record" || config.action === "update-record" || config.action === "upsert-record") && (
                <FieldMapRows
                  fieldMap={config.fieldValues}
                  fieldOptions={selectedObjectFieldIds}
                  disabled={disabled}
                  onChange={(fieldValues) => patchConfig({ fieldValues })}
                />
              )}
              {config.action === "search-records" && (
                <>
                  <label className="dm-orchestration-config__field">
                    <span>Result limit</span>
                    <input type="number" min="1" value={config.limit ?? 25} disabled={disabled} onChange={(e) => patchConfig({ limit: Number(e.target.value) })} />
                  </label>
                  <label className="dm-orchestration-config__field">
                    <span>Sort field</span>
                    <select value={config.sortField || ""} disabled={disabled} onChange={(e) => patchConfig({ sortField: e.target.value })}>
                      <option value="">No sort</option>
                      {selectedObjectFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>
          )}
          <WorkflowCheckbox
            checked={config.confirmationRequired === true}
            disabled={disabled || config.destructive === true}
            onChange={(checked) => patchConfig({ confirmationRequired: checked })}
          >
            Require confirmation before destructive or version-changing execution
          </WorkflowCheckbox>
          <p className="dm-orchestration-config__hint">
            Data actions bind only to this workspace data model. Execution resolves the latest object schema at run time.
          </p>
        </div>
      )}

      {activeTab === "configuration" && type === "ai-agent" && (config.role || config.taskPrompt || config.required != null) && (
        <div className="dm-orchestration-config__pane">
          <label className="dm-orchestration-config__field">
            <span>Role</span>
            <input
              value={config.role || node.label || ""}
              disabled={disabled}
              onChange={(e) => patchConfig({ role: e.target.value, __nodePatch: { label: e.target.value } })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Description</span>
            <input
              placeholder="One-sentence charter"
              value={config.description || ""}
              disabled={disabled}
              onChange={(e) => patchConfig({ description: e.target.value })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Task</span>
            <textarea
              rows={4}
              value={config.taskPrompt || ""}
              disabled={disabled}
              onChange={(e) => patchConfig({ taskPrompt: e.target.value })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Tools</span>
            <input
              placeholder="read, summarize"
              value={Array.isArray(config.tools) ? config.tools.join(", ") : ""}
              disabled={disabled}
              onChange={(e) => patchConfig({
                tools: e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
              })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Max tokens</span>
            <input
              type="number"
              min="0"
              placeholder="0 = inherit"
              value={config.maxTokens || 0}
              disabled={disabled}
              onChange={(e) => patchConfig({ maxTokens: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Agent host</span>
            <select
              value={config.agentHost || ""}
              disabled={disabled}
              onChange={(e) => patchNodeAgentHost(e.target.value)}
            >
              <option value="">Inherit</option>
              {Object.entries(HOST_AUTH_CATALOG || {}).map(([slug, host]) => (
                <option key={slug} value={slug}>{host?.label || slug}</option>
              ))}
            </select>
          </label>
          {nodeAgentAuthDraft && isSandboxLocalAgentHost(nodeAgentAuthDraft) && (
            <SandboxAgentAuthPanel
              objectId={objectId}
              rowName={rowName}
              draft={nodeAgentAuthDraft}
              disabled={disabled || !canPatchSandboxRow}
              onPatchDraft={onSandboxRowPatch}
            />
          )}
          <WorkflowCheckbox
            checked={config.required !== false}
            disabled={disabled}
            onChange={(checked) => patchConfig({ required: checked })}
          >
            Required
          </WorkflowCheckbox>
          <WorkflowCheckbox
            checked={config.networkAccess === true}
            disabled={disabled}
            title={sandboxBrowserOn && nodeUsesLocalIntelligence
              ? "Network and browser are granted only when this node permission is on and the sandbox row has browser access on."
              : "Network is granted only when both this and the row's networkAllow are on. The row's browser access inherits through the same gate."}
            onChange={(checked) => patchConfig({ networkAccess: checked })}
          >
            {sandboxBrowserOn && nodeUsesLocalIntelligence ? "Network + browser" : "Network"}
          </WorkflowCheckbox>
        </div>
      )}

      {activeTab === "configuration" && type === "ai-agent" && !(config.role || config.taskPrompt || config.required != null) && (
        <div className="dm-orchestration-config__pane">
          <label className="dm-orchestration-config__field">
            <span>Model</span>
            <select value={config.model || MODEL_OPTIONS[0]} disabled={disabled} onChange={(e) => patchConfig({ model: e.target.value })}>
              {MODEL_OPTIONS.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
          {(config.model || MODEL_OPTIONS[0]) === "Local agent host" && (
            <LocalAgentHostControls
              sandboxRow={sandboxRow}
              objectId={objectId}
              rowName={rowName}
              disabled={disabled}
              onSandboxRowPatch={onSandboxRowPatch}
              adapterFlagClass={flagFieldClass("adapter")}
              hostFlagClass={flagFieldClass("agentHost")}
            />
          )}
          <label className="dm-orchestration-config__field">
            <span>Input prompt</span>
            <textarea
              rows={4}
              placeholder="Describe what you want the AI to do..."
              value={config.prompt || ""}
              disabled={disabled}
              onChange={(e) => patchConfig({ prompt: e.target.value })}
            />
          </label>
          <div className="dm-orchestration-config__section">
            <span>Permissions</span>
            <WorkflowCheckbox checked={config.canReadWorkspace !== false} disabled={disabled} onChange={(checked) => patchConfig({ canReadWorkspace: checked })}>
              Read workspace data
            </WorkflowCheckbox>
            <WorkflowCheckbox checked={config.canWriteDraft === true} disabled={disabled} onChange={(checked) => patchConfig({ canWriteDraft: checked })}>
              Write draft changes only
            </WorkflowCheckbox>
            <WorkflowCheckbox
              checked={config.networkAccess === true}
              disabled={disabled}
              title={sandboxBrowserOn && nodeUsesLocalIntelligence
                ? "This node gets browser access only when this permission and the sandbox row Browser access toggle are both on."
                : undefined}
              onChange={(checked) => patchConfig({ networkAccess: checked })}
            >
              {sandboxBrowserOn && nodeUsesLocalIntelligence ? "Allow network + browser access" : "Allow network access"}
            </WorkflowCheckbox>
          </div>
          <KeyValueRows
            label="Output fields"
            entries={config.outputs}
            disabled={disabled}
            keyPlaceholder="Variable name"
            valuePlaceholder="Instruction for AI"
            onChange={(outputs) => patchConfig({ outputs })}
          />
          <label className="dm-orchestration-config__field">
            <span>Default output type</span>
            <select value={config.outputType || "Text"} disabled={disabled} onChange={(e) => patchConfig({ outputType: e.target.value })}>
              {OUTPUT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      )}

      {activeTab === "configuration" && type === "flow-control" && (
        <div className="dm-orchestration-config__pane">
          {config.action === "iterator" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Collection path</span>
                <input placeholder="{{previous.records}}" value={config.collectionPath || ""} disabled={disabled} onChange={(e) => patchConfig({ collectionPath: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Item variable</span>
                <input placeholder="item" value={config.itemVariable || "item"} disabled={disabled} onChange={(e) => patchConfig({ itemVariable: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Concurrency</span>
                <input type="number" min="1" value={config.concurrency ?? 1} disabled={disabled} onChange={(e) => patchConfig({ concurrency: Number(e.target.value) })} />
              </label>
            </>
          )}
          {config.action === "filter" && (
            <FilterClauseList
              filters={config.filters}
              filterMode={config.filterMode}
              disabled={disabled}
              fieldOptions={detectedFields}
              onChange={(filters, filterMode) => patchConfig({ filters, filterMode })}
            />
          )}
          {config.action === "if-else" && (
            <>
              <FilterClauseList
                filters={config.conditions}
                filterMode={config.conditionMode}
                disabled={disabled}
                fieldOptions={detectedFields}
                onChange={(conditions, conditionMode) => patchConfig({ conditions, conditionMode })}
              />
              <label className="dm-orchestration-config__field">
                <span>True branch label</span>
                <input value={config.trueLabel || "Yes"} disabled={disabled} onChange={(e) => patchConfig({ trueLabel: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>False branch label</span>
                <input value={config.falseLabel || "No"} disabled={disabled} onChange={(e) => patchConfig({ falseLabel: e.target.value })} />
              </label>
            </>
          )}
          {config.action === "delay" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Delay amount</span>
                <input type="number" min="1" value={config.delayAmount ?? 5} disabled={disabled} onChange={(e) => patchConfig({ delayAmount: Number(e.target.value) })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Delay unit</span>
                <select value={config.delayUnit || "minutes"} disabled={disabled} onChange={(e) => patchConfig({ delayUnit: e.target.value })}>
                  <option value="seconds">seconds</option>
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </label>
            </>
          )}
        </div>
      )}

      {activeTab === "configuration" && type === "core-action" && (
        <div className="dm-orchestration-config__pane">
          {(config.action === "http-request" || node.id === "http-request") && (
            <>
              <label className="dm-orchestration-config__field">
                <span>URL</span>
                <input placeholder="https://api.example.com/endpoint" value={config.url || ""} disabled={disabled} onChange={(e) => patchConfig({ url: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>HTTP Method</span>
                <select value={String(config.method || "GET").toUpperCase()} disabled={disabled} onChange={(e) => patchConfig({ method: e.target.value })}>
                  {HTTP_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
              <KeyValueRows
                label="Headers Input"
                entries={config.headers}
                disabled={disabled}
                keyPlaceholder="Header name"
                valuePlaceholder="Header value"
                onChange={(headers) => patchConfig({ headers })}
              />
              <label className="dm-orchestration-config__field">
                <span>Request Body</span>
                <textarea rows={4} placeholder="{ }" value={config.body || ""} disabled={disabled} onChange={(e) => patchConfig({ body: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Expected Response Body</span>
                <textarea
                  rows={5}
                  placeholder={'{\n  "id": "123",\n  "status": "ok"\n}'}
                  value={config.expectedResponseBody || ""}
                  disabled={disabled}
                  onChange={(e) => patchConfig({ expectedResponseBody: e.target.value })}
                />
              </label>
            </>
          )}
          {(config.action === "send-email" || config.action === "draft-email") && (
            <>
              <label className="dm-orchestration-config__field">
                <span>To</span>
                <input placeholder="{{record.email}}" value={config.to || ""} disabled={disabled} onChange={(e) => patchConfig({ to: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Subject</span>
                <input value={config.subject || ""} disabled={disabled} onChange={(e) => patchConfig({ subject: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Message</span>
                <textarea rows={6} value={config.message || ""} disabled={disabled} onChange={(e) => patchConfig({ message: e.target.value })} />
              </label>
              <WorkflowCheckbox checked={config.requireApproval !== false} disabled={disabled} onChange={(checked) => patchConfig({ requireApproval: checked })}>
                Require approval before sending
              </WorkflowCheckbox>
            </>
          )}
          {config.action === "code-function" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Function name</span>
                <input value={config.functionName || "logicFunction"} disabled={disabled} onChange={(e) => patchConfig({ functionName: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Code</span>
                <textarea rows={8} placeholder="return input;" value={config.code || ""} disabled={disabled} onChange={(e) => patchConfig({ code: e.target.value })} />
              </label>
              <KeyValueRows label="Environment references" entries={config.envRefs} disabled={disabled} onChange={(envRefs) => patchConfig({ envRefs })} />
            </>
          )}
        </div>
      )}

      {activeTab === "configuration" && type === "human-input" && (
        <div className="dm-orchestration-config__pane">
          <label className="dm-orchestration-config__field">
            <span>Form title</span>
            <input value={config.title || "Review input"} disabled={disabled} onChange={(e) => patchConfig({ title: e.target.value })} />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Instructions</span>
            <textarea rows={4} value={config.instructions || ""} disabled={disabled} onChange={(e) => patchConfig({ instructions: e.target.value })} />
          </label>
          <KeyValueRows
            label="Form fields"
            entries={config.fields}
            disabled={disabled}
            keyPlaceholder="Field name"
            valuePlaceholder="Field type or help text"
            onChange={(fields) => patchConfig({ fields })}
          />
          <WorkflowCheckbox checked={config.required !== false} disabled={disabled} onChange={(checked) => patchConfig({ required: checked })}>
            Require response before continuing
          </WorkflowCheckbox>
        </div>
      )}

      {activeTab === "test" && type === "resend-email" && (
        <ResendEmailTestPane
          config={config}
          disabled={disabled}
          patchConfig={patchConfig}
          registryConnected={registryConnected}
          nodeId={String(node?.id || "")}
          workflowRef={String(sandboxRow?.Name || "")}
        />
      )}

      {activeTab === "test" && type !== "resend-email" && (
        <div className="dm-orchestration-config__pane">
          <label className="dm-orchestration-config__field">
            <span>Success condition</span>
            <input value={config.successCondition || "HTTP 200 or successful execution"} disabled={disabled} onChange={(e) => patchConfig({ successCondition: e.target.value })} />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Sample response</span>
            <textarea rows={5} value={config.sampleResponse || ""} disabled={disabled} onChange={(e) => patchConfig({ sampleResponse: e.target.value })} />
          </label>
          <WorkflowCheckbox checked={config.blockPublishOnFailure !== false} disabled={disabled} onChange={(checked) => patchConfig({ blockPublishOnFailure: checked })}>
            Block Publish unless this step passes
          </WorkflowCheckbox>
        </div>
      )}

      {activeTab === "advanced" && (type === "data-action" || type === "data-trigger" || type === "ai-agent" || type === "flow-control" || type === "core-action" || type === "human-input") && (
        <div className="dm-orchestration-config__pane">
          <details className="dm-orchestration-config__advanced-json" open>
            <summary>Advanced JSON</summary>
            <pre className="dm-orchestration-preview">{JSON.stringify(config, null, 2)}</pre>
          </details>
        </div>
      )}

      {activeTab === "filters" && (type === "input" || type === "transform-filter") && (
        <FilterClauseList
          filters={config.filters}
          filterMode={config.filterMode}
          disabled={disabled}
          fieldOptions={type === "transform-filter" ? detectedFields : []}
          onChange={(filters, filterMode) => patchConfig({ filters, filterMode })}
        />
      )}

      {activeTab === "preview" && (
        <div className="dm-orchestration-config__pane">
          {type === "thinAdapter" ? (
            <>
              <ul className="dm-orchestration-config__preview-list">
                <li>Sandbox: {node.sandbox || node.id || "unknown"}</li>
                <li>Type: thinAdapter</li>
              </ul>
              <details className="dm-orchestration-config__advanced-json dm-orchestration-config__node-json">
                <summary>Node JSON</summary>
                <pre className="dm-orchestration-preview"><code>{JSON.stringify(node, null, 2)}</code></pre>
              </details>
            </>
          ) : type === "tool-result" ? (
            <>
              <p className="dm-orchestration-config__hint">
                After Run sandbox, status, lastTested, and lastResponse update on the sandbox row.
              </p>
              <ul className="dm-orchestration-config__preview-list">
                <li>Success codes: {Array.isArray(config.successStatusCodes) ? config.successStatusCodes.join(", ") : "200"}</li>
                <li>Write lastResponse: {config.writeLastResponse !== false ? "yes" : "no"}</li>
                <li>Write source record: {config.writeSourceRecord !== false ? "yes" : "no"}</li>
                <li>Output mode: {config.outputMode || "normalized-json"}</li>
              </ul>
              {registryRow?.lastResponse && (
                <div className="dm-orchestration-preview">
                  <span>Latest API test output (preview)</span>
                  <pre>{String(registryRow.lastResponse).slice(0, 500)}{String(registryRow.lastResponse).length > 500 ? "…" : ""}</pre>
                </div>
              )}
            </>
          ) : (
            <p className="dm-orchestration-config__hint">Advanced node configuration preview.</p>
          )}
          <details className="dm-orchestration-config__advanced-json">
            <summary>Advanced JSON</summary>
            <pre className="dm-orchestration-preview">{JSON.stringify(config, null, 2)}</pre>
          </details>
        </div>
      )}

      {activeTab === "advanced" && (
        <div className="dm-orchestration-config__pane">
          {type === "api-registry-call" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Timeout (ms)</span>
                <input
                  type="number"
                  value={config.timeoutMs ?? 30000}
                  disabled={disabled}
                  onChange={(e) => patchConfig({ timeoutMs: Number(e.target.value) })}
                />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Query params (JSON object)</span>
                <textarea
                  rows={2}
                  disabled={disabled}
                  value={JSON.stringify(config.queryParams || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      patchConfig({ queryParams: JSON.parse(e.target.value || "{}") });
                    } catch {
                      /* keep typing */
                    }
                  }}
                />
              </label>
            </>
          )}
          {CAPABILITY_NODE_TYPES.includes(type) && (
            <label className="dm-orchestration-config__field">
              <span>Timeout (ms)</span>
              <input
                type="number"
                value={config.timeoutMs ?? 30000}
                disabled={disabled}
                onChange={(e) => patchConfig({ timeoutMs: Number(e.target.value) })}
              />
            </label>
          )}
          {type === "input" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Source type</span>
                <input value={config.sourceType || ""} disabled={disabled} onChange={(e) => patchConfig({ sourceType: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Source ID</span>
                <input value={config.sourceId || ""} disabled={disabled} onChange={(e) => patchConfig({ sourceId: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Entity ID</span>
                <input value={config.entityId || ""} disabled={disabled} onChange={(e) => patchConfig({ entityId: e.target.value })} />
              </label>
            </>
          )}
          {type === "transform-filter" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Max rows (0 = no limit)</span>
                <input
                  type="number"
                  value={config.maxRows ?? 0}
                  disabled={disabled}
                  onChange={(e) => patchConfig({ maxRows: Number(e.target.value) })}
                />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Include fields (comma-separated)</span>
                <input
                  value={Array.isArray(config.includeFields) ? config.includeFields.join(", ") : ""}
                  disabled={disabled}
                  onChange={(e) => patchConfig({
                    includeFields: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  })}
                />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Exclude fields (comma-separated)</span>
                <input
                  value={Array.isArray(config.excludeFields) ? config.excludeFields.join(", ") : ""}
                  disabled={disabled}
                  onChange={(e) => patchConfig({
                    excludeFields: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  })}
                />
              </label>
            </>
          )}
          {type === "tool-result" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Preview fields (comma-separated)</span>
                <input
                  value={Array.isArray(config.previewFields) ? config.previewFields.join(", ") : ""}
                  disabled={disabled}
                  onChange={(e) => patchConfig({
                    previewFields: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  })}
                />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Status field name</span>
                <input value={config.statusField || "status"} disabled={disabled} onChange={(e) => patchConfig({ statusField: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Last tested field name</span>
                <input value={config.lastTestedField || "lastTested"} disabled={disabled} onChange={(e) => patchConfig({ lastTestedField: e.target.value })} />
              </label>
            </>
          )}
          {(type === "input" || type === "transform-filter") && (
            <details className="dm-orchestration-config__advanced-json">
              <summary>Advanced JSON</summary>
              <pre className="dm-orchestration-preview">{JSON.stringify(config, null, 2)}</pre>
            </details>
          )}
        </div>
      )}

      {activeTab === "configuration" && type !== "thinAdapter" && (
        <VersionDeltaControls node={node} config={config} sandboxRow={sandboxRow} disabled={disabled} onChange={onConfigChange} flaggedTags={readinessTagSet} flagSeverity={readinessSeverity} />
      )}
      <div className="dm-workflow-node-config-foot">
        <button type="button" className="dm-workflow-node-options" disabled={disabled}>
          Options ⌘O
        </button>
        <button type="button" className="dm-workflow-node-delete" disabled={disabled} onClick={onDeleteNode}>
          Delete
        </button>
      </div>
    </div>
  );
}
