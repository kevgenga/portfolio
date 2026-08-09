const FilterBar = ({
  filters,
  activeFilter,
  onFilterChange,
  onSortChange,
  sortLabel,
  filtersLabel,
}) => (
  <div className="filter-bar" role="group" aria-label={filtersLabel}>
    {onSortChange && (
      <button type="button" className="filter-button filter-button--sort" onClick={onSortChange}>
        {sortLabel}
      </button>
    )}

    {filters.map(({ value, label, count }) => (
      <button
        key={value}
        type="button"
        className={`filter-button ${activeFilter === value ? "filter-button--active" : ""}`}
        onClick={() => onFilterChange(value)}
        aria-pressed={activeFilter === value}
      >
        <span>{label}</span>
        {Number.isInteger(count) && <span className="text-[0.62rem] opacity-60">({count})</span>}
      </button>
    ))}
  </div>
);

export default FilterBar;
