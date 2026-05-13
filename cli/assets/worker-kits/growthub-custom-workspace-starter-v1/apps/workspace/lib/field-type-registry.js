/**
 * Canonical field type metadata for governed Data Model objects (AWaC V1).
 * Consumed by the Data Model UI and by workspace-schema validation.
 */

export const FIELD_TYPE_REGISTRY = {
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
  name: { label: "Name", icon: "👤", composite: true, subFields: ["firstName", "lastName"] },
  address: {
    label: "Address",
    icon: "📍",
    composite: true,
    subFields: ["street", "city", "state", "country", "postalCode"]
  },
  links: { label: "Links", icon: "🔗", composite: true, subFields: ["primaryUrl", "primaryLabel"] },
  formula: { label: "Formula", icon: "ƒ", composite: false, hasOptions: false, readOnly: true },
  lookup: { label: "Lookup", icon: "⊕", composite: false, hasOptions: false, readOnly: true, requiresRef: true },
  rollup: { label: "Rollup", icon: "Σ", composite: false, hasOptions: false, readOnly: true, requiresRef: true }
};

export const FIELD_TYPES = Object.keys(FIELD_TYPE_REGISTRY);

export const REF_CARDINALITIES = ["one-to-one", "many-to-one", "one-to-many", "many-to-many"];

export const ROLLUP_AGGREGATIONS = ["count", "sum", "min", "max"];

/** @param {string} type */
export function isFieldType(type) {
  return typeof type === "string" && FIELD_TYPE_REGISTRY[type] !== undefined;
}
