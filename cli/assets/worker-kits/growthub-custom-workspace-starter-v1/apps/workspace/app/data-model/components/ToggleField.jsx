"use client";

export function ToggleField({ checked, disabled, label, onChange, description }) {
  return (
    <label className="dm-check-row">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {label}
        {description && <span className="dm-cell-empty" style={{ display: "block", marginTop: 4 }}>{description}</span>}
      </span>
    </label>
  );
}

export function SegmentedToggle({ value, options, disabled, onChange, label, name = "segmented" }) {
  const group = String(name || "segmented");
  return (
    <div className="dm-record-field">
      {label && <span>{label}</span>}
      <div className="dm-radio-row">
        {options.map((opt) => (
          <label key={opt}>
            <input
              type="radio"
              name={group}
              checked={value === opt}
              disabled={disabled}
              onChange={() => onChange(opt)}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
