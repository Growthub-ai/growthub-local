import * as React from "react";
import * as ReactDOM from "react-dom";
import { BrowserRouter } from "@/lib/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@/App";
import { CompanyProvider } from "@/context/CompanyContext";
import { LiveUpdatesProvider } from "@/context/LiveUpdatesProvider";
import { BreadcrumbProvider } from "@/context/BreadcrumbContext";
import { PanelProvider } from "@/context/PanelContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { DialogProvider } from "@/context/DialogContext";
import { ToastProvider } from "@/context/ToastContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initPluginBridge } from "@/plugins/bridge-init";
import { PluginLauncherProvider } from "@/plugins/launchers";

initPluginBridge(React, ReactDOM);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

export function DxRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CompanyProvider>
          <ToastProvider>
            <LiveUpdatesProvider>
              <BrowserRouter>
                <TooltipProvider>
                  <BreadcrumbProvider>
                    <SidebarProvider>
                      <PanelProvider>
                        <PluginLauncherProvider>
                          <DialogProvider>
                            <App />
                          </DialogProvider>
                        </PluginLauncherProvider>
                      </PanelProvider>
                    </SidebarProvider>
                  </BreadcrumbProvider>
                </TooltipProvider>
              </BrowserRouter>
            </LiveUpdatesProvider>
          </ToastProvider>
        </CompanyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
