# Workspace env-var auth gate

Optional additive login surface for deployed workspace apps (`apps/workspace`). It does not modify `growthub.config.json` or dashboard rendering.

## Enable

Set all required variables in `.env` (local) or the Vercel project dashboard (production):

```text
GROWTHUB_WORKSPACE_AUTH_GATE=enabled
GROWTHUB_WORKSPACE_GATE_USERNAME=<username>
GROWTHUB_WORKSPACE_GATE_PASSWORD=<password>
# or precomputed hash (sha256-hmac with GATE_SECRET — see below)
GROWTHUB_WORKSPACE_GATE_PASSWORD_HASH=
GROWTHUB_WORKSPACE_GATE_SECRET=<random-long-secret>
```

Optional token-only sign-in (automation):

```text
GROWTHUB_WORKSPACE_GATE_TOKEN=<long-random-token>
```

Legacy aliases remain supported: `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_PASSWORD_HASH`, `AUTH_TOKEN`, `AUTH_SECRET`.

## Runtime behavior

- `proxy.js` (Next.js 16 Proxy convention) runs before routes render.
- Unauthenticated browser requests redirect to `/login`.
- Unauthenticated `/api/*` requests return `401` JSON (except `/api/auth/*`).
- Successful `POST /api/auth/login` sets an httpOnly session cookie (`gh_ws_session`).
- `POST /api/auth/logout` clears the session cookie.
- When the gate is disabled or incomplete, the workspace behaves exactly as before.

## Password hash helper

From the workspace app directory:

```bash
node -e "import { hashGatePasswordForEnv } from './lib/auth.js'; console.log(hashGatePasswordForEnv(process.argv[1]))" 'your-password'
```

Store the printed value in `GROWTHUB_WORKSPACE_GATE_PASSWORD_HASH` and omit `GROWTHUB_WORKSPACE_GATE_PASSWORD`.

## Security notes

- Never set gate passwords in `NEXT_PUBLIC_*` variables.
- Prefer `GROWTHUB_WORKSPACE_GATE_PASSWORD_HASH` over plain `GROWTHUB_WORKSPACE_GATE_PASSWORD` in production.
- Rotate `GROWTHUB_WORKSPACE_GATE_SECRET` to invalidate active sessions.
