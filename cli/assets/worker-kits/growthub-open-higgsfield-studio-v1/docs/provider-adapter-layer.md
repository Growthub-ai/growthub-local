# Provider Adapter Layer Notes

Muapi is the reference implementation for this kit because the upstream Open Higgsfield AI workflow is built around it. The adapter layer must remain pluggable.

---

## REFERENCE PROVIDER — MUAPI

| Field | Value |
|---|---|
| Provider name | Muapi |
| Auth pattern | `x-api-key` header |
| Upload flow | file upload first when image, video, or audio assets are required |
| Submit flow | `POST /api/v1/{model-endpoint}` |
| Poll flow | `GET /api/v1/predictions/{request_id}/result` |
| Result flow | completed payload yields output URL(s) and status |

---

## ADAPTER CONTRACT

Every provider adapter should support:
- `UPLOAD_ASSET`
- `SUBMIT_GENERATION`
- `POLL_RESULT`
- `NORMALIZE_RESULT`
- `LIST_MODEL_CAPABILITIES`

Optional:
- `CANCEL_JOB`
- `LIST_HISTORY`
- `HEALTHCHECK`

---

## MODEL ENDPOINT MAPPING ASSUMPTION

The agent should assume that a model entry maps to:
- a studio category
- an endpoint id
- accepted inputs
- exposed controls
- output class

Do not recommend a model without naming the endpoint or the endpoint assumption.

---

## FALLBACK MODES

When the reference provider path fails:
- fallback to a second model in the same studio if available
- fallback to a neighboring studio only if output intent can still be preserved
- mark the handoff with the exact fallback trigger

---

## FUTURE PROVIDER EXTENSION PATH

New providers should be added by implementing the same contract and documenting:
- auth
- endpoint mapping
- submit / poll rhythm
- file upload behavior
- result normalization

Do not rewrite this kit around one provider-specific prompt schema.
