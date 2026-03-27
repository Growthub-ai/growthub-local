import * as React from "react";
import * as ReactDOM from "react-dom";
import { BrowserRouter } from "@/lib/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/context/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompanyProvider } from "@/context/CompanyContext";
import { BreadcrumbProvider } from "@/context/BreadcrumbContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { DialogProvider } from "@/context/DialogContext";
import { ToastProvider } from "@/context/ToastContext";
import { LiveUpdatesProvider } from "@/context/LiveUpdatesProvider";
import { PanelProvider } from "@/context/PanelContext";
import { initPluginBridge } from "@/plugins/bridge-init";
import { PluginLauncherProvider } from "@/plugins/launchers";
import { GtmApp } from "@/gtm/App";
import { NewIssueDialog } from "@/components/NewIssueDialog";
import { OnboardingWizard } from "@/components/OnboardingWizard";

initPluginBridge(React, ReactDOM);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

export function GtmRoot() {
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
                            <GtmApp />
                            <NewIssueDialog />
                            <OnboardingWizard />
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
