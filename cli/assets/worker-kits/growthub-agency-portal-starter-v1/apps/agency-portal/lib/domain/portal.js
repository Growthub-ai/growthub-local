const portalCapabilities = [
  { id: "dashboard", label: "Dashboard", metric: "Live agency snapshot", description: "Revenue, client health, overdue work, and next actions." },
  { id: "clients", label: "Clients", metric: "Profiles and onboarding", description: "Client records, notes, KPIs, lifecycle state, and contacts." },
  { id: "pipeline", label: "Pipeline", metric: "Opportunities", description: "Lead stages, potential value, won/lost state, and follow-up ownership." },
  { id: "content", label: "Content", metric: "Calendar", description: "Client content plans by channel, due date, owner, and status." },
  { id: "tasks", label: "Tasks", metric: "Execution queue", description: "Priorities, recurring templates, due dates, and completion state." },
  { id: "finance", label: "Finance", metric: "Invoices and expenses", description: "Billing state, expenses, payment status, and retainer visibility." },
  { id: "reports", label: "Reports", metric: "Performance reviews", description: "Ad and campaign reporting through a pluggable reporting adapter." },
  { id: "metrics", label: "Metrics", metric: "Agency health", description: "Period-over-period MRR, churn, pipeline, and workload indicators." },
  { id: "client-results", label: "Client Results", metric: "Windsor reporting", description: "Blended data pipelines for Meta, Shopify, GA4, and Google Sheets-backed reports." },
  { id: "operations", label: "Operations", metric: "SOP library", description: "Internal documentation, quick links, workflows, and process memory." },
  { id: "settings", label: "Settings", metric: "Workspace control", description: "Branding, adapter selections, deployment metadata, and user preferences." }
];
export {
  portalCapabilities
};
