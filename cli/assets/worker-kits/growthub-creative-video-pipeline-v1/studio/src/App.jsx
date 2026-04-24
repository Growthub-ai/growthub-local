import React, { useState } from "react";

const stages = [
  {
    id: "brief",
    label: "Brief",
    step: "01",
    description: "Brand kit → scene structure → hooks → pipeline-brief.md",
    outputPath: "output/<client>/<project>/brief/pipeline-brief.md",
  },
  {
    id: "generative",
    label: "Generate",
    step: "02",
    description: "growthub pipeline execute → image/video artifacts",
    outputPath: "output/<client>/<project>/generative/manifest.json",
  },
  {
    id: "edit",
    label: "Edit",
    step: "03",
    description: "video-use fork → ElevenLabs Scribe → EDL → FFmpeg → final.mp4",
    outputPath: "output/<client>/<project>/final/final.mp4",
  },
];

const adapterDocs = [
  ["growthub-pipeline", "Routes through growthub pipeline execute + CMS video-generation node. Requires GROWTHUB_BRIDGE_ACCESS_TOKEN."],
  ["byo-api-key", "Routes through explicit provider SDK. Set VIDEO_MODEL_PROVIDER (veo | fal | runway) + provider key."],
];

const providerKeys = [
  ["ELEVENLABS_API_KEY", "Required for Stage 3 — ElevenLabs Scribe transcription", true],
  ["GROWTHUB_BRIDGE_ACCESS_TOKEN", "growthub-pipeline adapter — from growthub auth login", false],
  ["GOOGLE_AI_API_KEY", "BYOK: VIDEO_MODEL_PROVIDER=veo", false],
  ["FAL_API_KEY", "BYOK: VIDEO_MODEL_PROVIDER=fal", false],
  ["RUNWAY_API_KEY", "BYOK: VIDEO_MODEL_PROVIDER=runway", false],
];

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">CV</span>
          <span>Creative Video Pipeline</span>
        </div>
        <nav className="nav">
          <a href="#pipeline">Pipeline</a>
          <a href="#brief">Brief</a>
          <a href="#generative">Generative</a>
          <a href="#edit">Edit</a>
          <a href="#settings" onClick={(e) => { e.preventDefault(); setSettingsOpen(!settingsOpen); }}>
            Settings
          </a>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          Local Vite shell
        </div>
      </aside>

      <section className="main">
        <div className="utility-bar">
          <div>
            <strong>Growthub Creative Video Pipeline</strong>
            <span>Brief → Generate → Edit — governed workspace with Vite local shell and Vercel app parity.</span>
          </div>
          <div className="utility-actions">
            <a href="#settings" onClick={(e) => { e.preventDefault(); setSettingsOpen(!settingsOpen); }}>
              API Keys
            </a>
            <span className="pill">kit v1</span>
          </div>
        </div>

        <header className="page-heading" id="pipeline">
          <span className="eyebrow">Three-stage pipeline</span>
          <h1>Brief to final video.</h1>
          <p>
            Brand-grounded brief, generative images and video via the growthub pipeline or BYOK provider, and
            transcript-anchored editing via the video-use fork — all in one governed workspace.
          </p>
        </header>

        <section className="pipeline-strip" id="pipeline-stages">
          {stages.map((stage) => (
            <article className="stage-card" key={stage.id} id={stage.id}>
              <span className="stage-step">{stage.step}</span>
              <strong>{stage.label}</strong>
              <p>{stage.description}</p>
              <code>{stage.outputPath}</code>
            </article>
          ))}
        </section>

        <section className="hero-grid">
          <article className="hero-card primary">
            <span>Adapter</span>
            <strong>growthub-pipeline</strong>
            <p>Primary path. Routes through hosted CMS video-generation node (veo-3.1-generate-001). Requires Growthub auth.</p>
          </article>
          <article className="hero-card">
            <span>BYOK</span>
            <strong>byo-api-key</strong>
            <p>Secondary path. Explicit provider keys (Veo / fal / Runway). Normalizes to same artifact contract.</p>
          </article>
          <article className="hero-card">
            <span>Edit</span>
            <strong>video-use fork</strong>
            <p>Stage 3 delegates to VIDEO_USE_HOME. ElevenLabs Scribe + FFmpeg render + self-eval loop.</p>
          </article>
        </section>

        <section className="adapter-grid">
          {adapterDocs.map(([name, desc]) => (
            <article className="card" key={name}>
              <h3>{name}</h3>
              <p>{desc}</p>
            </article>
          ))}
        </section>

        <section className="ops-strip">
          <article>
            <span>01</span>
            <strong>Brand Kit</strong>
            <p>Scene structure and hooks sourced from brand-kit.md — not memory.</p>
          </article>
          <article>
            <span>02</span>
            <strong>CLI Pipeline</strong>
            <p>growthub pipeline execute routes to CMS video-generation node.</p>
          </article>
          <article>
            <span>03</span>
            <strong>video-use Fork</strong>
            <p>Scribe → word-boundary EDL → FFmpeg render → final.mp4.</p>
          </article>
          <article>
            <span>04</span>
            <strong>Governed</strong>
            <p>Every stage appends to project.md and trace.jsonl.</p>
          </article>
        </section>

        {settingsOpen && (
          <section className="settings-panel" id="settings">
            <div className="settings-header">
              <h2>API Key Settings</h2>
              <p>
                Configure the generative adapter and provider keys. Both paths normalize to the same
                GenerativeArtifact[] object. Set keys in your fork&apos;s <code>.env</code> file.
              </p>
            </div>

            <div className="setup-grid">
              <article className="setup-card">
                <span>Primary</span>
                <strong>Growthub Pipeline</strong>
                <p>Set <code>CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER=growthub-pipeline</code> and authenticate via <code>growthub auth login</code>.</p>
                <code>GROWTHUB_BRIDGE_ACCESS_TOKEN</code>
              </article>
              <article className="setup-card">
                <span>Secondary</span>
                <strong>BYOK Provider</strong>
                <p>Set <code>CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER=byo-api-key</code> and <code>VIDEO_MODEL_PROVIDER</code>.</p>
                <code>GOOGLE_AI_API_KEY / FAL_API_KEY / RUNWAY_API_KEY</code>
              </article>
              <article className="setup-card">
                <span>Required</span>
                <strong>ElevenLabs Scribe</strong>
                <p>Required for Stage 3 — word-level transcription for the video-use EDL pipeline.</p>
                <code>ELEVENLABS_API_KEY</code>
              </article>
            </div>

            <div className="key-list">
              {providerKeys.map(([key, desc, required]) => (
                <article className="key-row" key={key}>
                  <div>
                    <code>{key}</code>
                    <span className={`key-badge ${required ? "required" : "optional"}`}>
                      {required ? "required" : "conditional"}
                    </span>
                  </div>
                  <p>{desc}</p>
                </article>
              ))}
            </div>

            <p className="settings-note">
              Keys are read from your fork&apos;s <code>.env</code> file. See <code>.env.example</code> for all available options.
              Never commit API keys to the repo.
            </p>
          </section>
        )}
      </section>

      <aside className="quick-actions">
        <button onClick={() => setSettingsOpen(!settingsOpen)}>Configure API keys</button>
        <button>View brief output</button>
        <button>View generative output</button>
        <button>Open final video</button>
      </aside>
    </main>
  );
}
