/**
 * KnowledgeImportModal — Agnostic, reusable import modal for knowledge items and skills.
 *
 * Supports three import modes:
 * - File Upload: drag-drop / file picker for .md, .txt, .json, SKILL.md files
 * - Skills.sh API: browse and import from skills.sh API
 * - Paste Content: manual text/markdown entry
 *
 * The `mode` prop controls which tabs are visible:
 * - "knowledge" — all tabs, creates general knowledge items
 * - "skill" — file upload + paste only, creates skill items with SKILL.md frontmatter parsing
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileUp, Globe, Type, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { agentsApi } from "@/api/agents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportMode = "knowledge" | "skill";

export type ImportedItem = {
  name: string;
  description: string;
  body: string;
  source: "file" | "skills-api" | "paste";
  fileName?: string;
};

type KnowledgeImportModalProps = {
  open: boolean;
  onClose: () => void;
  mode: ImportMode;
  onImport: (items: ImportedItem[]) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSkillMdFrontmatter(content: string): {
  name: string;
  description: string;
  body: string;
} {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { name: "", description: "", body: content };

  const frontmatter = fmMatch[1] ?? "";
  const nameMatch = frontmatter.match(/^name:\s*["']?(.*?)["']?\s*$/m);
  const descMatch = frontmatter.match(/^description:\s*["']?(.*?)["']?\s*$/m);
  const body = content.slice(fmMatch[0].length).trim();

  return {
    name: nameMatch?.[1]?.trim() ?? "",
    description: descMatch?.[1]?.trim() ?? "",
    body,
  };
}

function isTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    name.endsWith(".txt") ||
    name.endsWith(".json") ||
    file.type === "text/markdown" ||
    file.type === "text/plain" ||
    file.type === "application/json"
  );
}

function fileBaseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function titleize(input: string): string {
  return input
    .split(/[-_ ]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Single-line preview for UI; avoids long tokens blowing modal width */
