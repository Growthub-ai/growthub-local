# create-growthub-local

Install Growthub Local for DX or Go-to-Market.

## Usage

For Go-to-Market:

```bash
npm create growthub-local@latest -- --profile gtm
```

For DX:

```bash
npm create growthub-local@latest -- --profile dx
```

## What It Installs

The installer provisions the local Growthub runtime and wires it to the hosted Growthub app.

After install:

1. Launch the local app.
2. Open the `Growthub Connection` card.
3. Click `Open Configuration`.
4. Complete hosted authentication.
5. Return to the local callback.
6. Use `Pulse` to verify the hosted bridge is live.

## Package Boundary

This package installs the local runtime entrypoint and depends on `@growthub/cli` for the bundled local system.
