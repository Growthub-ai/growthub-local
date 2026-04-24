import React from "react";

export default function App() {
  return (
    <main className="starter">
      <header className="starter-header">
        <h1>Growthub Custom Workspace Starter</h1>
        <p className="starter-subtitle">
          A Vite + React shell wired to the Self-Healing Fork Sync Agent.
        </p>
      </header>
      <section className="starter-grid">
        <Card title="kit.json" body="Schema v2 — family: studio." />
        <Card title=".growthub-fork/" body="fork.json · policy.json · trace.jsonl · jobs/" />
        <Card title="workers/" body="agency-portal-operator — the agent contract." />
        <Card title="studio/" body="This shell. Extend src/views/ with your own React." />
      </section>
      <footer className="starter-footer">
        Next:&nbsp;<code>growthub kit fork status &lt;fork-id&gt;</code>
      </footer>
    </main>
  );
}

function Card({ title, body }) {
  return (
    <article className="starter-card">
      <h2>{title}</h2>
      <p>{body}</p>
    </article>
  );
}
