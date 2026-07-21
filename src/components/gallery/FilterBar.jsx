const baseButtonClass =
  "inline-flex items-baseline gap-1 border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b4035] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#171716]";

const FilterBar = ({
  filters,
  activeFilter,
  onFilterChange,
  onSortChange,
  sortLabel,
  filtersLabel,
}) => (
  <div
    className="mb-10 flex flex-wrap gap-2"
    role="group"
    aria-label={filtersLabel}
  >
    {onSortChange && (
      <button
        type="button"
        className={`${baseButtonClass} border-[#9b4035] text-[#9b4035] hover:bg-[#9b4035] hover:text-white`}
        onClick={onSortChange}
      >
        {sortLabel}
      </button>
    )}

    {filters.map(({ value, label, count }) => (
      <button
        key={value}
        type="button"
        className={`${baseButtonClass} ${
          activeFilter === value
            ? "border-[#1d1d1b] bg-[#1d1d1b] text-white dark:border-[#f4f1eb] dark:bg-[#f4f1eb] dark:text-[#1d1d1b]"
            : "border-black/15 text-[#5d5a55] hover:border-[#1d1d1b] hover:text-[#1d1d1b] dark:border-white/20 dark:text-[#c8c3ba] dark:hover:border-white dark:hover:text-white"
        }`}
        onClick={() => onFilterChange(value)}
        aria-pressed={activeFilter === value}
      >
        <span>{label}</span>
        {Number.isInteger(count) && (
          <span className="text-[0.65rem] tracking-normal opacity-60">({count})</span>
        )}
      </button>
    ))}
  </div>
);

export default FilterBar;
