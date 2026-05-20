# Workspace login gate (env-var auth)

Additive optional gate for `growthub-custom-workspace-starter-v1` (`growthhub-local-awac-auth-proxy-v1`). When disabled, the workspace behaves exactly as before. When enabled, Next.js 16 `proxy.js` redirects unauthenticated visitors to `/login` and protects all workspace and API routes except auth endpoints.

## Enable

Set in `.env.local` (local) or the Vercel project environment (production):

```text
GROWTHUB_WORKSPACE_GATE_ENABLED=1
GROWTHUB_WORKSPACE_GATE_USERNAME=admin
GROWTHUB_WORKSPACE_GATE_SECRET=<random-string-at-least-32-chars>
```

Choose one credential form:

```text
# Local development only (server-side; never commit)
GROWTHUB_WORKSPACE_GATE_PASSWORD=your-password

# Production (SHA-256 hex digest; no plain password in env)
GROWTHUB_WORKSPACE_GATE_PASSWORD_HASH=<sha256-hex>
```

Generate a password hash:

```bash
node -e "const {createHash}=require('crypto');const p=process.argv[1]||'';console.log(createHash('sha256').update(p,'utf8').digest('hex'))" 'your-password'
```

## Behavior

- Session: HMAC-signed `gh_workspace_session` httpOnly cookie (7-day max age, `Secure` in production).
- Routes: `/login`, `/api/auth/login`, `/api/auth/logout` stay public; everything else requires a valid session when the gate is on.
- `growthub.config.json`, dashboards, Data Model, and widget code are unchanged.
- No extra npm dependencies; uses Node `crypto` and Next.js App Router API routes.

## Disable

Unset `GROWTHUB_WORKSPACE_GATE_ENABLED` or set `GROWTHUB_WORKSPACE_GATE_ENABLED=0`. Missing gate env vars keep the gate off.

## Deploy notes

- Set the same variables in the Vercel dashboard for the `apps/workspace` project root.
- Do not use `NEXT_PUBLIC_` for gate username, password, or secret.
- Existing `GROWTHUB_WORKSPACE_AUTH_ADAPTER` (oidc/clerk/authjs) remains the long-term hosted-auth contract; this gate is a thin env-var portal for pilots and internal consoles.
