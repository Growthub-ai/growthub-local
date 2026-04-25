# creative-video-pipeline — Next.js App

Next.js 16 + React 19 app for the Growthub Creative Video Pipeline worker kit. Vercel-deployable.

## Dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Deploy

```bash
vercel --prod
```

See `docs/vercel-deployment.md` for environment variable configuration.

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Pipeline dashboard — stage status, adapter state |
| `/settings/keys` | API key configuration reference |
| `/api/pipeline` | GET — returns live adapter config + pipeline stage state |
