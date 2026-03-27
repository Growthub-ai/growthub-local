import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { surfaceProfile } from "@/lib/surface-profile";
import "@mdxeditor/editor/style.css";
import "./index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        void registration.unregister();
      }
    }).catch(() => {});
  });
}

async function loadSurfaceRoot() {
  if (surfaceProfile === "gtm") {
    return import("@/apps/gtm-root").then((mod) => mod.GtmRoot);
  }

  return import("@/apps/dx-root").then((mod) => mod.DxRoot);
}

void loadSurfaceRoot()
  .then((RootComponent) => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <RootComponent />
      </StrictMode>,
    );
  })
  .catch((error) => {
    console.error("Failed to load Growthub app root", error);
  });
