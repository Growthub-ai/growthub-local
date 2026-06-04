"use client";

import { createContext, useContext, useState } from "react";
import { ChevronDown } from "lucide-react";

const SettingsAccordionContext = createContext(null);

function SettingsAccordionGroup({ defaultOpenId, children }) {
  const [openId, setOpenId] = useState(defaultOpenId || null);
  return <SettingsAccordionContext.Provider value={{ openId, setOpenId }}>
    {children}
  </SettingsAccordionContext.Provider>;
}

function SettingsAccordionSection({ id, title, summary, className = "", defaultOpen = false, children }) {
  const group = useContext(SettingsAccordionContext);
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = group ? group.openId === id : localOpen;
  const sectionClass = [
    "workspace-settings-section",
    "workspace-settings-accordion",
    open ? "is-open" : "is-collapsed",
    className
  ].filter(Boolean).join(" ");
  const toggle = () => {
    if (group) {
      group.setOpenId(open ? null : id);
      return;
    }
    setLocalOpen((value) => !value);
  };

  return <section className={sectionClass}>
    <button
      type="button"
      className="workspace-settings-accordion-trigger"
      aria-expanded={open}
      onClick={toggle}
    >
      <span>
        <h3>{title}</h3>
        {summary ? <em>{summary}</em> : null}
      </span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {open ? <div className="workspace-settings-accordion-body">{children}</div> : null}
  </section>;
}

export { SettingsAccordionGroup, SettingsAccordionSection };