function previewOneLine(fileName: string, preview: string, maxLen = 140): string {
  const raw = `${fileName} — ${preview.replace(/\s+/g, " ").trim()}`;
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}…`;
}

// ---------------------------------------------------------------------------
// Staged file type
// ---------------------------------------------------------------------------

type StagedFile = {
  file: File;
  name: string;
  description: string;
  preview: string;
  parsed: boolean;
};

// ---------------------------------------------------------------------------
// File Upload Tab
// ---------------------------------------------------------------------------

function FileUploadTab({
  mode,
  stagedFiles,
  setStagedFiles,
}: {
  mode: ImportMode;
  stagedFiles: StagedFile[];
  setStagedFiles: React.Dispatch<React.SetStateAction<StagedFile[]>>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const newStaged: StagedFile[] = [];
      for (const file of Array.from(files)) {
        if (!isTextFile(file)) continue;
        const content = await file.text();
        const isSkillMd =
          file.name.toLowerCase() === "skill.md" || file.name.toLowerCase().endsWith("/skill.md");

        if (mode === "skill" || isSkillMd) {
          const parsed = parseSkillMdFrontmatter(content);
          newStaged.push({
            file,
            name: parsed.name || titleize(fileBaseName(file.name)),
            description: parsed.description,
            preview: content.slice(0, 200),
            parsed: !!parsed.name,
          });
        } else {
          newStaged.push({
            file,
            name: titleize(fileBaseName(file.name)),
            description: "",
            preview: content.slice(0, 200),
            parsed: false,
          });
        }
      }
      setStagedFiles((prev) => [...prev, ...newStaged]);
    },
    [mode, setStagedFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles],
  );

  const removeStaged = useCallback(
    (idx: number) => {
      setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
    },
    [setStagedFiles],
  );

  return (
    <div className="space-y-4 w-full min-w-0 max-w-full overflow-hidden">
      {/* Drop zone */}
      <div
        className={cn(
          "flex w-full min-w-0 max-w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 sm:p-8 transition-colors cursor-pointer",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <FileUp className="h-8 w-8 text-muted-foreground mb-2 shrink-0" />
        <p className="text-center text-sm text-muted-foreground px-2 break-words max-w-full">
          {mode === "skill"
            ? "Drop SKILL.md files here, or click to browse"
            : "Drop .md, .txt, or .json files here, or click to browse"}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".md,.markdown,.txt,.json"
          onChange={(e) => {
            if (e.target.files) processFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Staged files */}
      {stagedFiles.length > 0 && (
        <div className="space-y-2 w-full min-w-0 max-w-full">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""} staged
          </div>
          {stagedFiles.map((staged, idx) => (
            <div
              key={idx}
              className="flex min-w-0 max-w-full gap-2 rounded-md border border-border bg-muted/10 px-3 py-2"
            >
              <div className="min-w-0 flex-1 space-y-2 overflow-hidden">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Input
                    value={staged.name}
                    onChange={(e) =>
                      setStagedFiles((prev) =>
                        prev.map((s, i) =>
                          i === idx ? { ...s, name: e.target.value } : s,
                        ),
                      )
                    }
                    className="h-7 min-w-0 flex-1 basis-[8rem] text-sm font-mono"
                    placeholder="Name"
                  />
                  {staged.parsed && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                      Parsed
                    </Badge>
                  )}
                </div>
                <Input
                  value={staged.description}
                  onChange={(e) =>
                    setStagedFiles((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, description: e.target.value } : s,
                      ),
                    )
                  }
                  className="h-7 w-full min-w-0 text-xs"
                  placeholder="Description (optional)"
                />
                <p
                  className="text-xs leading-snug text-muted-foreground line-clamp-2 break-words"
                  title={previewOneLine(staged.file.name, staged.preview, 2000)}
                >
                  {previewOneLine(staged.file.name, staged.preview)}
                </p>
              </div>
              <button
                type="button"
                className="mt-0.5 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => removeStaged(idx)}
                aria-label="Remove staged file"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills.sh API Tab
// ---------------------------------------------------------------------------

function SkillsApiTab({
  selectedApiItems,
  setSelectedApiItems,
}: {
  selectedApiItems: ImportedItem[];
  setSelectedApiItems: React.Dispatch<React.SetStateAction<ImportedItem[]>>;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [skills, setSkills] = useState<Array<{ id: string; owner: string; repo: string; skillName: string; summary: string; tags: string[]; installCommand: string; skillUrl: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = query.trim();

  // Search skills.sh on query change (debounced) + on mount for featured
  useEffect(() => {
    const handler = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await agentsApi.searchSkillsSh(trimmedQuery);
        setSkills(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Skills directory unavailable");
        setSkills([]);
      } finally {
        setLoading(false);
      }
    }, trimmedQuery ? 300 : 0);
    return () => clearTimeout(handler);
  }, [trimmedQuery]);

  const toggleItem = useCallback(
    (skill: typeof skills[0]) => {
      setSelectedApiItems((prev) => {
        const exists = prev.find((p) => p.name === skill.skillName);
        if (exists) return prev.filter((p) => p.name !== skill.skillName);
        return [...prev, {
          name: skill.skillName,
          description: skill.summary || `${skill.owner}/${skill.repo}`,
          body: `Install: ${skill.installCommand}\nURL: ${skill.skillUrl}`,
          source: "skills-api" as const,
        }];
      });
    },
    [setSelectedApiItems],
  );

  const selectedNames = new Set(selectedApiItems.map((i) => i.name));

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      <div className="relative min-w-0">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills.sh (e.g., ai-elements, github)"
          className="min-w-0 pl-3"
        />
        {loading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {!trimmedQuery && !loading && skills.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Featured skills from skills.sh. Refine with a search query.
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {!loading && skills.length > 0 && (
        <div className="max-h-60 min-w-0 space-y-1.5 overflow-y-auto overflow-x-hidden">
          {skills.map((skill, idx) => (
            <div
              key={`${skill.id}-${idx}`}
              className={cn(
                "flex min-w-0 max-w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 transition-colors",
                selectedNames.has(skill.skillName)
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/10 hover:border-primary/50",
              )}
              onClick={() => toggleItem(skill)}
            >
              <div className="min-w-0 flex-1 space-y-0.5 overflow-hidden">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate font-mono text-sm">{skill.skillName}</span>
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">skills.sh</Badge>
                </div>
                {skill.summary && (
                  <p className="text-xs text-muted-foreground line-clamp-2 break-words">{skill.summary}</p>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  {skill.owner}/{skill.repo}
                </p>
              </div>
              {selectedNames.has(skill.skillName) && (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}

      {trimmedQuery && !loading && skills.length === 0 && !error && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No skills found. Try another query.
        </p>
      )}

      {!trimmedQuery && !loading && skills.length === 0 && !error && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Start typing to search the skills.sh directory.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paste Content Tab
// ---------------------------------------------------------------------------

function PasteContentTab({
  pasteData,
  setPasteData,
}: {
  pasteData: { name: string; description: string; body: string };
  setPasteData: React.Dispatch<
    React.SetStateAction<{ name: string; description: string; body: string }>
  >;
}) {
  return (
    <div className="w-full min-w-0 max-w-full space-y-3">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="paste-name" className="text-xs">
          Name
        </Label>
        <Input
          id="paste-name"
          value={pasteData.name}
          onChange={(e) => setPasteData((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="e.g. outbound-playbook"
          className="min-w-0 font-mono"
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="paste-desc" className="text-xs">
          Description (optional)
        </Label>
        <Input
          id="paste-desc"
          value={pasteData.description}
          onChange={(e) =>
            setPasteData((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="Short description of this knowledge item"
          className="min-w-0"
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="paste-body" className="text-xs">
          Content (Markdown or plain text)
        </Label>
        <Textarea
          id="paste-body"
          value={pasteData.body}
          onChange={(e) => setPasteData((prev) => ({ ...prev, body: e.target.value }))}
          placeholder="Paste your content here..."
          rows={8}
          className="min-h-[10rem] max-h-[min(40vh,20rem)] w-full min-w-0 resize-y overflow-x-hidden overflow-y-auto font-mono text-sm break-words"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

export function KnowledgeImportModal({
  open,
  onClose,
  mode,
  onImport,
}: KnowledgeImportModalProps) {
  const [activeTab, setActiveTab] = useState<"file" | "api" | "paste">("file");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [selectedApiItems, setSelectedApiItems] = useState<ImportedItem[]>([]);
  const [pasteData, setPasteData] = useState({ name: "", description: "", body: "" });

  const reset = useCallback(() => {
    setStagedFiles([]);
    setSelectedApiItems([]);
    setPasteData({ name: "", description: "", body: "" });
    setActiveTab("file");
    setImporting(false);
    setImportError(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const collectItems = useCallback(async (): Promise<ImportedItem[]> => {
    const items: ImportedItem[] = [];

    if (activeTab === "file") {
      for (const staged of stagedFiles) {
        const content = await staged.file.text();
        items.push({
          name: staged.name,
          description: staged.description,
          body: content,
          source: "file",
          fileName: staged.file.name,
        });
      }
    } else if (activeTab === "api") {
      items.push(...selectedApiItems);
    } else if (activeTab === "paste") {
      if (pasteData.name.trim() && pasteData.body.trim()) {
        items.push({
          name: pasteData.name.trim(),
          description: pasteData.description.trim(),
          body: pasteData.body,
          source: "paste",
        });
      }
    }

    return items;
  }, [activeTab, stagedFiles, selectedApiItems, pasteData]);

  const canImport =
    (activeTab === "file" && stagedFiles.length > 0) ||
    (activeTab === "api" && selectedApiItems.length > 0) ||
    (activeTab === "paste" && pasteData.name.trim() && pasteData.body.trim());

  const handleImport = useCallback(async () => {
    setImporting(true);
    setImportError(null);
    try {
      const items = await collectItems();
      if (items.length === 0) {
        setImportError("No items to import. Please add content first.");
        setImporting(false);
        return;
      }
      await onImport(items);
      handleClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed. Check console for details.");
      setImporting(false);
    }
  }, [collectItems, onImport, handleClose]);

  const title = mode === "skill" ? "Import Skills" : "Import Knowledge";
  const description =
    mode === "skill"
      ? "Upload SKILL.md files or paste skill content to create new skills."
      : "Import knowledge items from files, the skills.sh API, or paste content directly.";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="min-w-0 max-h-[min(90dvh,42rem)] overflow-x-hidden overflow-y-auto sm:max-w-lg">
        <DialogHeader className="min-w-0 shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="break-words">{description}</DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "file" | "api" | "paste")}
          className="min-w-0"
        >
          <TabsList className="flex h-auto w-full min-w-0 max-w-full flex-wrap gap-1 p-1 sm:flex-nowrap sm:gap-0">
            <TabsTrigger value="file" className="min-w-0 flex-1 gap-1.5 sm:basis-0">
              <FileUp className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">Upload</span>
            </TabsTrigger>
            <TabsTrigger value="api" className="min-w-0 flex-1 gap-1.5 sm:basis-0">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">Skills.sh</span>
            </TabsTrigger>
            <TabsTrigger value="paste" className="min-w-0 flex-1 gap-1.5 sm:basis-0">
              <Type className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">Paste</span>
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 min-h-[200px] min-w-0 overflow-x-hidden">
            <TabsContent value="file" className="mt-0 min-w-0">
              <FileUploadTab
                mode={mode}
                stagedFiles={stagedFiles}
                setStagedFiles={setStagedFiles}
              />
            </TabsContent>

            <TabsContent value="api" className="mt-0 min-w-0">
              <SkillsApiTab
                selectedApiItems={selectedApiItems}
                setSelectedApiItems={setSelectedApiItems}
              />
            </TabsContent>

            <TabsContent value="paste" className="mt-0 min-w-0">
              <PasteContentTab pasteData={pasteData} setPasteData={setPasteData} />
            </TabsContent>
          </div>
        </Tabs>

        {importError && (
          <div className="flex min-w-0 items-start gap-2 px-1 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{importError}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!canImport || importing}>
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Importing…
              </>
            ) : (
              `Import${activeTab === "file" && stagedFiles.length > 1 ? ` (${stagedFiles.length})` : activeTab === "api" && selectedApiItems.length > 1 ? ` (${selectedApiItems.length})` : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
