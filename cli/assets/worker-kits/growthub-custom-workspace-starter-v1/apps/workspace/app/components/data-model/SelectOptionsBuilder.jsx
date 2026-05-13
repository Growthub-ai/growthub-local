"use client";

const OPTION_COLOR_PALETTE = [
  "#94a3b8", "#60a5fa", "#34d399", "#f87171",
  "#a78bfa", "#fb923c", "#38bdf8", "#fbbf24",
  "#818cf8", "#f472b6", "#2dd4bf", "#a3e635"
];

export function SelectOptionsBuilder({ options, onChange }) {
  const addOption = () => {
    const newOpt = {
      id: `opt_${Date.now().toString(36)}`,
      label: "",
      color: OPTION_COLOR_PALETTE[options.length % OPTION_COLOR_PALETTE.length]
    };
    onChange([...(options || []), newOpt]);
  };

  return (
    <div className="dm-options-builder">
      <label className="dm-field-label-v2">
        <span>Options</span>
      </label>
      {(options || []).map((opt, i) => (
        <div key={opt.id} className="dm-option-row">
          <input
            type="color"
            aria-label="Option color"
            value={/^#[0-9a-fA-F]{6}$/.test(opt.color) ? opt.color : "#94a3b8"}
            onChange={(e) => {
              const next = [...options];
              next[i] = { ...opt, color: e.target.value };
              onChange(next);
            }}
          />
          <input
            type="text"
            className="dm-input-v2"
            value={opt.label}
            placeholder="Option label"
            onChange={(e) => {
              const next = [...options];
              next[i] = { ...opt, label: e.target.value };
              onChange(next);
            }}
          />
          <button type="button" className="dm-btn-ghost" aria-label="Remove option" onClick={() => onChange(options.filter((o) => o.id !== opt.id))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="dm-btn-outline" onClick={addOption}>
        + Add option
      </button>
    </div>
  );
}
