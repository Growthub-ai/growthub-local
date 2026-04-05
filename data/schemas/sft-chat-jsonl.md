# SFT chat JSONL (contract)

Each line is a JSON object. OSS ships **only** this shape and mock rows under `examples/` — never real trajectories.

## shape

| Field | Type | Description |
| ----- | ---- | ----------- |
| `messages` | array | OpenAI-style chat turns: `{ "role": "user"|"assistant"|"system", "content": "..." }` |
| `meta` | object (optional) | Non-training metadata (e.g. `source: "mock"`). |

## Mock example path

See `data/schemas/examples/mock-sft.jsonl`.
