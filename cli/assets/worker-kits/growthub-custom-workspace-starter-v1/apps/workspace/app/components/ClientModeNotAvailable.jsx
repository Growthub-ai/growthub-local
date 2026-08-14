import Link from "next/link";

/**
 * Honest not-available state for operator surfaces in client mode
 * (client-interface-v1). Absence of surface, not a disabled button: the
 * page says plainly that this workspace does not expose the surface and
 * routes the visitor back to their app home. No existence signals about
 * what the operator surface would contain.
 */
export function ClientModeNotAvailable({ surface = "This page" }) {
  return (
    <main className="workspace-shell" style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <div style={{ textAlign: "center", maxWidth: 420, padding: "2rem" }}>
        <h1 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>Not available in this app</h1>
        <p style={{ opacity: 0.75, fontSize: "0.9rem", lineHeight: 1.5 }}>
          {surface} is not part of this app&apos;s client surface.
        </p>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/">Back to home</Link>
        </p>
      </div>
    </main>
  );
}
