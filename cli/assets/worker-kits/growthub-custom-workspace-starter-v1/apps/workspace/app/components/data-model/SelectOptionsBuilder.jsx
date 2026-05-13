"use client";

const OPTION_COLOR_PALETTE = [
  "#94a3b8", "#60a5fa", "#34d399", "#f87171",
  "#a78bfa", "#fb923c", "#38bdf8", "#fbbf24",
  "#818cf8", "#f472b6", "#2dd4bf", "#a3e635"
];

function ColorSwatchPicker({ value, palette, onChange }) {
  return (
    <div className="dm-swatch-row" role="list">
      {palette.map((c) => (
        <button
          key={c}
          type="button"
          className={`dm-swatch${value === c ? " active" : ""}`}
          style={{ background: c }}
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export function SelectOptionsBuilder({ options, onChange }) {
  function addOption() {
    const newOpt = {
      id: `opt_${Date.now()}`,
      label: "",
      color: OPTION_COLOR_PALETTE[options.length % OPTION_COLOR_PALETTE.length]
    };
    onChange([...options, newOpt]);
  }

  return (
    <div className="dm-options-builder">
      <span className="dm-field-label-v2">Options</span>
      {options.map((opt, i) => (
        <div key={opt.id} className="dm-option-row">
          <ColorSwatchPicker
            value={opt.color}
            palette={OPTION_COLOR_PALETTE}
            onChange={(color) => {
              const next = [...options];
              next[i] = { ...opt, color };
              onChange(next);
            }}
          />
          <input
            type="text"
            value={opt.label}
            placeholder="Option label"
            onChange={(e) => {
              const next = [...options];
              next[i] = { ...opt, label: e.target.value };
              onChange(next);
            }}
          />
          <button type="button" className="dm-btn-icon" onClick={() => onChange(options.filter((o) => o.id !== opt.id))} aria-label="Remove option">×</button>
        </div>
      ))}
      <button type="button" className="dm-btn-ghost" onClick={addOption}>+ Add option</button>
    </div>
  );
}
