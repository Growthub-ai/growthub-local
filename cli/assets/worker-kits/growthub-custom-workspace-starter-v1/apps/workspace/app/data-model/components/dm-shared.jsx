"use client";

import {
  Activity,
  BarChart2,
  Box,
  Brain,
  Building2,
  Calendar,
  CheckSquare,
  Code2,
  Database,
  FileText,
  Globe,
  Hash,
  Layers,
  Link2,
  List,
  Mail,
  Plus,
  ShoppingCart,
  Star,
  Tag,
  Terminal,
  ToggleLeft,
  Type,
  Users,
  Zap,
} from "lucide-react";
import { OBJECT_TYPE_PRESETS } from "@/lib/workspace-data-model";

const LUCIDE_MAP = {
  Activity, BarChart2, Box, Brain, Building2, Calendar, CheckSquare, Code2,
  Database, FileText, Globe, Hash, Layers, Link2, List, Mail, Plus,
  ShoppingCart, Star, Tag, Terminal, ToggleLeft, Type, Users, Zap,
};

const ICON_PICKER_SET = [
  "Database", "Globe", "Code2", "Users", "CheckSquare", "Building2",
  "Tag", "Star", "Zap", "FileText", "Mail", "BarChart2",
  "Layers", "Box", "Activity", "ShoppingCart", "Terminal", "Brain",
];

const OBJECT_TYPE_BADGE = {
  "data-source":         { label: "Data Source",         cls: "dm-badge-datasource" },
  "api-registry":        { label: "API Registry",        cls: "dm-badge-registry" },
  "sandbox-environment": { label: "Sandbox Environment", cls: "dm-badge-sandbox" },
  "distillation-pipeline": { label: "Distillation Pipeline", cls: "dm-badge-distillation" },
  people:                { label: "People",              cls: "dm-badge-people" },
  tasks:                 { label: "Tasks",               cls: "dm-badge-tasks" },
  custom:                { label: "Custom",              cls: "dm-badge-manual" },
};

const FIELD_TYPE_ICON_NAMES = {
  text: "Type", number: "Hash", date: "Calendar", url: "Link2", select: "List", boolean: "ToggleLeft",
};

function LucideIcon({ name, size = 14, className, style }) {
  const Icon = LUCIDE_MAP[name] || Database;
  return <Icon size={size} className={className} style={style} aria-hidden="true" />;
}

function inferFieldType(name) {
  const n = name.toLowerCase();
  if (n.includes("date") || n.includes("_at") || n.includes("created") || n.includes("updated")) return "date";
  if (n.includes("url") || n.includes("link") || n.includes("website") || n === "endpoint" || n === "baseurl") return "url";
  if (n.includes("count") || n.includes("num") || n.includes("amount") || n.includes("arr") || n.includes("price")) return "number";
  if (n === "status" || n === "stage" || n === "type" || n === "icp" || n === "priority" || n === "authtype" || n === "method") return "select";
  if (n.startsWith("is_") || n.includes("active") || n.includes("enabled")) return "boolean";
  return "text";
}

function pluralize(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function objectTypeBadge(objectType) {
  return OBJECT_TYPE_BADGE[objectType] || OBJECT_TYPE_BADGE.custom;
}

function textColorForAccent(accent) {
  const hex = String(accent || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#252525" : "#ffffff";
}

export {
  FIELD_TYPE_ICON_NAMES,
  ICON_PICKER_SET,
  LUCIDE_MAP,
  LucideIcon,
  OBJECT_TYPE_BADGE,
  OBJECT_TYPE_PRESETS,
  inferFieldType,
  objectTypeBadge,
  pluralize,
  textColorForAccent
};
