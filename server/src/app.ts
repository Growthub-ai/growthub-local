import express, { Router, type Request as ExpressRequest } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode, SurfaceRuntimeContract } from "@paperclipai/shared";
import type { StorageService } from "./storage/types.js";
import { httpLogger, errorHandler } from "./middleware/index.js";
import { actorMiddleware } from "./middleware/auth.js";
import { boardMutationGuard } from "./middleware/board-mutation-guard.js";
import { privateHostnameGuard, resolvePrivateHostnameAllowSet } from "./middleware/private-hostname-guard.js";
import { healthRoutes } from "./routes/health.js";
import { companyRoutes } from "./routes/companies.js";
import { agentRoutes } from "./routes/agents.js";
import { projectRoutes } from "./routes/projects.js";
import { ticketRoutes } from "./routes/tickets.js";
import { issueRoutes } from "./routes/issues.js";
import { executionWorkspaceRoutes } from "./routes/execution-workspaces.js";
import { goalRoutes } from "./routes/goals.js";
import { approvalRoutes } from "./routes/approvals.js";
import { secretRoutes } from "./routes/secrets.js";
import { costRoutes } from "./routes/costs.js";
import { activityRoutes } from "./routes/activity.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { sidebarBadgeRoutes } from "./routes/sidebar-badges.js";
import { knowledgeBaseRoutes } from "./routes/knowledge-base.js";
import { instanceSettingsRoutes } from "./routes/instance-settings.js";
import { llmRoutes } from "./routes/llms.js";
import { assetRoutes } from "./routes/assets.js";
import { accessRoutes } from "./routes/access.js";
import { gtmRoutes } from "./routes/gtm.js";
import { skillRoutes } from "./routes/skills.js";
import { knowledgeImportRoutes } from "./routes/knowledge-import.js";
import { skillsShRoutes } from "./routes/skills-sh.js";
import { kbSkillDocRoutes } from "./routes/kb-skill-docs.js";
import { pluginRoutes } from "./routes/plugins.js";
import { pluginUiStaticRoutes } from "./routes/plugin-ui-static.js";
import { applyUiBranding } from "./ui-branding.js";
import { logger } from "./middleware/logger.js";
import { DEFAULT_LOCAL_PLUGIN_DIR, pluginLoader } from "./services/plugin-loader.js";
import { createPluginWorkerManager } from "./services/plugin-worker-manager.js";
import { createPluginJobScheduler } from "./services/plugin-job-scheduler.js";
import { pluginJobStore } from "./services/plugin-job-store.js";
import { createPluginToolDispatcher } from "./services/plugin-tool-dispatcher.js";
import { pluginLifecycleManager } from "./services/plugin-lifecycle.js";
import { createPluginJobCoordinator } from "./services/plugin-job-coordinator.js";
import { buildHostServices, flushPluginLogBuffer } from "./services/plugin-host-services.js";
import { createPluginEventBus } from "./services/plugin-event-bus.js";
import { setPluginEventBus } from "./services/activity-log.js";
import { createPluginDevWatcher } from "./services/plugin-dev-watcher.js";
import { createPluginHostServiceCleanup } from "./services/plugin-host-service-cleanup.js";
import { pluginRegistryService } from "./services/plugin-registry.js";
import { applyGrowthubCallbackAuth } from "./services/growthub-connection.js";
import { createHostClientHandlers } from "@paperclipai/plugin-sdk";
import type { BetterAuthSessionResult } from "./auth/better-auth.js";
import { readConfigFile, writeConfigFile } from "./config-file.js";

type UiMode = "none" | "static" | "vite-dev";

export function resolveViteHmrPort(serverPort: number): number {
  if (serverPort <= 55_535) {
    return serverPort + 10_000;
  }
  return Math.max(1_024, serverPort - 10_000);
}

