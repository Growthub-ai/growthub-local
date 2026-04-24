# Vercel Deployment

## Deploy the Next.js App

```bash
cd apps/creative-video-pipeline
vercel --prod
```

Or connect the `apps/creative-video-pipeline` directory in the Vercel dashboard.

## Environment Variables

Set these in Vercel → Project → Settings → Environment Variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER` | yes | `growthub-pipeline` or `byo-api-key` |
| `GROWTHUB_BRIDGE_ACCESS_TOKEN` | adapter | growthub-pipeline only |
| `GROWTHUB_BRIDGE_BASE_URL` | adapter | growthub-pipeline only |
| `ELEVENLABS_API_KEY` | yes | Stage 3 transcription |
| `VIDEO_MODEL_PROVIDER` | adapter | byo-api-key only |
| `GOOGLE_AI_API_KEY` | conditional | veo provider |
| `FAL_API_KEY` | conditional | fal provider |
| `RUNWAY_API_KEY` | conditional | runway provider |
| `VIDEO_USE_HOME` | yes | Path to video-use fork (server-side Stage 3) |

## vercel.json

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "installCommand": "npm install"
}
```

## Notes

- All pages using `readAdapterConfig()` or `describeGenerativeAdapter()` run server-side — env vars are never exposed to the client.
- `app/api/pipeline/route.js` uses `export const dynamic = "force-dynamic"` to read live env state at request time.
- The studio Vite shell (`studio/`) is local-only and is not deployed to Vercel.
