"use client";

import "./globals.css";

function GlobalError() {
  return <html lang="en">
    <body>
      <main className="workspace-error-page">
        <section>
          <h1>Workspace unavailable</h1>
          <p>Reload the workspace or return to the dashboard.</p>
          <a href="/">Open workspace</a>
        </section>
      </main>
    </body>
  </html>;
}

export {
  GlobalError as default
};
