# Existing scoped API workflows

The public Claude bundle connects through OAuth. It does not capture an
ambient credential or introduce another token service. For private Brand Kit
creation, review-only proposals, gallery or usage operations beyond the MCP
inventory, use Growthub's existing native integration and scoped REST API.

[Native integration and API workflow](https://github.com/Growthub-ai/growthub-local/blob/main/claude-plugins/growthub-gtm/references/api-token.md)

Configure credentials only in the chosen host's private credential settings.
Do not paste tokens into a conversation or expose them in arguments, examples,
files or screenshots. Existing native installations and their independently
configured credentials remain unchanged by this public bundle.

Resolve the actual account, permissions, immutable active Brand Kit version and
resource IDs before a request. Verify the persisted result after a write. Stop
on authentication or permission refusal. Never retry an uncertain creation.
API proposals do not approve or publish themselves. CEO approval is available
only through the existing decision tools when the owner has delegated it.
