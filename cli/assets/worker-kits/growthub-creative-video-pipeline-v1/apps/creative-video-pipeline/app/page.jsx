import { readAdapterConfig } from "@/lib/adapters/env";
import { describeGenerativeAdapter } from "@/lib/adapters/generative/index";
import { pipelineStages } from "@/lib/domain/pipeline";
import Link from "next/link";

const nav = [
  { href: "#pipeline", label: "Pipeline" },
  { href: "#brief", label: "Brief" },
  { href: "#generative", label: "Generative" },
  { href: "#edit", label: "Edit" },
  { href: "/settings/keys", label: "API Keys" },
];

function Home() {
  const config = readAdapterConfig();
  const generative = describeGenerativeAdapter();

  return <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">CV</span>
          <span>Creative Video Pipeline</span>
        </div>
        <nav className="nav">
          {nav.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          Governed worker kit
        </div>
      </aside>

      <section className="main">
        <div className="utility-bar">
          <div>
            <strong>Creative Video Pipeline</strong>
            <span>Brief → Generate → Edit — governed workspace with local Vite shell and Vercel parity.</span>
          </div>
          <div className="utility-actions">
            <Link href="/settings/keys">API Keys</Link>
            <span className="pill">v1 kit</span>
          </div>
        </div>

        <div className="page-heading" id="pipeline">
          <p className="eyebrow">Three-stage pipeline</p>
          <h1>Brief to final video.</h1>
          <p>
            Brand-grounded brief, generative image/video via{" "}
            <strong>{config.generativeAdapter}</strong>, and transcript-anchored editing
            via the video-use fork — outputs governed across all three stages.
          </p>
          <span className="badge">adapter: {generative.label}</span>
        </div>

        <section className="pipeline-strip" id="pipeline-stages">
          {pipelineStages.map((stage) => <article className="stage-card" id={stage.id} key={stage.id}>
              <span className="stage-step">{stage.step}</span>
              <strong>{stage.label}</strong>
              <p>{stage.description}</p>
              <code>{stage.outputPath}</code>
              <span className="stage-status pending">pending</span>
            </article>)}
        </section>

        <section className="hero-grid">
          <article className="hero-card primary">
            <p className="card-label">Generative adapter</p>
            <strong>{config.generativeAdapter}</strong>
            <p>{generative.description}</p>
          </article>
          <article className="hero-card">
            <p className="card-label">Video-use fork</p>
            <strong>{config.videoUseHome ? "configured" : "not set"}</strong>
            <p className="muted">VIDEO_USE_HOME resolves the video-use clone for Stage 3.</p>
          </article>
          <article className="hero-card">
            <p className="card-label">ElevenLabs Scribe</p>
            <strong>{config.hasElevenLabsKey ? "key set" : "key missing"}</strong>
            <p className="muted">Required for Stage 3 word-level transcription.</p>
          </article>
        </section>

        <section className="ops-strip">
          <article>
            <span>01</span>
            <strong>Brand Kit</strong>
            <p>Scene structure and hooks sourced from brand-kit.md only.</p>
          </article>
          <article>
            <span>02</span>
            <strong>CLI Pipeline</strong>
            <p>growthub pipeline execute → CMS video-generation node.</p>
          </article>
          <article>
            <span>03</span>
            <strong>video-use Fork</strong>
            <p>Scribe → word-boundary EDL → FFmpeg → final.mp4.</p>
          </article>
          <article>
            <span>04</span>
            <strong>Governed</strong>
            <p>project.md + trace.jsonl at every stage boundary.</p>
          </article>
        </section>

        <section className="adapter-grid" aria-label="Adapter paths">
          <article className="card">
            <h3>growthub-pipeline (primary)</h3>
            <p>Routes through hosted CMS video-generation node. Requires GROWTHUB_BRIDGE_ACCESS_TOKEN + auth.</p>
          </article>
          <article className="card">
            <h3>byo-api-key (secondary)</h3>
            <p>Explicit provider SDK calls. Set VIDEO_MODEL_PROVIDER (veo | fal | runway) + key. Same artifact contract.</p>
          </article>
        </section>
      </section>

      <aside className="quick-actions">
        <button type="button">Run Stage 1 — Brief</button>
        <button type="button">Run Stage 2 — Generate</button>
        <button type="button">Run Stage 3 — Edit</button>
        <button type="button">
          <Link href="/settings/keys">Configure API Keys</Link>
        </button>
      </aside>
    </main>;
}
export {
  Home as default
};
