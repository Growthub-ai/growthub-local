# Growthub Local

Local Growthub runtime for DX and Go-to-Market.

`Growthub Local` is the installable local product that runs on a user's machine and connects back to the hosted Growthub app.

It owns:

- the DX local surface
- the GTM local surface
- the local CLI
- the local server
- the local UI
- the local installer packages

## Install

For Go-to-Market:

```bash
npm create growthub-local@latest -- --profile gtm
```

For DX:

```bash
npm create growthub-local@latest -- --profile dx
```

## What Happens Next

1. Install the local app from npm.
2. Launch the local app.
3. Open the `Growthub Connection` card.
4. Click `Open Configuration`.
5. Complete authentication in hosted Growthub.
6. Return to the local app callback.
7. Use `Pulse` to verify the hosted bridge is live.

## Profiles

- `dx`: local DX tool surface
- `gtm`: local Go-to-Market surface

## Packages

This repo is the source of truth for:

- `@growthub/cli`
- `create-growthub-local`

## Development

This repository is the dedicated home for the local runtime product boundary. Hosted Growthub application code lives separately.

## Status

The repository was extracted to stop local-runtime work from getting lost inside a larger monorepo workflow. The goal is to keep DX, GTM, installer, and package publishing aligned in one place.
