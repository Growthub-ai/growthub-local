# Video Use Studio Quickstart

## 1) Prepare environment

```bash
cp .env.example .env
bash setup/check-deps.sh
node setup/verify-env.mjs
```

Required in `.env`:

- `VIDEO_USE_HOME` — absolute path to your local video-use clone (default `$HOME/video-use`)
- `ELEVENLABS_API_KEY` — ElevenLabs Scribe key for transcript generation

## 2) Clone the video-use upstream

```bash
bash setup/clone-fork.sh
```

Clones [`browser-use/video-use`](https://github.com/browser-use/video-use) into `${VIDEO_USE_HOME:-$HOME/video-use}` and runs `pip install -e .`.

## 3) Register as a Claude Code skill

```bash
bash setup/install-skill.sh
```

Symlinks the fork into `~/.claude/skills/video-use` per the upstream contract, so Claude Code can load the conversational edit pipeline from any working directory.

## 4) Start work

- Point your agent Working Directory to this exported folder.
- Follow `workers/video-use-studio-operator/CLAUDE.md`.
- Place raw footage in `${VIDEO_USE_HOME}/<project>/` and open Claude Code from that directory.
- Write planning outputs to `output/<client-slug>/<project-slug>/`.
- Rendered video lands at `${VIDEO_USE_HOME}/<project>/edit/final.mp4` per the upstream contract.

## Execution modes

| Mode | When to use |
|---|---|
| `claude-code-skill` | Conversational editing through Claude Code with video-use symlinked as a skill |
| `local-cli` | Direct Python pipeline runs inside the fork (inventory → transcribe → pack → render) |

See `docs/video-use-fork-integration.md` for the upstream pipeline contract.