export async function createApp(
  db: Db,
  opts: {
    uiMode: UiMode;
    serverPort: number;
    surfaceRuntime: SurfaceRuntimeContract;
    storageService: StorageService;
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    allowedHostnames: string[];
    bindHost: string;
    authReady: boolean;
    companyDeletionEnabled: boolean;
    instanceId?: string;
    hostVersion?: string;
    localPluginDir?: string;
    betterAuthHandler?: express.RequestHandler;
    resolveSession?: (req: ExpressRequest) => Promise<BetterAuthSessionResult | null>;
  },
) {
  const app = express();

  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody: Buffer }).rawBody = buf;
    },
  }));
  app.use(httpLogger);
  const privateHostnameGateEnabled =
    opts.deploymentMode === "authenticated" && opts.deploymentExposure === "private";
  const privateHostnameAllowSet = resolvePrivateHostnameAllowSet({
    allowedHostnames: opts.allowedHostnames,
    bindHost: opts.bindHost,
  });
  app.use(
    privateHostnameGuard({
      enabled: privateHostnameGateEnabled,
      allowedHostnames: opts.allowedHostnames,
      bindHost: opts.bindHost,
    }),
  );
  app.use(
    actorMiddleware(db, {
      deploymentMode: opts.deploymentMode,
      resolveSession: opts.resolveSession,
    }),
  );
  app.get("/api/auth/get-session", (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({
      session: {
        id: `paperclip:${req.actor.source}:${req.actor.userId}`,
        userId: req.actor.userId,
      },
      user: {
        id: req.actor.userId,
        email: null,
        name: req.actor.source === "local_implicit" ? "Local Board" : null,
      },
    });
  });
  app.get("/auth/callback", (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
    const portalBaseUrl = typeof req.query.portalBaseUrl === "string" ? req.query.portalBaseUrl.trim() : "";
    const machineLabel = typeof req.query.machineLabel === "string" ? req.query.machineLabel.trim() : "";
    const workspaceLabel = typeof req.query.workspaceLabel === "string" ? req.query.workspaceLabel.trim() : "";
    if (!token) {
      res.status(400).send("Missing token");
      return;
    }

    let normalizedPortalBaseUrl: string | undefined;
    if (portalBaseUrl) {
      try {
        normalizedPortalBaseUrl = new URL(portalBaseUrl).toString().replace(/\/+$/, "");
      } catch {
        res.status(400).send("Invalid portalBaseUrl");
        return;
      }
    }

    const config = readConfigFile();
    if (!config) {
      res.status(500).send("Growthub config not found");
      return;
    }

    // Preserve the configured base URL while still persisting callback metadata
    // such as growthubPortalBaseUrl, growthubMachineLabel, and growthubWorkspaceLabel.
    writeConfigFile(applyGrowthubCallbackAuth(config, {
      token,
      portalBaseUrl: normalizedPortalBaseUrl,
      machineLabel,
      workspaceLabel,
    }));

    const host = req.get("host");
    const forwardedProto = req.get("x-forwarded-proto");
    const protocol = forwardedProto?.split(",")[0]?.trim() || req.protocol;
    const localAppUrl = host ? `${protocol}://${host}/` : "/";

    res
      .status(200)
      .type("html")
      .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Growthub Connected</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #0b0f14; color: #f5f7fa; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      section { width: min(560px, 100%); background: #121821; border: 1px solid #263244; border-radius: 16px; padding: 24px; box-sizing: border-box; }
      h1 { margin: 0 0 12px; font-size: 22px; }
      p { margin: 0 0 12px; line-height: 1.5; color: #c7d2e0; }
      a { color: #7dd3fc; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Growthub connected</h1>
        <p>The local machine token was saved. This tab will close automatically.</p>
        <p>If it does not close, go back to <a href="${localAppUrl}">the local app</a>.</p>
      </section>
    </main>
    <script>
      try {
        if (window.opener && !window.opener.closed) {
          try { window.opener.location.reload(); } catch {}
          try { window.opener.focus(); } catch {}
          window.close();
        }
      } catch {}
      window.setTimeout(() => {
        window.location.replace(${JSON.stringify(localAppUrl)});
      }, 1200);
    </script>
  </body>
</html>`);
  });
  if (opts.betterAuthHandler) {
    app.all("/api/auth/*authPath", opts.betterAuthHandler);
  }
  app.use(llmRoutes(db));

  // Mount API routes
  const api = Router();
  api.use(boardMutationGuard());
  api.use(
    "/health",
    healthRoutes(db, {
      surfaceProfile: opts.surfaceRuntime.profile,
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      authReady: opts.authReady,
      companyDeletionEnabled: opts.companyDeletionEnabled,
    }),
  );
  const hostServicesDisposers = new Map<string, () => void>();
  const workerManager = createPluginWorkerManager();
  const pluginRegistry = pluginRegistryService(db);
  const eventBus = createPluginEventBus();
  setPluginEventBus(eventBus);
  const jobStore = pluginJobStore(db);
  const lifecycle = pluginLifecycleManager(db, { workerManager });
  const scheduler = createPluginJobScheduler({
    db,
    jobStore,
    workerManager,
  });
  const toolDispatcher = createPluginToolDispatcher({
    workerManager,
    lifecycleManager: lifecycle,
    db,
  });
  const jobCoordinator = createPluginJobCoordinator({
    db,
    lifecycle,
    scheduler,
    jobStore,
  });
  const hostServiceCleanup = createPluginHostServiceCleanup(lifecycle, hostServicesDisposers);
  const loader = pluginLoader(
    db,
    { localPluginDir: opts.localPluginDir ?? DEFAULT_LOCAL_PLUGIN_DIR },
    {
      workerManager,
      eventBus,
      jobScheduler: scheduler,
      jobStore,
      toolDispatcher,
      lifecycleManager: lifecycle,
      instanceInfo: {
        instanceId: opts.instanceId ?? "default",
        hostVersion: opts.hostVersion ?? "0.0.0",
      },
      buildHostHandlers: (pluginId, manifest) => {
        const notifyWorker = (method: string, params: unknown) => {
          const handle = workerManager.getWorker(pluginId);
          if (handle) handle.notify(method, params);
        };
        const services = buildHostServices(db, pluginId, manifest.id, eventBus, notifyWorker);
        hostServicesDisposers.set(pluginId, () => services.dispose());
        return createHostClientHandlers({
          pluginId,
          capabilities: manifest.capabilities,
          services,
        });
      },
    },
  );
  if (opts.surfaceRuntime.capabilities.dxEnabled) {
    api.use("/companies", companyRoutes(db));
    api.use((req, _res, next) => {
      if (req.method === "POST" && /^\/companies\/[^/]+\/agents(-hires)?$/.test(req.path)) {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const existingMeta =
          body.metadata && typeof body.metadata === "object" && body.metadata !== null && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : {};
        const adapterType = String(body.adapterType ?? "codex_local");
        const dxKind =
          typeof existingMeta.dxKind === "string" && existingMeta.dxKind.trim()
            ? existingMeta.dxKind.trim()
            : `dx_adapter:${adapterType}`;
        const dxMetadata: Record<string, unknown> = {
          entity: "agent",
          product: "dx",
          surfaceProfile: "dx",
          dxKind,
          ...existingMeta,
        };
        if (!Object.prototype.hasOwnProperty.call(dxMetadata, "skills")) {
          dxMetadata.skills = [];
        } else if (!Array.isArray(dxMetadata.skills)) {
          dxMetadata.skills = [];
        } else {
          dxMetadata.skills = dxMetadata.skills.filter(
            (s): s is string => typeof s === "string" && s.length > 0,
          );
        }
        req.body = {
          ...body,
          metadata: dxMetadata,
        };
      }
      next();
    });
    api.use(agentRoutes(db));
    api.use(assetRoutes(db, opts.storageService));
    api.use(projectRoutes(db));
    api.use(ticketRoutes(db));
    api.use(issueRoutes(db, opts.storageService));
    api.use(executionWorkspaceRoutes(db));
    api.use(goalRoutes(db));
    api.use(approvalRoutes(db));
    api.use(secretRoutes(db));
    api.use(costRoutes(db));
    api.use(activityRoutes(db));
    api.use(dashboardRoutes(db));
    api.use(sidebarBadgeRoutes(db));
    api.use(instanceSettingsRoutes(db));
    api.use(
      pluginRoutes(
        db,
        loader,
        { scheduler, jobStore },
        { workerManager },
        { toolDispatcher },
        { workerManager },
      ),
    );
    api.use("/gtm", gtmRoutes(db));
    api.use("/gtm/knowledge-base", knowledgeBaseRoutes(db));
    api.use(knowledgeImportRoutes());
    api.use("/skills-sh", skillsShRoutes(db));
    api.use(kbSkillDocRoutes(db));
    api.use(
      accessRoutes(db, {
        deploymentMode: opts.deploymentMode,
        deploymentExposure: opts.deploymentExposure,
        bindHost: opts.bindHost,
        allowedHostnames: opts.allowedHostnames,
      }),
    );
    api.use(skillRoutes(db));
  }
  if (opts.surfaceRuntime.capabilities.gtmEnabled) {
    api.use("/companies", companyRoutes(db));
    api.use((req, _res, next) => {
      if (req.method === "POST" && /^\/companies\/[^/]+\/agents(-hires)?$/.test(req.path)) {
        const prior = req.body?.metadata;
        const meta =
          prior && typeof prior === "object" && prior !== null && !Array.isArray(prior)
            ? ({ ...prior } as Record<string, unknown>)
            : {};
        if (!Object.prototype.hasOwnProperty.call(meta, "skills")) {
          meta.skills = [];
        } else if (!Array.isArray(meta.skills)) {
          meta.skills = [];
        } else {
          meta.skills = meta.skills.filter((s): s is string => typeof s === "string" && s.length > 0);
        }
        req.body = { ...req.body, metadata: { product: "gtm", surfaceProfile: "gtm", ...meta } };
      }
      next();
    });
    api.use(agentRoutes(db));
    api.use(assetRoutes(db, opts.storageService));
    api.use(projectRoutes(db));
    api.use(ticketRoutes(db));
    api.use(issueRoutes(db, opts.storageService));
    api.use(executionWorkspaceRoutes(db));
    api.use(goalRoutes(db));
    api.use(approvalRoutes(db));
    api.use(secretRoutes(db));
    api.use(costRoutes(db));
    api.use(activityRoutes(db));
    api.use(dashboardRoutes(db));
    api.use(sidebarBadgeRoutes(db));
    api.use(instanceSettingsRoutes(db));
    api.use(
      pluginRoutes(
        db,
        loader,
        { scheduler, jobStore },
        { workerManager },
        { toolDispatcher },
        { workerManager },
      ),
    );
    api.use("/gtm", gtmRoutes(db));
    api.use("/gtm/knowledge-base", knowledgeBaseRoutes(db));
    api.use(knowledgeImportRoutes());
    api.use("/skills-sh", skillsShRoutes(db));
    api.use(kbSkillDocRoutes(db));
    api.use(
      accessRoutes(db, {
        deploymentMode: opts.deploymentMode,
        deploymentExposure: opts.deploymentExposure,
        bindHost: opts.bindHost,
        allowedHostnames: opts.allowedHostnames,
      }),
    );
    api.use(skillRoutes(db));
  }
  app.use("/api", api);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });
  app.use(pluginUiStaticRoutes(db, {
    localPluginDir: opts.localPluginDir ?? DEFAULT_LOCAL_PLUGIN_DIR,
  }));

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  if (opts.uiMode === "static") {
    // Try published location first (server/ui-dist/), then monorepo dev location (../../ui/dist)
    const candidates = [
      path.resolve(__dirname, "../ui-dist"),
      path.resolve(__dirname, "../../ui/dist"),
    ];
    const uiDist = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));
    if (uiDist) {
      const indexHtml = applyUiBranding(
        fs.readFileSync(path.join(uiDist, "index.html"), "utf-8"),
        process.env,
        opts.surfaceRuntime.profile,
      );
      app.use(express.static(uiDist, { index: false }));
      app.get(/.*/, (_req, res) => {
        res.status(200).set("Content-Type", "text/html").end(indexHtml);
      });
    } else {
      console.warn("[paperclip] UI dist not found; running in API-only mode");
    }
  }

  if (opts.uiMode === "vite-dev") {
    const uiRoot = path.resolve(__dirname, "../../ui");
    const hmrPort = resolveViteHmrPort(opts.serverPort);
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: uiRoot,
      appType: "custom",
      server: {
        middlewareMode: true,
        hmr: {
          host: opts.bindHost,
          port: hmrPort,
          clientPort: hmrPort,
        },
        allowedHosts: privateHostnameGateEnabled ? Array.from(privateHostnameAllowSet) : undefined,
      },
    });

    app.use(vite.middlewares);
    app.get(/.*/, async (req, res, next) => {
      try {
        const templatePath = path.resolve(uiRoot, "index.html");
        const template = fs.readFileSync(templatePath, "utf-8");
        const html = applyUiBranding(
          await vite.transformIndexHtml(req.originalUrl, template),
          process.env,
          opts.surfaceRuntime.profile,
        );
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (err) {
        next(err);
      }
    });
  }

  app.use(errorHandler);

  jobCoordinator.start();
  scheduler.start();
  void toolDispatcher.initialize().catch((err) => {
    logger.error({ err }, "Failed to initialize plugin tool dispatcher");
  });
  const devWatcher = opts.uiMode === "vite-dev"
    ? createPluginDevWatcher(
      lifecycle,
      async (pluginId) => (await pluginRegistry.getById(pluginId))?.packagePath ?? null,
    )
    : null;
  void loader.loadAll().then((result) => {
    if (!result) return;
    for (const loaded of result.results) {
      if (devWatcher && loaded.success && loaded.plugin.packagePath) {
        devWatcher.watch(loaded.plugin.id, loaded.plugin.packagePath);
      }
    }
  }).catch((err) => {
    logger.error({ err }, "Failed to load ready plugins on startup");
  });
  process.once("exit", () => {
    devWatcher?.close();
    hostServiceCleanup.disposeAll();
    hostServiceCleanup.teardown();
  });
  process.once("beforeExit", () => {
    void flushPluginLogBuffer();
  });

  return app;
}
