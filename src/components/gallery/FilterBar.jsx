const baseButtonClass =
  "px-4 py-1.5 text-sm font-medium uppercase border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";

const FilterBar = ({
  filters,
  activeFilter,
  onFilterChange,
  onSortChange,
  sortLabel,
  filtersLabel,
}) => (
  <div
    className="flex flex-wrap justify-center gap-4 mb-6"
    role="group"
    aria-label={filtersLabel}
  >
    {onSortChange && (
      <button
        type="button"
        className={`${baseButtonClass} border-blue-400 text-gray-600 hover:border-blue-800 hover:text-blue-800 dark:text-gray-300 dark:hover:border-blue-600`}
        onClick={onSortChange}
      >
        {sortLabel}
      </button>
    )}

    {filters.map(({ value, label }) => (
      <button
        key={value}
        type="button"
        className={`${baseButtonClass} ${
          activeFilter === value
            ? "border-blue-600 text-blue-500 shadow-sm"
            : "border-gray-400 text-gray-600 hover:border-gray-700 hover:text-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-400"
        }`}
        onClick={() => onFilterChange(value)}
        aria-pressed={activeFilter === value}
      >
        {label}
      </button>
    ))}
  </div>
);

export default FilterBar;
