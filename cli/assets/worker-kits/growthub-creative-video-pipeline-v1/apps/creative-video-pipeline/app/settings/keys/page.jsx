import { readAdapterConfig } from "@/lib/adapters/env";
import Link from "next/link";

const KEYS = [
  {
    env: "CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER",
    label: "Generative Adapter",
    badge: "required",
    note: "growthub-pipeline (default) or byo-api-key",
  },
  {
    env: "GROWTHUB_BRIDGE_ACCESS_TOKEN",
    label: "Bridge Access Token",
    badge: "required",
    note: "Required for growthub-pipeline adapter. Obtain from Growthub dashboard.",
  },
  {
    env: "GROWTHUB_BRIDGE_BASE_URL",
    label: "Bridge Base URL",
    badge: "required",
    note: "Required for growthub-pipeline adapter. e.g. https://api.growthub.ai",
  },
  {
    env: "ELEVENLABS_API_KEY",
    label: "ElevenLabs API Key",
    badge: "required",
    note: "Required for Stage 3 word-level transcription via Scribe.",
  },
  {
    env: "VIDEO_MODEL_PROVIDER",
    label: "Video Model Provider",
    badge: "conditional",
    note: "Required for byo-api-key adapter. One of: veo | fal | runway",
  },
  {
    env: "GOOGLE_AI_API_KEY",
    label: "Google AI API Key",
    badge: "conditional",
    note: "Required when VIDEO_MODEL_PROVIDER=veo",
  },
  {
    env: "FAL_API_KEY",
    label: "Fal API Key",
    badge: "conditional",
    note: "Required when VIDEO_MODEL_PROVIDER=fal",
  },
  {
    env: "RUNWAY_API_KEY",
    label: "Runway API Key",
    badge: "conditional",
    note: "Required when VIDEO_MODEL_PROVIDER=runway",
  },
  {
    env: "VIDEO_USE_HOME",
    label: "VIDEO_USE_HOME",
    badge: "required",
    note: "Absolute path to the video-use fork clone. Required for Stage 3.",
  },
  {
    env: "CREATIVE_VIDEO_PIPELINE_HOME",
    label: "Pipeline Home",
    badge: "conditional",
    note: "Override workspace root. Defaults to $HOME/creative-video-pipeline",
  },
];

const SETUP_CARDS = [
  {
    step: "01",
    label: "Copy .env.example",
    code: "cp .env.example .env.local",
  },
  {
    step: "02",
    label: "Set adapter",
    code: "CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER=growthub-pipeline",
  },
  {
    step: "03",
    label: "Clone video-use fork",
    code: "bash setup/clone-fork.sh",
  },
];

function KeysPage() {
  const config = readAdapterConfig();

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">CV</span>
          <span>Creative Video Pipeline</span>
        </div>
        <nav className="nav">
          <Link href="/">Pipeline</Link>
          <Link href="/settings/keys">API Keys</Link>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          Governed worker kit
        </div>
      </aside>

      <section className="main">
        <div className="toolbar-strip">
          <div>
            <strong>API Key Configuration</strong>
            <p>Adapter: <code>{config.generativeAdapter}</code> &mdash; Bridge: {config.hasBridgeToken ? "set" : "missing"} &mdash; ElevenLabs: {config.hasElevenLabsKey ? "set" : "missing"}</p>
          </div>
          <Link href="/">← Back to Pipeline</Link>
        </div>

        <div className="page-heading">
          <p className="eyebrow">Configuration</p>
          <h1>API Keys</h1>
          <p>
            Set these variables in <code>.env.local</code> (local dev) or Vercel environment settings (production).
            Growthub-pipeline adapter requires the Bridge token. BYOK requires a provider key. Stage 3 always requires ElevenLabs.
          </p>
        </div>

        <div className="setup-grid">
          {SETUP_CARDS.map((card) => (
            <article className="setup-card" key={card.step}>
              <span>{card.step}</span>
              <strong>{card.label}</strong>
              <code>{card.code}</code>
            </article>
          ))}
        </div>

        <div className="key-board">
          {KEYS.map((key) => (
            <div className="key-row" key={key.env}>
              <div className="key-row-top">
                <code>{key.env}</code>
                <span className={`key-badge ${key.badge}`}>{key.badge}</span>
              </div>
              <p>{key.note}</p>
            </div>
          ))}
        </div>

        <p className="settings-note">
          Never commit secrets. Use <code>.env.local</code> locally and Vercel environment variables for deployment.
          The <code>.env.example</code> file in the kit root documents all variables without values.
        </p>
      </section>
    </main>
  );
}

export default KeysPage;
