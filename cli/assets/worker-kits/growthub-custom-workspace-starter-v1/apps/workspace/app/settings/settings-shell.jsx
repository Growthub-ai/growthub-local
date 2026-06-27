import Link from "next/link";
import { X } from "lucide-react";

const SETTINGS_TABS = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/apis-webhooks", label: "APIs & Webhooks" },
  { href: "/settings/add-ons", label: "Marketplace" },
  { href: "/settings/apps", label: "Apps" },
  { href: "/settings/ownership", label: "Ownership" }
];

function SettingsShell({ active, eyebrow, title, children, aside }) {
  return <main className="workspace-settings-shell">
    <header className="workspace-settings-topbar">
      <Link className="workspace-settings-exit" href="/" aria-label="Exit settings" title="Exit Settings">
        <X size={16} aria-hidden="true" />
      </Link>
      <nav className="workspace-settings-tabs" aria-label="Settings navigation">
        {SETTINGS_TABS.map((tab) => <Link
          className={active === tab.href ? "active" : undefined}
          href={tab.href}
          key={tab.href}
        >{tab.label}</Link>)}
      </nav>
      {aside ? <div className="workspace-settings-aside">{aside}</div> : null}
    </header>
    <section className="workspace-settings-main">
      {children}
    </section>
  </main>;
}

export {
  SettingsShell
};
