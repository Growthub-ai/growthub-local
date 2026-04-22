# Node Input Form — Rich Schema-Driven Configuration

The node input form is the interactive primitive that turns a registered
CMS capability node into a configurable, type-aware interface inside the
CLI. It is the connective tissue between the CMS node manifest registry
and the chat + pipeline surfaces.

## Surfaces that use it

| Surface                                       | How it's invoked                          |
| --------------------------------------------- | ----------------------------------------- |
| `growthub chat` → `/configure <slug>`         | Fully configure an individual capability  |
| `growthub chat` → `/generate <family> <…>`    | Pick + configure a family's enabled node  |
| `growthub capability configure <slug>`        | Direct rich form from the command line    |
| `growthub capability configure <slug> --json` | Emit bindings as JSON (agent-operable)    |

## How it works

1. The form reads the node's `executionTokens.input_template` and
   `requiredBindings` via `introspectNodeContract`.
2. For each field, a prompt strategy is inferred from the field's key and
   its seed type: text / long-text / number / boolean / array / JSON /
   url-or-file / select.
3. For fields that look like media (keys matching `video|image|audio|
   media|attachment|…`), the prompt accepts **either** a remote URL or a
   **local file path**. Local paths are validated with `fs.statSync`,
   MIME-typed by extension, size-reported, and surfaced as
   `NodeInputAttachment` entries so executors can upload them.
4. The resulting bindings object is shaped exactly like
   `HostedExecuteNodePayload.bindings`.

## Supported MIME types

Image — PNG, JPEG, GIF, WEBP, SVG, AVIF, BMP, TIFF, HEIC
Video — MP4, M4V, MOV, WEBM, MKV, AVI, MPEG
Audio — MP3, WAV, OGG, FLAC, M4A, AAC
Document — PDF, TXT, MD, JSON, CSV, XML, HTML
Archive — ZIP, TAR, GZ, 7Z

Unknown extensions fall back to `application/octet-stream`. The list
lives in `cli/src/runtime/node-input-form/mime.ts` and is the only place
to extend when new types matter.

## Local file binding shape

When an operator picks a local file, the binding slot carries:

```json
{
  "kind": "file",
  "path": "/abs/path/to/intro-footage.mp4",
  "mime": "video/mp4",
  "category": "video",
  "sizeBytes": 17891234
}
```

Remote URL inputs carry:

```json
{ "kind": "url", "url": "https://…/asset.png" }
```

Both shapes pass straight through the hosted execution bridge which is
responsible for fetching/uploading the file before pipeline dispatch.

## Agent-operable example

```bash
growthub capability configure video-gen \
  --seed ./seed.json \
  --json \
  > bindings.json
```

`seed.json` can pre-fill any key (e.g. `"prompt"`) and the form will
offer it as the default. The `--json` output is the payload you POST to
`/api/execute-workflow` wrapped in a pipeline.

## Production rules

1. Every registered node must render a non-blank form — the form
   always emits at least one prompt per `requiredBinding`, even when the
   input template is empty.
2. File validation happens locally before bindings are returned; the
   form never returns a path that does not exist or is not readable.
3. MIME categorization is schema-aligned: if the node field hints
   `video`, the form refuses non-video media with a clear error.
4. Remote URLs and local files are both first-class — a hosted registry
   that expects a URL also accepts a local path and vice versa.
