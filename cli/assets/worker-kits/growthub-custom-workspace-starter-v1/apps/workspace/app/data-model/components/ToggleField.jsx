"use client";

export function ToggleField({ checked, disabled, label, onChange, description }) {
  return (
    <label className={`dm-switch-row${disabled ? " is-disabled" : ""}`}>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="dm-switch-track" aria-hidden="true" />
      <span className="dm-switch-label">
        <span>{label}</span>
        {description && <span className="dm-switch-desc">{description}</span>}
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
