# CLAUDE.md — pointer to AGENTS.md

This repository's agent-contract single source of truth is **[AGENTS.md](./AGENTS.md)**.

Claude Code, Cursor, Codex, Hermes, and every other agent harness read the same contract from that one file. `CLAUDE.md` and `.cursorrules` exist as plain-text pointers (not symlinks) so cross-OS clones stay deterministic.

Do not add agent rules here. Edit `AGENTS.md` instead.

See also:

- [`AGENTS.md`](./AGENTS.md) — authoritative agent contract
- [`.cursorrules`](./.cursorrules) — Cursor pointer (same target)
- [`.claude/skills/README.md`](./.claude/skills/README.md) — Claude Code skill catalog authoring rules
- [`docs/SKILLS_MCP_DISCOVERY.md`](./docs/SKILLS_MCP_DISCOVERY.md) — skills + MCP primitive reference
