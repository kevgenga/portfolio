import { FiGrid, FiList } from "react-icons/fi";

export default function IllustrationViewControls({ view, onChange, labels }) {
  return (
    <div className="illustration-view-controls">
      {[["cards", FiGrid], ["compact", FiList]].map(([value, Icon]) => (
        <button
          key={value}
          type="button"
          className={`filter-button illustration-view-button ${view === value ? "filter-button--active" : ""}`}
          aria-label={labels[value]}
          title={labels[value]}
          aria-pressed={view === value}
          onClick={() => onChange(value)}
        >
          <Icon aria-hidden="true" focusable="false" />
        </button>
      ))}
    </div>
  );
}
