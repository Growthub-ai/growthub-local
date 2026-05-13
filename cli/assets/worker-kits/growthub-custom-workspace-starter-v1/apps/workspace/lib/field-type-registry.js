/**
 * Canonical field-type registry for governed Data Model objects.
 * Mirrors the Twenty CRM pattern (one map entry per type) without NestJS/GraphQL.
 */

const FIELD_TYPE_REGISTRY = {
  text: { label: "Text", icon: "T", composite: false, hasOptions: false },
  longText: { label: "Long Text", icon: "¶", composite: false, hasOptions: false },
  email: { label: "Email", icon: "✉", composite: false, hasOptions: false },
  phone: { label: "Phone", icon: "☏", composite: false, hasOptions: false },
  url: { label: "URL", icon: "🔗", composite: false, hasOptions: false },
  number: { label: "Number", icon: "#", composite: false, hasOptions: false },
  currency: { label: "Currency", icon: "$", composite: false, hasOptions: false },
  rating: { label: "Rating", icon: "★", composite: false, hasOptions: false },
  date: { label: "Date", icon: "📅", composite: false, hasOptions: false },
  dateTime: { label: "Date & Time", icon: "🕐", composite: false, hasOptions: false },
  boolean: { label: "Checkbox", icon: "☑", composite: false, hasOptions: false },
  select: { label: "Status/Stage", icon: "◉", composite: false, hasOptions: true },
  multiSelect: { label: "Tags", icon: "🏷", composite: false, hasOptions: true },
  ref: { label: "Reference", icon: "⟶", composite: false, hasOptions: false, isRef: true },
  multiRef: { label: "Multi-Ref", icon: "⟹", composite: false, hasOptions: false, isRef: true },
  name: { label: "Name", icon: "👤", composite: true, hasOptions: false, subFields: ["firstName", "lastName"] },
  address: {
    label: "Address",
    icon: "📍",
    composite: true,
    hasOptions: false,
    subFields: ["street", "city", "state", "country", "postalCode"]
  },
  links: { label: "Links", icon: "🔗", composite: true, hasOptions: false, subFields: ["primaryUrl", "primaryLabel"] },
  formula: { label: "Formula", icon: "ƒ", composite: false, hasOptions: false, readOnly: true },
  lookup: { label: "Lookup", icon: "⊕", composite: false, hasOptions: false, readOnly: true, requiresRef: true },
  rollup: { label: "Rollup", icon: "Σ", composite: false, hasOptions: false, readOnly: true, requiresRef: true }
};

const FIELD_TYPE_KEYS = Object.keys(FIELD_TYPE_REGISTRY);

const REF_LIKE_TYPES = new Set(["ref", "multiRef"]);
const LOOKUP_TYPES = new Set(["lookup", "rollup"]);

const CARDINALITY_VALUES = ["one-to-one", "many-to-one", "one-to-many", "many-to-many"];

const TYPE_GROUPS = [
  { group: "Text", types: ["text", "longText", "email", "phone", "url"] },
  { group: "Number", types: ["number", "currency", "rating"] },
  { group: "Date", types: ["date", "dateTime"] },
  { group: "Choice", types: ["boolean", "select", "multiSelect"] },
  { group: "Reference", types: ["ref", "multiRef", "lookup", "rollup"] },
  { group: "Composite", types: ["name", "address", "links"] },
  { group: "Computed", types: ["formula"] }
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fieldMeta(type) {
  return FIELD_TYPE_REGISTRY[type] || null;
}

export {
  CARDINALITY_VALUES,
  FIELD_TYPE_KEYS,
  FIELD_TYPE_REGISTRY,
  LOOKUP_TYPES,
  REF_LIKE_TYPES,
  TYPE_GROUPS,
  fieldMeta,
  isPlainObject
};
